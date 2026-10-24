// Workbenches. Every bench is a little stage on a clear work mat: the camera
// settles in close, each step is one physical action, and nothing can fail;
// doing a step nicely only adds quality stars. A finished piece gets a proper
// reveal before it goes into the crate.

import * as THREE from 'three';
import { audio } from './audio.js';
import { litMat, glow, LAYER_NO_INK } from './render.js';
import { candle, lamp, lens, glassPanel, productMesh } from './products.js';
import { CANDLE_FORMS, CANDLE_COLORS, LAMP_BASES, LAMP_SHADES, LAMP_FILTERS, LENS_FORMS, GLASS_PATTERNS, GLASS_COLORS } from './config.js';
import { candleKey, lampKey, lensKey, glassKey, hasLicence, productName, marketPrice } from './state.js';
import { ico, money } from './ui.js';
import { tween, ease, popIn, clamp } from './tween.js';

const $ = (id) => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);

// Per bench: how big the stage is drawn, where the camera sits relative to the work mat, and the steps.
const BENCH = {
  candle: { name: 'Candle Bench', scale: 2.0, cam: V3(-0.04, 0.6, 0.8), look: V3(-0.06, 0.1, 0), steps: ['Mould', 'Colour', 'Pour', 'Wick', 'Cool', 'Unmould'] },
  lamp:   { name: 'Lamp Bench',   scale: 1.6, cam: V3(0, 0.62, 0.86), look: V3(0, 0.22, 0), steps: ['Base', 'Bulb', 'Shade', 'Glow', 'Switch'] },
  lens:   { name: 'Lens Grinder', scale: 2.0, cam: V3(0, 0.58, 0.62), look: V3(0, 0.04, 0), steps: ['Lens', 'Mount', 'Polish', 'Frame'] },
  glass:  { name: 'Glass Table',  scale: 1.8, cam: V3(0, 0.8, 0.5), look: V3(0, 0.02, -0.04), steps: ['Pattern', 'Picture', 'Background', 'Lay glass', 'Solder', 'Lift'] },
};

// Candle sizes in product units (the stage scales them up)
const CANDLE_DIMS = {
  pillar: { r: 0.0405, h: 0.12, mouldR: 0.047, mouldH: 0.135, xs: [0], base: 0 },
  taper:  { r: 0.0105, h: 0.172, mouldR: 0.015, mouldH: 0.185, xs: [-0.025, 0.025], base: 0.012 },
  jar:    { r: 0.04, h: 0.062, mouldR: 0.046, mouldH: 0.096, xs: [0], base: 0.002 },
};

export class Crafting {
  constructor({ world, getState, player, input, ui, onCrafted }) {
    this.world = world;
    this.getState = getState;
    this.player = player;
    this.input = input;
    this.ui = ui;
    this.onCrafted = onCrafted;
    this.active = null;
    this.stage = null;
    this.cleanups = [];
    this.anim = {};              // per-frame actions (pour, swing, spin…)
    this.el = { root: $('station'), title: $('station-title'), step: $('station-step'), ui: $('station-ui'), pips: $('station-pips') };
    $('station-leave').addEventListener('click', () => this.close());
    this.updateCrates();
  }

  get isOpen() { return !!this.active; }

  open(id) {
    const s = this.getState();
    const st = this.world.shop.stations[id];
    const need = { lamp: 'lamps', lens: 'lens', glass: 'glass' }[id];
    if (need && !hasLicence(s, need)) { this.ui.toast(`This bench needs the <b>${{ lamps: 'Lamp Workbench', lens: 'Lens Grinding', glass: 'Stained Glass' }[need]}</b> licence — see the ledger.`, 'i-ledger'); return false; }
    if ((s.supplies[id] || 0) <= 0) {
      const what = { candle: 'Candle Supplies', lamp: 'a Lamp Parts Kit', lens: 'Glass Blanks', glass: 'Coloured Glass' }[id];
      this.ui.toast(`Out of materials — carry <b>${what}</b> to this bench.`, 'i-box');
      return false;
    }
    const B = BENCH[id];
    this.active = { id, st, B, choice: {}, scores: [] };
    this.player.focus({ pos: st.work.clone().add(B.cam), look: st.work.clone().add(B.look) });
    this.input.free = true;
    this.input.exitLock();
    this.el.root.hidden = false;
    this.ui.setHud(false);
    this.ui.setStationTitle(B.name);
    this.restart();
    audio.play('cloth', { volume: 0.4 });
    return true;
  }

  restart() {
    this.resetStage();
    this.active.choice = {};
    this.active.scores = [];
    const id = this.active.id;
    if (id === 'candle') this.candleMould();
    else if (id === 'lamp') this.lampBase();
    else if (id === 'lens') this.lensForm();
    else this.glassPattern();
  }

  close() {
    if (!this.active) return;
    this.clearUI();
    this.removeStage();
    this.active = null;
    this.player.unfocus();
    this.el.root.hidden = true;
    this.el.root.classList.remove('revealing');
    this.ui.setHud(true);
    this.input.free = false;
    this.ui.resumePointer();
  }

  // ---------------- stage + UI plumbing ----------------
  resetStage() {
    this.removeStage();
    const { st, B } = this.active;
    this.stage = new THREE.Group();
    this.stage.position.copy(st.work);
    this.stage.scale.setScalar(B.scale);
    this.world.scene.add(this.stage);
    this.el.root.classList.remove('revealing');
    this.cs = this.ls = this.lsn = this.gs = null;
    this.player.focus({ pos: st.work.clone().add(B.cam), look: st.work.clone().add(B.look) });
  }

  removeStage() {
    this.anim = {};
    if (this.light) { this.light.parent?.remove(this.light); this.light = null; }
    if (this.stage) this.stage.parent?.remove(this.stage);
    this.stage = null;
    if (this.flying) { this.flying.parent?.remove(this.flying); this.flying = null; }
    audio.stopLoop('pour_loop', 0.2);
    audio.stopLoop('fire_loop', 0.2);
  }

  clearUI() {
    for (const f of this.cleanups) f();
    this.cleanups = [];
    this.el.ui.innerHTML = '';
  }

  on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  /** Step header: progress pips + a short instruction. */
  step(i, text) {
    const steps = this.active.B.steps;
    this.el.step.innerHTML = text;
    this.el.pips.innerHTML = steps.map((n, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}"><i></i><small>${n}</small></span>`).join('');
    this.clearUI();
  }

  options(list, onPick) {
    for (const o of list) {
      const b = document.createElement('button');
      b.className = 'opt';
      const icon = o.icon ? ico(o.icon) : '';
      b.innerHTML = `${o.color ? `<span class="dot" style="background:${o.color}"></span>` : icon}<span>${o.label}</span>${o.sub ? `<small>${o.sub}</small>` : ''}`;
      b.addEventListener('click', () => { audio.play('key_click', { volume: 0.5 }); onPick(o.value); });
      this.el.ui.appendChild(b);
    }
  }

  /** A big press-and-hold button (also Space). Calls back with 'down' / 'up'. */
  holdButton(label, onChange) {
    const btn = document.createElement('button');
    btn.className = 'opt hold';
    btn.innerHTML = `<span>${label}</span><small>hold · or Space</small>`;
    this.el.ui.appendChild(btn);
    let down = false;
    const press = (e) => { e?.preventDefault?.(); if (down) return; down = true; btn.classList.add('down'); onChange('down'); };
    const release = () => { if (!down) return; down = false; btn.classList.remove('down'); onChange('up'); };
    this.on(btn, 'pointerdown', press);
    this.on(window, 'pointerup', release);
    this.on(window, 'keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); press(); } });
    this.on(window, 'keyup', (e) => { if (e.code === 'Space') release(); });
    return btn;
  }

  /** A single action button (also Space / Enter). */
  actButton(label, iconId, onClick, sub = 'click · or Space') {
    const btn = document.createElement('button');
    btn.className = 'opt act';
    btn.innerHTML = `${iconId ? ico(iconId) : ''}<span>${label}</span><small>${sub}</small>`;
    this.el.ui.appendChild(btn);
    let used = false;
    const go = () => { if (used) return; used = true; btn.disabled = true; onClick(); };
    btn.addEventListener('click', go);
    this.on(window, 'keydown', (e) => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); go(); } });
    return btn;
  }

  /** Circle-drawing pad: progress 0..1 over `turns` turns; a steady radius earns stars. */
  circlePad({ turns, label, onAngle, onProgress, onDone }) {
    const wrap = document.createElement('div');
    wrap.className = 'pad-wrap';
    wrap.innerHTML = `<div class="dial-pad"><b>${label}</b><i></i><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="trk"/><circle cx="50" cy="50" r="46" class="prg" pathLength="100"/></svg></div>`;
    this.el.ui.appendChild(wrap);
    const pad = wrap.querySelector('.dial-pad');
    const knob = pad.querySelector('i');
    const prg = pad.querySelector('.prg');
    const need = Math.PI * 2 * turns;
    const d = { angle: null, total: 0, off: 0, samples: 0, down: false, lastRub: 0, done: false };
    const move = (e) => {
      if (!d.down || d.done) return;
      const r = pad.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const rad = Math.hypot(x, y) / (r.width / 2);
      const a = Math.atan2(y, x);
      knob.style.left = `${50 + Math.cos(a) * 34}%`;
      knob.style.top = `${50 + Math.sin(a) * 34}%`;
      if (d.angle !== null) {
        let da = a - d.angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        d.total += Math.abs(da);
        if (d.total - d.lastRub > 1.3) { audio.play('cloth', { volume: 0.22, rate: 1.3 + Math.random() * 0.2 }); d.lastRub = d.total; }
        onAngle?.(a, Math.abs(da));
      }
      d.angle = a;
      d.off += Math.abs(rad - 0.68);
      d.samples++;
      const k = Math.min(1, d.total / need);
      prg.style.strokeDashoffset = `${100 - k * 100}`;
      onProgress?.(k);
      if (k >= 1) {
        d.done = true;
        const wobble = d.off / Math.max(1, d.samples);
        onDone(wobble < 0.14 ? 3 : wobble < 0.28 ? 2 : 1);
      }
    };
    this.on(pad, 'pointerdown', (e) => { d.down = true; d.angle = null; pad.setPointerCapture?.(e.pointerId); move(e); });
    this.on(pad, 'pointermove', move);
    this.on(window, 'pointerup', () => { d.down = false; d.angle = null; });
  }

  meter(zoneFrom, zoneTo, cls = '') {
    const wrap = document.createElement('div');
    wrap.className = 'meter-wrap';
    wrap.innerHTML = `<div class="meter ${cls}">${zoneTo > zoneFrom ? `<span class="zone" style="left:${zoneFrom * 100}%;width:${(zoneTo - zoneFrom) * 100}%"></span>` : ''}<i></i></div>`;
    this.el.ui.appendChild(wrap);
    return wrap.querySelector('i');
  }

  score() { const sc = this.active.scores; return clamp(Math.round(sc.reduce((a, b) => a + b, 0) / Math.max(1, sc.length)), 1, 3); }

  // ================= Candle bench =================
  candleMould() {
    this.step(0, 'Choose a <b>mould</b>');
    this.options(Object.entries(CANDLE_FORMS).map(([id, f]) => ({ value: id, label: f.name, sub: `sells ~${money(f.market)}`, icon: 'i-candle' })), (form) => {
      this.active.choice.form = form;
      this.buildCandleStage(form);
      audio.play(form === 'jar' ? 'place_glass' : 'ceramic', { volume: 0.5 });
      this.candleColour();
    });
  }

  buildCandleStage(form) {
    const D = CANDLE_DIMS[form];
    const g = new THREE.Group();
    g.position.x = 0.05;
    this.stage.add(g);
    const mouldMat = litMat({ color: '#c9d3d0', transparent: true, opacity: form === 'jar' ? 0.32 : 0.38, roughness: 0.12, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const waxMat = litMat({ color: '#f3e6c8', roughness: 0.55, emissive: new THREE.Color('#7a4a14'), emissiveIntensity: 0 });
    const fills = [];
    for (const x of D.xs) {
      // the mould (or, for a jar candle, the jar itself)
      let mould;
      if (form === 'jar') {
        mould = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0), V2(D.mouldR, 0), V2(D.mouldR + 0.002, 0.01), V2(D.mouldR + 0.002, D.mouldH - 0.008), V2(D.mouldR - 0.002, D.mouldH - 0.004), V2(D.mouldR - 0.002, D.mouldH)], 32), mouldMat);
      } else {
        mould = new THREE.Mesh(new THREE.CylinderGeometry(D.mouldR, D.mouldR, D.mouldH, 32, 1, true), mouldMat);
        mould.position.y = D.mouldH / 2 + D.base;
        const lip = new THREE.Mesh(new THREE.TorusGeometry(D.mouldR, 0.0025, 6, 32), litMat({ color: '#9aa4a0', metalness: 0.5, roughness: 0.35 }));
        lip.rotation.x = Math.PI / 2;
        lip.position.y = D.mouldH / 2;
        mould.add(lip);
      }
      mould.position.x = x;
      mould.layers.set(LAYER_NO_INK);
      g.add(mould);
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(D.r, D.r, 1, 28).translate(0, 0.5, 0), waxMat);
      fill.position.set(x, D.base + 0.001, 0);
      fill.scale.y = 0.0001;
      g.add(fill);
      fills.push({ fill, mould });
    }
    if (form === 'taper') {
      const holder = new THREE.Mesh(new THREE.BoxGeometry(0.09, D.base, 0.035), litMat({ color: '#9aa4a0', metalness: 0.5, roughness: 0.35 }));
      holder.position.y = D.base / 2;
      g.add(holder);
    }
    // the fill line: a soft glowing ring at the ideal height
    const ring = new THREE.Mesh(new THREE.TorusGeometry(D.mouldR + 0.003, 0.0016, 6, 40), glow('#8fe3a8', 1.6));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = D.base + D.h * 0.86;
    if (D.xs.length > 1) ring.scale.x = 2.6;
    ring.layers.set(LAYER_NO_INK);
    ring.visible = false;
    g.add(ring);
    // the pouring jug sits to the left, full of warm wax
    const jug = new THREE.Group();
    const jugMat = litMat({ color: '#d8cfbf', roughness: 0.35, metalness: 0.15, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.LatheGeometry([V2(0, 0), V2(0.034, 0), V2(0.04, 0.012), V2(0.042, 0.055), V2(0.038, 0.075), V2(0.041, 0.08)], 28), jugMat);
    const spout = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 12, 1, true), jugMat);
    spout.rotation.z = -Math.PI / 2 - 0.5;
    spout.position.set(0.046, 0.074, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16, Math.PI), jugMat);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(-0.042, 0.045, 0);
    const surface = new THREE.Mesh(new THREE.CircleGeometry(0.038, 24), litMat({ color: '#f3e6c8', roughness: 0.3, emissive: new THREE.Color('#5a3a10'), emissiveIntensity: 0.35 }));
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.062;
    const tip = new THREE.Object3D();
    tip.position.set(0.062, 0.068, 0);
    jug.add(body, spout, handle, surface, tip);
    jug.position.set(-0.16, 0, 0.02);
    this.stage.add(jug);
    popIn(g, { from: 0.6 });
    popIn(jug, { from: 0.6 });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0045, 1, 10).translate(0, -0.5, 0), litMat({ color: '#f3e6c8', roughness: 0.3, emissive: new THREE.Color('#5a3a10'), emissiveIntensity: 0.3 }));
    stream.visible = false;
    this.stage.add(stream);
    this.cs = { D, g, fills, waxMat, ring, jug, surface, tip, stream, level: 0, lifted: 0 };
  }

  candleColour() {
    this.step(1, 'Add a <b>dye</b> to the warm wax');
    this.options(Object.entries(CANDLE_COLORS).map(([id, c]) => ({ value: id, label: c.name, color: c.hex })), (color) => {
      this.active.choice.color = color;
      const hex = new THREE.Color(CANDLE_COLORS[color].hex);
      const cs = this.cs;
      // a drop falls into the jug and the wax blooms into the colour
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.007, 10, 8), litMat({ color: hex, roughness: 0.2 }));
      drop.position.copy(cs.jug.position).add(V3(0, 0.2, 0));
      this.stage.add(drop);
      this.clearUI();
      tween({ duration: 0.45, easing: ease.inCubic, update: (k) => { drop.position.y = cs.jug.position.y + 0.2 - k * 0.14; }, done: () => {
        drop.parent?.remove(drop);
        audio.play('clink', { volume: 0.35, rate: 1.6 });
        const from = cs.surface.material.color.clone();
        tween({ duration: 0.7, easing: ease.inOutSine, update: (k) => { cs.surface.material.color.copy(from).lerp(hex, k); cs.stream.material.color.copy(from).lerp(hex, k); cs.waxMat.color.copy(from).lerp(hex, k); }, done: () => { if (this.cs === cs) this.candlePour(); } });
      } });
    });
  }

  candlePour() {
    this.step(2, 'Hold to <b>pour</b> — stop at the green line');
    const cs = this.cs;
    const { D } = cs;
    cs.ring.visible = true;
    const start = cs.jug.position.clone();
    const target = V3(cs.g.position.x - 0.085 + (D.xs.length > 1 ? -0.02 : 0), D.mouldH + D.base + 0.03, 0);
    let tilt = 0, done = false;
    const bar = this.meter(0.78 / 1.08, 0.94 / 1.08);
    this.anim.pour = (dt) => {
      // the jug glides over the mould, then tips while you hold
      cs.lifted = Math.min(1, cs.lifted + dt * 2.5);
      cs.jug.position.lerpVectors(start, target, ease.outCubic(cs.lifted));
      tilt += ((cs.pouring ? 1 : 0) - tilt) * (1 - Math.exp(-10 * dt));
      cs.jug.rotation.z = -tilt * 1.15;
      const flowing = cs.pouring && tilt > 0.6;
      if (flowing) cs.level = Math.min(1.08, cs.level + dt * 0.3);
      for (const f of cs.fills) f.fill.scale.y = Math.max(0.0001, D.h * Math.min(cs.level, 1));
      if (cs.level > 1 && !cs.spill) {
        cs.spill = new THREE.Mesh(new THREE.CircleGeometry(1, 24), cs.waxMat);
        cs.spill.rotation.x = -Math.PI / 2;
        cs.spill.position.set(cs.g.position.x + 0.03, 0.002, 0.03);
        cs.spill.scale.setScalar(0.001);
        this.stage.add(cs.spill);
      }
      if (cs.spill) cs.spill.scale.setScalar(Math.max(0.001, (cs.level - 1) * 0.9));
      // the stream runs from the spout tip down to the wax surface
      cs.stream.visible = flowing;
      if (flowing) {
        const a = this.stage.worldToLocal(cs.tip.getWorldPosition(new THREE.Vector3()));
        const b = V3(cs.g.position.x, D.base + D.h * Math.min(cs.level, 1), 0);
        cs.stream.position.copy(a);
        const dir = b.sub(a);
        cs.stream.scale.set(1, Math.max(0.001, dir.length()), 1);
        cs.stream.quaternion.setFromUnitVectors(V3(0, -1, 0), dir.normalize());
      }
      bar.style.width = `${Math.min(100, (cs.level / 1.08) * 100)}%`;
      if (done && tilt < 0.05) {
        delete this.anim.pour;
        tween({ duration: 0.5, easing: ease.inOutCubic, update: (k) => cs.jug.position.lerpVectors(target, start, k), done: () => { if (this.cs === cs) this.candleWick(); } });
      }
    };
    this.holdButton('Pour', (ev) => {
      if (done) return;
      if (ev === 'down') { cs.pouring = true; audio.loop('pour_loop', { volume: 0.5, pos: this.stage.position }); return; }
      cs.pouring = false;
      audio.stopLoop('pour_loop', 0.25);
      if (cs.level < 0.25) return;                       // a tiny dribble doesn't count; keep going
      done = true;
      const lv = cs.level;
      this.active.scores.push(lv >= 0.78 && lv <= 0.94 ? 3 : lv >= 0.6 && lv <= 1.02 ? 2 : 1);
      cs.ring.visible = false;
      this.clearUI();
    });
  }

  candleWick() {
    this.step(3, 'Drop the <b>wick</b> right in the middle');
    const cs = this.cs;
    const { D } = cs;
    const holder = new THREE.Group();
    holder.add(new THREE.Mesh(new THREE.BoxGeometry(D.xs.length > 1 ? 0.12 : 0.11, 0.006, 0.012), litMat({ color: '#c9a77a', roughness: 0.8 })));
    const wicks = D.xs.map((x) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.06, 6).translate(0, -0.03, 0), litMat({ color: '#3b2a20' }));
      w.position.x = x;
      holder.add(w);
      return w;
    });
    holder.position.set(cs.g.position.x, D.base + D.mouldH + 0.012, 0);
    this.stage.add(holder);
    cs.holder = holder;
    let t = Math.random() * 3, dropped = false;
    const wrap = document.createElement('div');
    wrap.className = 'meter-wrap';
    wrap.innerHTML = '<div class="meter swing"><span class="zone" style="left:42%;width:16%"></span><i class="mark"></i></div>';
    this.el.ui.appendChild(wrap);
    const mark = wrap.querySelector('.mark');
    this.anim.swing = (dt) => {
      if (dropped) return;
      t += dt;
      const sw = Math.sin(t * 2.3);
      holder.position.x = cs.g.position.x + sw * 0.032;
      mark.style.left = `calc(${50 + sw * 45}% - 6px)`;
    };
    this.actButton('Drop wick', 'i-match', () => {
      dropped = true;
      delete this.anim.swing;
      const off = Math.abs(holder.position.x - cs.g.position.x);
      this.active.scores.push(off < 0.007 ? 3 : off < 0.017 ? 2 : 1);
      // the holder settles onto the rim; the wick sinks into the wax
      const fromX = holder.position.x;
      tween({ duration: 0.4, easing: ease.outCubic, update: (k) => { holder.position.x = fromX + (cs.g.position.x - fromX) * k * 0.7; for (const w of wicks) w.scale.y = 1 + k * 0.6; } });
      audio.play('cloth', { volume: 0.35 });
      setTimeout(() => { if (this.cs === cs) this.candleCool(); }, 600);
    });
  }

  candleCool() {
    this.step(4, 'Blow gently to <b>cool</b> it');
    const cs = this.cs;
    cs.waxMat.emissiveIntensity = 0.55;
    // steam wisps rise while it's hot
    const n = 24;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const life = new Float32Array(n).map(() => Math.random());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const steam = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.012, transparent: true, opacity: 0.55, depthWrite: false }));
    steam.layers.set(LAYER_NO_INK);
    this.stage.add(steam);
    let heat = 1, gust = 0;
    const topY = cs.D.base + cs.D.h * Math.min(cs.level, 1);
    const bar = this.meter(0, 0, 'cool');
    this.anim.cool = (dt) => {
      heat = Math.max(0, heat - dt * (0.06 + gust * 0.9));     // cools on its own too, just slowly
      gust = Math.max(0, gust - dt * 1.8);
      cs.waxMat.emissiveIntensity = 0.55 * heat;
      for (let i = 0; i < n; i++) {
        life[i] += dt * (0.5 + gust * 1.5);
        if (life[i] > 1) life[i] = 0;
        const L = life[i];
        pos[i * 3] = cs.g.position.x + Math.sin(i * 7.1 + L * 6) * 0.012 + gust * L * 0.05;
        pos[i * 3 + 1] = topY + L * 0.11;
        pos[i * 3 + 2] = Math.cos(i * 3.3) * 0.012;
      }
      geo.attributes.position.needsUpdate = true;
      steam.material.opacity = 0.55 * heat;
      bar.style.width = `${(1 - heat) * 100}%`;
      if (heat <= 0.02) {
        delete this.anim.cool;
        steam.parent?.remove(steam);
        this.candleUnmould();
      }
    };
    const btn = document.createElement('button');
    btn.className = 'opt act';
    btn.innerHTML = `${ico('i-sparkle')}<span>Blow</span><small>tap · or Space</small>`;
    const blow = () => { gust = Math.min(1.6, gust + 0.7); audio.play('cloth', { volume: 0.3, rate: 0.7 + Math.random() * 0.2 }); btn.classList.remove('puff'); void btn.offsetWidth; btn.classList.add('puff'); };
    btn.addEventListener('pointerdown', blow);
    this.on(window, 'keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); blow(); } });
    this.el.ui.appendChild(btn);
  }

  candleUnmould() {
    const cs = this.cs;
    const { form, color } = this.active.choice;
    this.step(5, form === 'jar' ? 'Tie on the <b>label</b>' : 'Pop it out of the <b>mould</b>');
    this.actButton(form === 'jar' ? 'Add label' : 'Unmould', 'i-candle', () => {
      audio.play(form === 'jar' ? 'paper' : 'ceramic', { volume: 0.5 });
      cs.holder?.parent?.remove(cs.holder);
      cs.spill?.parent?.remove(cs.spill);
      // the mould lifts away and the real candle stands in its place
      const real = candle(form, color);
      real.position.copy(cs.g.position);
      if (form === 'jar') cs.g.visible = false;
      else {
        for (const f of cs.fills) {
          const m = f.mould;
          const y0 = m.position.y;
          tween({ duration: 0.7, easing: ease.inOutCubic, update: (k) => { m.position.y = y0 + k * 0.25; m.material.opacity = 0.38 * (1 - k); } });
          f.fill.visible = false;
        }
      }
      this.stage.add(real);
      popIn(real, { from: 0.85, squash: 0.15 });
      setTimeout(() => { if (this.cs === cs) { const stars = this.score(); this.reveal(candleKey(form, color, stars), stars, real); } }, 750);
    });
  }

  // ================= Lamp bench =================
  lampBase() {
    this.step(0, 'Choose a <b>base</b>');
    this.options(Object.entries(LAMP_BASES).map(([id, b]) => ({ value: id, label: b.name, color: b.hex })), (base) => {
      this.active.choice.base = base;
      const l = this.lampModel({ bulb: false, shade: null });
      tween({ duration: 0.45, easing: ease.outBounce, update: (k) => { l.position.y = 0.15 * (1 - k); } });
      audio.play('place_wood', { volume: 0.55, delay: 0.3 });
      this.clearUI();
      setTimeout(() => { if (this.ls?.model === l) this.lampBulb(); }, 480);
    });
  }

  lampModel({ bulb = true, shade = null, filter = 'white', on = false }) {
    if (this.ls?.model) this.ls.model.parent?.remove(this.ls.model);
    const l = lamp(this.active.choice.base, shade || 'drum', filter, { on });
    const [, , b, sh] = l.children;
    b.visible = bulb;
    sh.visible = !!shade;
    this.stage.add(l);
    // keep the same state object so in-flight steps can tell it's still this lamp
    if (!this.ls) this.ls = {};
    this.ls.model = l;
    return l;
  }

  lampBulb() {
    this.step(1, 'Twist the <b>bulb</b> in — draw circles');
    const l = this.ls.model;
    const bulb = l.children[2];
    bulb.visible = true;
    bulb.position.y = 0.3;
    popIn(bulb, { from: 0.4 });
    this.circlePad({
      turns: 2.5,
      label: 'twist',
      onAngle: (a, da) => { bulb.rotation.y += da * 2; },
      onProgress: (k) => { bulb.position.y = 0.3 - (0.3 - 0.205) * k; },
      onDone: (sc) => {
        this.active.scores.push(sc);
        audio.play('key_click', { volume: 0.6 });
        audio.play('wind_key', { volume: 0.35 });
        popIn(bulb, { from: 0.85, squash: 0.2 });
        this.clearUI();
        setTimeout(() => { if (this.ls?.model === l) this.lampShade(); }, 450);
      },
    });
  }

  lampShade() {
    this.step(2, 'Pick a <b>shade</b>');
    this.options(Object.entries(LAMP_SHADES).map(([id, sh]) => ({ value: id, label: sh.name, icon: 'i-lamp' })), (shade) => {
      this.active.choice.shade = shade;
      const l = this.lampModel({ shade });
      const sh = l.children[3];
      const y0 = sh.position.y;
      tween({ duration: 0.6, easing: ease.outBounce, update: (k) => { sh.position.y = y0 + 0.18 * (1 - k); } });
      audio.play(shade === 'dome' ? 'place_glass' : 'paper', { volume: 0.5, delay: 0.25 });
      this.clearUI();
      setTimeout(() => { if (this.ls?.model === l) this.lampGlow(); }, 650);
    });
  }

  lampGlow() {
    this.step(3, 'Choose the <b>glow</b> colour');
    this.options(Object.entries(LAMP_FILTERS).map(([id, f]) => ({ value: id, label: f.name, color: f.hex })), (filter) => {
      this.active.choice.filter = filter;
      this.lampModel({ shade: this.active.choice.shade, filter });
      audio.play('clink', { volume: 0.4 });
      this.lampSwitch();
    });
  }

  lampSwitch() {
    this.step(4, 'Pull the <b>chain</b> to switch it on');
    const l = this.ls.model;
    // a little bead chain hangs from the socket
    const chain = new THREE.Group();
    const bead = new THREE.SphereGeometry(0.0035, 8, 6);
    const brass = litMat({ color: '#c99a3e', metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(bead, brass); b.position.y = -i * 0.0085; chain.add(b); }
    const pull = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), brass);
    pull.position.y = -0.08;
    chain.add(pull);
    chain.position.set(0.022, 0.19, 0.01);
    l.add(chain);
    this.ls.chain = chain;
    const wrap = document.createElement('div');
    wrap.className = 'pull-wrap';
    wrap.innerHTML = '<div class="pull"><span class="cord"></span><b class="knob"></b></div><small>drag the handle down · or Space</small>';
    this.el.ui.appendChild(wrap);
    const knob = wrap.querySelector('.knob');
    let startY = null, pulled = 0, done = false;
    const go = () => { if (done) return; done = true; this.lampOn(); };
    this.on(knob, 'pointerdown', (e) => { startY = e.clientY; knob.setPointerCapture?.(e.pointerId); e.preventDefault(); });
    this.on(knob, 'pointermove', (e) => {
      if (startY === null || done) return;
      pulled = clamp((e.clientY - startY) / 80, 0, 1);
      knob.style.transform = `translateY(${pulled * 80}px)`;
      chain.scale.y = 1 + pulled * 0.5;
    });
    this.on(window, 'pointerup', () => {
      if (startY === null || done) return;
      startY = null;
      if (pulled > 0.65) go();
      else { knob.style.transform = ''; chain.scale.y = 1; }
    });
    this.on(window, 'keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); go(); } });
  }

  lampOn() {
    this.clearUI();
    audio.play('lamp_switch', { volume: 0.7 });
    const { shade, filter, base } = this.active.choice;
    const ls = this.ls;
    tween({ duration: 0.35, easing: ease.outBack, update: (k) => { ls.chain.scale.y = 1.5 - k * 0.5; } });
    const light = new THREE.PointLight(LAMP_FILTERS[filter].light, 0, 2.5, 2);
    light.position.copy(this.active.st.work).add(V3(0, 0.38, 0.05));
    this.world.scene.add(light);
    this.light = light;
    // flicker, flicker… on
    for (const [t, on] of [[0, true], [90, false], [180, true], [260, false], [420, true]]) {
      setTimeout(() => {
        if (this.ls !== ls) return;
        const l = this.lampModel({ shade, filter, on });
        l.add(ls.chain);
        light.intensity = on ? 0.7 : 0;
      }, t);
    }
    setTimeout(() => {
      if (this.ls !== ls) return;
      this.active.scores.push(3);
      const stars = this.score();
      this.reveal(lampKey(base, shade, filter, stars), stars, ls.model);
    }, 900);
  }

  // ================= Lens grinder =================
  lensForm() {
    this.step(0, 'What will you <b>grind</b>?');
    this.options(Object.entries(LENS_FORMS).map(([id, f]) => ({ value: id, label: f.name, sub: `sells ~${money(f.market)}`, icon: 'i-lens' })), (form) => {
      this.active.choice.form = form;
      this.lensMount();
    });
  }

  lensMount() {
    this.step(1, 'Set the <b>glass blank</b> on the lap');
    this.actButton('Set blank', 'i-lens', () => {
      const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 40), litMat({ color: '#d4dede', transparent: true, opacity: 0.94, roughness: 0.95 }));
      blank.position.set(0.045, 0.12, 0);
      this.stage.add(blank);
      const lsn = this.lsn = { blank };
      tween({ duration: 0.45, easing: ease.outBounce, update: (k) => { blank.position.y = 0.12 - (0.12 - 0.005) * k; }, done: () => audio.play('place_glass', { volume: 0.6 }) });
      setTimeout(() => { if (this.lsn === lsn) this.lensPolish(); }, 600);
    });
  }

  lensPolish() {
    this.step(2, 'Draw slow, even <b>circles</b> to polish');
    const lsn = this.lsn;
    const { blank } = lsn;
    const wheel = this.active.st.wheel;
    let spin = 0;
    this.anim.lap = (dt) => { spin = Math.max(0, spin - dt * 2); wheel.rotation.y += (1.5 + spin * 6) * dt; };
    // sparkles where the glass meets the lap
    const n = 30;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3).fill(-1);
    const vel = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color('#fff2cf').multiplyScalar(2), size: 0.006, transparent: true, opacity: 0.9, depthWrite: false }));
    sparks.layers.set(LAYER_NO_INK);
    this.stage.add(sparks);
    let next = 0;
    this.anim.sparks = (dt) => {
      for (let i = 0; i < n; i++) {
        vel[i * 3 + 1] -= dt * 0.4;
        for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
      }
      geo.attributes.position.needsUpdate = true;
    };
    const emit = () => {
      for (let j = 0; j < 2; j++) {
        const i = next++ % n;
        pos[i * 3] = blank.position.x; pos[i * 3 + 1] = 0.01; pos[i * 3 + 2] = blank.position.z;
        vel[i * 3] = (Math.random() - 0.5) * 0.12; vel[i * 3 + 1] = 0.08 + Math.random() * 0.08; vel[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      }
    };
    this.circlePad({
      turns: 4,
      label: 'polish',
      onAngle: (a, da) => {
        // you are literally working the glass round the lap
        blank.position.x = Math.cos(a) * 0.045;
        blank.position.z = Math.sin(a) * 0.045;
        blank.rotation.y += da;
        spin = Math.min(2, spin + da * 2);
        emit();
      },
      onProgress: (k) => {
        blank.material.roughness = 0.95 - k * 0.9;
        blank.material.opacity = 0.94 - k * 0.5;
        blank.material.color.set('#d4dede').lerp(new THREE.Color('#e6f6f8'), k);
      },
      onDone: (sc) => {
        this.active.scores.push(sc);
        audio.play('clink', { volume: 0.5, rate: 1.4 });
        this.clearUI();
        tween({ duration: 0.4, easing: ease.outCubic, update: (k) => { blank.position.x *= 1 - k; blank.position.z *= 1 - k; } });
        setTimeout(() => { if (this.lsn !== lsn) return; sparks.parent?.remove(sparks); delete this.anim.sparks; delete this.anim.lap; this.lensFrame(); }, 500);
      },
    });
  }

  lensFrame() {
    this.step(3, 'Fit it into its <b>frame</b>');
    const form = this.active.choice.form;
    const lsn = this.lsn;
    this.actButton(form === 'spyglass' ? 'Fit the tube' : 'Fit the rim', 'i-sparkle', () => {
      lsn.blank.parent?.remove(lsn.blank);
      const real = lens(form, { polish: 1 });
      real.position.set(0, 0.002, 0);
      this.stage.add(real);
      popIn(real, { from: 0.6, squash: 0.12 });
      audio.play('latch', { volume: 0.5 });
      setTimeout(() => { if (this.lsn === lsn) { const stars = this.score(); this.reveal(lensKey(form, stars), stars, real); } }, 650);
    });
  }

  // ================= Stained glass table =================
  glassPattern() {
    this.step(0, 'Choose a <b>pattern</b>');
    this.options(Object.entries(GLASS_PATTERNS).map(([id, p]) => ({ value: id, label: p.name, icon: 'i-glass' })), (pattern) => {
      this.active.choice.pattern = pattern;
      this.glassColour('c1');
    });
  }

  glassColour(which) {
    this.step(which === 'c1' ? 1 : 2, which === 'c1' ? 'Colour for the <b>picture</b>' : 'Colour for the <b>background</b>');
    this.options(Object.entries(GLASS_COLORS).filter(([id]) => id !== this.active.choice.c1).map(([id, c]) => ({ value: id, label: c.name, color: c.hex })), (c) => {
      this.active.choice[which] = c;
      audio.play('clink', { volume: 0.4 });
      if (which === 'c1') this.glassColour('c2'); else this.glassLay();
    });
  }

  glassLay() {
    this.step(3, 'Lay each piece — follow the <b>glowing square</b>');
    const { pattern, c1, c2 } = this.active.choice;
    const filled = new Set();
    const panel = glassPanel(pattern, c1, c2, { filled });
    // lay it flat on the light table: centre the panel on the holder, then tip it face-up
    const holder = new THREE.Group();
    panel.position.y = -(0.03 + 0.13);
    const foot = panel.children.find((o) => o.geometry?.parameters?.width === 0.2);
    if (foot) foot.visible = false;
    holder.add(panel);
    holder.rotation.x = -Math.PI / 2;
    holder.position.y = 0.011;
    this.stage.add(holder);
    this.gs = { holder, panel, foot };
    const P = GLASS_PATTERNS[pattern];
    const hexAt = (i) => (P.grid[Math.floor(i / 5)][i % 5] === '1' ? GLASS_COLORS[c1] : GLASS_COLORS[c2]).hex;
    const grid = document.createElement('div');
    grid.className = 'grid-pick';
    grid.style.gridTemplateColumns = 'repeat(5, 44px)';
    let next = 0, misses = 0, painting = false;
    const buttons = [];
    for (let i = 0; i < 25; i++) {
      const b = document.createElement('button');
      b.dataset.i = i;
      // a faint tint shows the pattern before it is laid
      b.style.background = `color-mix(in srgb, ${hexAt(i)} 28%, #2a1c14)`;
      grid.appendChild(b);
      buttons.push(b);
    }
    const mark = () => buttons.forEach((b, i) => b.classList.toggle('want', i === next && !filled.has(i)));
    const fill = (i) => {
      if (filled.has(i)) return;
      if (i !== next) misses++;
      filled.add(i);
      buttons[i].style.background = hexAt(i);
      buttons[i].classList.add('filled');
      for (const cell of panel.userData.cells) if (cell.userData.cell === i) { cell.visible = true; cell.userData.back.visible = true; popIn(cell, { from: 0.3, duration: 0.25 }); }
      audio.play('place_glass', { volume: 0.32, rate: 1 + (filled.size % 5) * 0.05 });
      while (next < 25 && filled.has(next)) next++;
      mark();
      if (filled.size === 25) {
        this.active.scores.push(misses <= 2 ? 3 : misses <= 6 ? 2 : 1);
        const gs = this.gs;
        setTimeout(() => { if (this.gs === gs) this.glassSolder(); }, 350);
      }
    };
    this.on(grid, 'pointerdown', (e) => { painting = true; const i = e.target.dataset.i; if (i !== undefined) fill(+i); e.preventDefault(); });
    this.on(grid, 'pointerover', (e) => { if (painting && e.target.dataset.i !== undefined) fill(+e.target.dataset.i); });
    this.on(window, 'pointerup', () => { painting = false; });
    this.el.ui.appendChild(grid);
    mark();
  }

  glassSolder() {
    this.step(4, 'Hold to <b>solder</b> the joints — let go in the green');
    const gs = this.gs;
    // a glowing bead of solder walks the lead lines while you hold
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.006, 10, 8), glow('#ffd8a0', 3));
    bead.layers.set(LAYER_NO_INK);
    this.stage.add(bead);
    const size = 0.26, cell = size / 5;
    const pts = [];
    for (let r = 0; r <= 5; r++) { const z = -size / 2 + r * cell; pts.push(r % 2 ? [size / 2, z] : [-size / 2, z], r % 2 ? [-size / 2, z] : [size / 2, z]); }
    let k = 0, held = false, done = false;
    const bar = this.meter(0.8, 0.96);
    const finish = () => {
      done = true;
      held = false;
      audio.stopLoop('fire_loop', 0.3);
      this.active.scores.push(k >= 0.8 && k <= 0.96 ? 3 : k >= 0.6 ? 2 : 1);
      this.clearUI();
      setTimeout(() => { if (this.gs !== gs) return; bead.parent?.remove(bead); delete this.anim.solder; this.glassLift(); }, 300);
    };
    this.anim.solder = (dt) => {
      if (held && !done) k = Math.min(1, k + dt * 0.32);
      const f = k * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const t = f - i;
      bead.position.set(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 0.02, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t);
      bead.scale.setScalar(held ? 1 + Math.sin(performance.now() / 60) * 0.2 : 0.8);
      bar.style.width = `${k * 100}%`;
      if (k >= 1 && !done) finish();
    };
    this.holdButton('Solder', (ev) => {
      if (done) return;
      if (ev === 'down') { held = true; audio.loop('fire_loop', { volume: 0.35, pos: this.stage.position, rate: 1.5 }); return; }
      held = false;
      audio.stopLoop('fire_loop', 0.3);
      if (k > 0.3) finish();
    });
  }

  glassLift() {
    this.step(5, 'Lift it up to the <b>light</b>!');
    const gs = this.gs;
    this.actButton('Lift it up', 'i-sparkle', () => {
      if (gs.foot) gs.foot.visible = true;
      tween({ duration: 0.9, easing: ease.outBack, update: (k) => { gs.holder.rotation.x = -Math.PI / 2 * (1 - k); gs.holder.position.y = 0.011 + k * 0.15; } });
      audio.play('clink', { volume: 0.5, rate: 1.2 });
      setTimeout(() => {
        if (this.gs !== gs) return;
        const { pattern, c1, c2 } = this.active.choice;
        const stars = this.score();
        this.reveal(glassKey(pattern, c1, c2, stars), stars, gs.holder);
      }, 950);
    });
  }

  // ================= the reveal =================
  /** Spin the finished piece up into the light with sparkles and stars, then offer another. */
  reveal(key, stars, obj) {
    const s = this.getState();
    const id = this.active.id;
    s.supplies[id] = Math.max(0, (s.supplies[id] || 0) - 1);
    s.crafted.push(key);
    s.stats.crafted++;
    s.xp += 6 + stars * 2;
    this.updateCrates();
    this.onCrafted?.(key, stars);
    this.clearUI();
    this.el.root.classList.add('revealing');
    // tilt the view down a touch so the finished piece sits above the card
    const { st, B } = this.active;
    this.player.focus({ pos: st.work.clone().add(B.cam).add(V3(0, 0.06, 0.08)), look: st.work.clone().add(B.look).add(V3(0, -0.14, 0)) });
    this.el.step.innerHTML = '';
    this.el.pips.querySelectorAll('span').forEach((p) => { p.className = 'done'; });
    // swap in the finished model (lit where it can be) and lift it into the light
    const lit = productMesh(key, { on: true, lit: true });
    lit.position.copy(obj.position);
    if (id === 'glass') lit.position.y -= 0.13 + 0.03;
    for (const c of [...this.stage.children]) {
      tween({ duration: 0.35, easing: ease.outCubic, update: (k) => { c.scale.setScalar(Math.max(0.001, 1 - k)); }, done: () => c.parent?.remove(c) });
    }
    if (this.light && id !== 'lamp') this.light.intensity = 0;
    this.stage.add(lit);
    popIn(lit, { from: 0.9 });
    const y0 = lit.position.y, x0 = lit.position.x;
    const lift = id === 'glass' ? 0.02 : 0.03;
    tween({ duration: 0.9, easing: ease.outBack, update: (k) => { lit.position.y = y0 + k * lift; lit.position.x = x0 * (1 - k); } });
    this.anim.spin = (dt) => { lit.rotation.y += dt * 0.9; };
    this.burst(V3(0, y0 + lift + 0.08, 0));
    // stars ring up one by one
    for (let i = 0; i < stars; i++) audio.play('clink', { volume: 0.45, rate: 1.2 + i * 0.25, delay: 0.35 + i * 0.28 });
    audio.play('till_ding', { volume: 0.35, rate: 1.5, delay: 0.3 + stars * 0.28 });
    const left = s.supplies[id] || 0;
    const word = stars === 3 ? 'Beautiful work!' : stars === 2 ? 'Lovely!' : 'Charming!';
    const card = document.createElement('div');
    card.className = 'reveal-card';
    card.innerHTML = `<div class="ribbon">${productName(key)}</div>
      <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.35 + i * 0.28}s">★</span>`).join('')}</div>
      <p><b>${word}</b> Sells for about <b>${money(marketPrice(key))}</b>.</p>
      <div class="reveal-row"><button class="btn amber" data-a="again" ${left <= 0 ? 'disabled' : ''}>${ico('i-sparkle')} Make another <small>${left} left</small></button><button class="btn" data-a="done">${ico('i-crate')} Into the crate</button></div>`;
    this.el.ui.appendChild(card);
    const again = card.querySelector('[data-a=again]');
    const done = card.querySelector('[data-a=done]');
    const toCrate = (then) => {
      again.disabled = done.disabled = true;
      delete this.anim.spin;
      const crate = this.world.shop.crates[id];
      const from = lit.getWorldPosition(new THREE.Vector3());
      const to = crate.pos.clone().add(V3(0, 0.35, 0));
      const sc = this.active.B.scale;
      this.stage.remove(lit);
      lit.position.copy(from);
      lit.scale.setScalar(sc);
      this.world.scene.add(lit);
      this.flying = lit;
      tween({ duration: 0.7, easing: ease.inOutCubic, update: (k) => { lit.position.lerpVectors(from, to, k); lit.position.y += Math.sin(k * Math.PI) * 0.3; lit.scale.setScalar(sc * (1 - k * 0.7)); }, done: () => { lit.parent?.remove(lit); if (this.flying === lit) this.flying = null; audio.play('box_soft', { volume: 0.5 }); } });
      setTimeout(then, 450);
    };
    again.addEventListener('click', () => toCrate(() => { if (this.active) this.restart(); }));
    done.addEventListener('click', () => toCrate(() => this.close()));
    this.on(window, 'keydown', (e) => { if (e.code === 'Enter' && !again.disabled) again.click(); });
  }

  burst(at) {
    const n = 60;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = at.x; pos[i * 3 + 1] = at.y; pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, u = Math.random() * 0.8 + 0.2;
      vel[i * 3] = Math.cos(a) * 0.25 * u; vel[i * 3 + 1] = 0.2 + Math.random() * 0.3; vel[i * 3 + 2] = Math.sin(a) * 0.25 * u;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color('#ffd98a').multiplyScalar(2.2), size: 0.012, transparent: true, opacity: 1, depthWrite: false }));
    pts.layers.set(LAYER_NO_INK);
    this.stage.add(pts);
    let t = 0;
    this.anim.burst = (dt) => {
      t += dt;
      for (let i = 0; i < n; i++) {
        vel[i * 3 + 1] -= dt * 0.5;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = Math.max(0, 1 - t / 1.4);
      if (t > 1.4) { pts.parent?.remove(pts); delete this.anim.burst; }
    };
  }

  /** Show what's waiting in each crate. */
  updateCrates() {
    const s = this.getState?.();
    if (!s) return;
    for (const [id, crate] of Object.entries(this.world.shop.crates)) {
      crate.contents.clear();
      const keys = s.crafted.filter((k) => k.startsWith(id));
      keys.slice(0, 6).forEach((k, i) => {
        const m = productMesh(k, { on: false });
        m.scale.setScalar(id === 'lamp' ? 0.9 : id === 'glass' ? 0.7 : 1.3);
        m.position.set(((i % 3) - 1) * 0.14, Math.floor(i / 3) * 0.05, (Math.floor(i / 3) - 0.5) * 0.12);
        crate.contents.add(m);
      });
    }
    // supply bins on the benches
    for (const [id, st] of Object.entries(this.world.shop.stations)) {
      st.supplyBin.clear();
      const n = Math.min(6, s.supplies[id] || 0);
      for (let i = 0; i < n; i++) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), litMat({ color: id === 'candle' ? '#f3e6c8' : id === 'lamp' ? '#a8aca2' : '#cfe1e3' }));
        block.position.set((i % 2) * 0.11 - 0.05, Math.floor(i / 2) * 0.052 + 0.025, 0);
        st.supplyBin.add(block);
      }
    }
    this.world.shop.lampLocked.visible = !hasLicence(s, 'lamps');
  }

  update(dt) {
    for (const f of Object.values(this.anim)) f(dt);
    // the lap keeps a slow idle turn even when nobody is working it
    const wheel = this.world.shop.stations.lens?.wheel;
    if (wheel && !this.anim.lap) wheel.rotation.y += dt * 0.15;
  }
}
