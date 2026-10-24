// Workbenches. Tactile but forgiving: every step succeeds, and doing it nicely
// only adds quality stars. The camera settles onto the bench while you work.

import * as THREE from 'three';
import { audio } from './audio.js';
import { candle, lamp, lens, glassPanel, productMesh } from './products.js';
import { CANDLE_FORMS, CANDLE_COLORS, LAMP_BASES, LAMP_SHADES, LAMP_FILTERS, LENS_FORMS, GLASS_PATTERNS, GLASS_COLORS } from './config.js';
import { candleKey, lampKey, lensKey, glassKey, hasLicence, productName } from './state.js';
import { ico } from './ui.js';
import { tween, ease, popIn, clamp } from './tween.js';

const $ = (id) => document.getElementById(id);

export class Crafting {
  constructor({ world, getState, player, input, ui, onCrafted }) {
    this.world = world;
    this.getState = getState;
    this.player = player;
    this.input = input;
    this.ui = ui;
    this.onCrafted = onCrafted;
    this.active = null;
    this.preview = null;
    this.hold = null;
    this.el = { root: $('station'), title: $('station-title'), step: $('station-step'), ui: $('station-ui') };
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
    this.active = { id, st, step: 0, choice: {}, scores: [] };
    this.player.focus({ pos: st.cam, look: st.look });
    this.input.exitLock();
    this.el.root.hidden = false;
    this.ui.setHud(false);
    this.ui.setStationTitle({ candle: 'Candle Bench', lamp: 'Lamp Bench', lens: 'Lens Grinder', glass: 'Glass Table' }[id]);
    this.restart();
    audio.play('cloth', { volume: 0.4 });
    return true;
  }

  restart() {
    const id = this.active.id;
    if (id === 'candle') this.candleStep0();
    else if (id === 'lamp') this.lampStep0();
    else if (id === 'lens') this.lensStep0();
    else this.glassStep0();
  }

  close() {
    if (!this.active) return;
    this.stopDial?.();
    this.clearPreview();
    this.stopHold();
    if (this.active.st.flame) this.active.st.flame.scale.setScalar(1);
    this.active = null;
    this.player.unfocus();
    this.el.root.hidden = true;
    this.el.ui.innerHTML = '';
    this.ui.setHud(true);
    this.ui.resumePointer();
  }

  setStep(text) { this.el.step.textContent = text; }
  options(list, onPick) {
    this.el.ui.innerHTML = '';
    for (const o of list) {
      const b = document.createElement('button');
      b.className = 'opt';
      b.disabled = !!o.locked;
      const icon = o.icon ? (o.icon.startsWith('i-') ? ico(o.icon) : `<span style="font-size:26px;line-height:30px">${o.icon}</span>`) : '';
      b.innerHTML = `${o.color ? `<span class="dot" style="background:${o.color}"></span>` : icon}<span>${o.label}</span>${o.sub ? `<small>${o.sub}</small>` : ''}`;
      if (o.locked) b.style.opacity = '.45';
      b.addEventListener('click', () => { audio.play('key_click', { volume: 0.5 }); onPick(o.value); });
      this.el.ui.appendChild(b);
    }
  }

  holdMeter({ label, rate = 0.42, zone = [0.68, 0.9], onTick, onDone }) {
    this.el.ui.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:12px;justify-items:center';
    wrap.innerHTML = `<div class="meter"><span class="zone" style="left:${zone[0] * 100}%;width:${(zone[1] - zone[0]) * 100}%"></span><i></i></div>`;
    const btn = document.createElement('button');
    btn.className = 'opt hold';
    btn.textContent = label;
    wrap.appendChild(btn);
    this.el.ui.appendChild(wrap);
    const bar = wrap.querySelector('i');
    this.hold = { v: 0, down: false, rate, zone, bar, onTick, onDone, done: false };
    const down = (e) => { e?.preventDefault?.(); if (this.hold && !this.hold.done) { this.hold.down = true; this.hold.onTick?.('start'); } };
    const up = () => {
      const h = this.hold;
      if (!h || !h.down || h.done) return;
      h.down = false;
      if (h.v < 0.12) { h.onTick?.('stop'); return; } // a tiny tap doesn't count
      h.done = true;
      h.onTick?.('stop');
      const mid = (zone[0] + zone[1]) / 2;
      const score = h.v >= zone[0] && h.v <= zone[1] ? 3 : Math.abs(h.v - mid) < 0.3 ? 2 : 1;
      setTimeout(() => onDone(score, h.v), 250);
    };
    btn.addEventListener('pointerdown', down);
    addEventListener('pointerup', up, { once: false });
    this.hold.release = up;
    this.hold.cleanup = () => removeEventListener('pointerup', up);
    this.keyHold = (e) => { if (e.code === 'Space') { if (e.type === 'keydown' && !e.repeat) down(); if (e.type === 'keyup') up(); } };
    addEventListener('keydown', this.keyHold);
    addEventListener('keyup', this.keyHold);
  }

  stopHold() {
    this.hold?.cleanup?.();
    this.hold = null;
    if (this.keyHold) { removeEventListener('keydown', this.keyHold); removeEventListener('keyup', this.keyHold); this.keyHold = null; }
    audio.stopLoop('pour_loop', 0.3);
  }

  timingBar({ label, onDone }) {
    this.el.ui.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:12px;justify-items:center';
    wrap.innerHTML = `<div class="meter"><span class="zone" style="left:40%;width:20%"></span><i style="width:10px;left:0;border-radius:6px"></i></div>`;
    const btn = document.createElement('button');
    btn.className = 'opt hold';
    btn.textContent = label;
    wrap.appendChild(btn);
    this.el.ui.appendChild(wrap);
    const mark = wrap.querySelector('i');
    this.swing = { t: 0, mark, done: false };
    const go = () => {
      if (!this.swing || this.swing.done) return;
      this.swing.done = true;
      const v = this.swing.v;
      const score = Math.abs(v - 0.5) < 0.1 ? 3 : Math.abs(v - 0.5) < 0.25 ? 2 : 1;
      setTimeout(() => onDone(score), 200);
    };
    btn.addEventListener('click', go);
    this.keyGo = (e) => { if (e.code === 'Space') { e.preventDefault(); go(); } };
    addEventListener('keydown', this.keyGo, { once: true });
  }

  clearPreview() {
    if (this.stream) { this.stream.visible = false; }
    if (this.preview) this.preview.parent?.remove(this.preview);
    this.preview = null;
    if (this.extra) for (const e of this.extra) if (e !== this.stream) e.parent?.remove(e);
    this.extra = [];
  }

  // ---------------- Candle bench ----------------
  candleStep0() {
    const s = this.getState();
    this.setStep(`Choose a mould · ${s.supplies.candle} uses of wax left`);
    this.options(Object.entries(CANDLE_FORMS).map(([id, f]) => ({ value: id, label: f.name, sub: `sells ~${f.market.toFixed(0)}`, icon: 'i-candle', locked: !hasLicence(s, f.licence) })), (form) => {
      this.active.choice.form = form;
      this.clearPreview();
      const st = this.active.st;
      const g = new THREE.Group();
      g.position.set(st.center.x + 0.35, 0.975, st.center.z + 0.05);
      g.scale.setScalar(2.2);
      const mould = new THREE.Mesh(new THREE.CylinderGeometry(form === 'jar' ? 0.05 : form === 'taper' ? 0.03 : 0.05, 0.05, form === 'taper' ? 0.2 : 0.13, 20, 1, true), new THREE.MeshToonMaterial({ color: '#a8aca2', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      mould.position.y = form === 'taper' ? 0.1 : 0.065;
      mould.layers.set(1);
      const c = candle(form, 'cream');
      c.scale.y = 0.02;
      g.add(c, mould);
      this.world.scene.add(g);
      this.preview = g;
      this.preview.userData.candle = c;
      this.preview.userData.mould = mould;
      popIn(g, { from: 0.6 });
      audio.play('place_wood', { volume: 0.5 });
      this.candleStep1();
    });
  }

  candleStep1() {
    this.setStep('Hold to pour the warm wax — let go in the green');
    const st = this.active.st;
    if (!this.stream) {
      this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, 1, 8), new THREE.MeshToonMaterial({ color: '#f6e7c4', emissive: new THREE.Color('#3a2a10') }));
      this.world.scene.add(this.stream);
    }
    const top = this.preview.position.clone().add(new THREE.Vector3(0, 0.42, 0));
    this.stream.position.copy(top).add(new THREE.Vector3(0, -0.14, 0));
    this.stream.scale.set(1, 0.28, 1);
    this.stream.visible = false;
    if (st.flame) tween({ duration: 0.5, easing: ease.outBack, update: (k) => st.flame.scale.setScalar(1 + k * 0.4) });
    this.holdMeter({
      label: 'Hold to pour',
      rate: 0.38,
      onTick: (ev) => {
        if (ev === 'start') audio.loop('pour_loop', { volume: 0.55, pos: st.center });
        else audio.stopLoop('pour_loop', 0.3);
        this.stream.visible = ev === 'start';
      },
      onDone: (score) => {
        this.stopHold();
        this.active.scores.push(score);
        this.candleStep2();
      },
    });
  }

  candleStep2() {
    this.setStep('Drop the wick in the middle');
    const c = this.preview.userData.candle;
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 5), new THREE.MeshToonMaterial({ color: '#3b2a20' }));
    wick.position.set(0, 0.32, 0);
    this.preview.add(wick);
    this.extra.push(wick);
    this.wick = wick;
    this.timingBar({
      label: 'Drop wick',
      onDone: (score) => {
        this.active.scores.push(score);
        const sway = this.swing ? (this.swing.v - 0.5) * 0.04 : 0;
        this.swing = null;
        tween({ duration: 0.35, easing: ease.outCubic, update: (k) => { wick.position.y = 0.32 - k * 0.17; wick.position.x = sway * (1 - k * 0.6); } });
        audio.play('cloth', { volume: 0.35 });
        void c;
        this.candleStep3();
      },
    });
  }

  candleStep3() {
    const s = this.getState();
    this.setStep('Pick a colour');
    this.options(Object.entries(CANDLE_COLORS).map(([id, c]) => ({ value: id, label: c.name, color: c.hex, locked: !hasLicence(s, c.licence) })), (color) => {
      this.active.choice.color = color;
      const target = new THREE.Color(CANDLE_COLORS[color].hex);
      this.preview.userData.candle.traverse((o) => {
        if (o.isMesh && o.material?.color && o.material.color.getHex() !== 0x3b2a20 && !o.material.transparent) {
          o.material = o.material.clone();
          const from = o.material.color.clone();
          tween({ duration: 0.6, easing: ease.inOutSine, update: (k) => o.material.color.copy(from).lerp(target, k) });
        }
      });
      audio.play('clink', { volume: 0.5 });
      this.finishCandle();
    });
  }

  finishCandle() {
    this.el.ui.innerHTML = '';
    this.setStep('Cooling…');
    const g = this.preview;
    const mould = g.userData.mould;
    tween({ duration: 1.4, easing: ease.inOutSine, update: (k) => { mould.material.opacity = 0.45 * (1 - k); } });
    setTimeout(() => {
      if (!this.active) return;
      const { form, color } = this.active.choice;
      const stars = clamp(Math.round(this.active.scores.reduce((a, b) => a + b, 0) / this.active.scores.length), 1, 3);
      const key = candleKey(form, color, stars);
      this.complete(key, stars);
    }, 1500);
  }

  // ---------------- Lamp bench ----------------
  lampStep0() {
    const s = this.getState();
    this.setStep(`Choose a base · ${s.supplies.lamp} kits left`);
    this.options(Object.entries(LAMP_BASES).map(([id, b]) => ({ value: id, label: b.name, color: b.hex, locked: !hasLicence(s, b.licence) })), (base) => {
      this.active.choice.base = base;
      this.rebuildLamp({ bulb: false, shade: null });
      audio.play('place_wood', { volume: 0.55 });
      this.lampStep1();
    });
  }

  rebuildLamp({ bulb = true, shade = null, filter = 'white', on = false }) {
    const old = this.preview;
    const st = this.active.st;
    const g = new THREE.Group();
    g.position.set(st.center.x + 0.1, 0.975, st.center.z + 0.05);
    g.scale.setScalar(1.7);
    const l = lamp(this.active.choice.base, shade || 'drum', filter, { on });
    l.children.forEach((ch, i) => {
      if (!bulb && (i === 2)) ch.visible = false;
      if (!shade && i === 3) ch.visible = false;
    });
    g.add(l);
    g.userData.lamp = l;
    this.world.scene.add(g);
    if (old) old.parent?.remove(old);
    this.preview = g;
    return l;
  }

  lampStep1() {
    this.setStep('Hold to screw in the bulb — snug, not too tight');
    const l = this.preview.userData.lamp;
    const bulb = l.children[2];
    bulb.visible = true;
    bulb.position.y = 0.32;
    this.holdMeter({
      label: 'Hold to screw',
      rate: 0.45,
      onTick: (ev) => { if (ev === 'start') audio.play('wind_key', { volume: 0.5 }); },
      onDone: (score) => {
        this.stopHold();
        this.active.scores.push(score);
        audio.play('key_click', { volume: 0.5 });
        this.lampStep2();
      },
    });
    this.screwBulb = bulb;
  }

  lampStep2() {
    this.screwBulb = null;
    this.setStep('Pick a shade');
    this.options(Object.entries(LAMP_SHADES).map(([id, sh]) => ({ value: id, label: sh.name, icon: id === 'dome' ? '◓' : id === 'pleat' ? '⛱' : '▭' })), (shade) => {
      this.active.choice.shade = shade;
      const l = this.rebuildLamp({ shade });
      popIn(l.children[3], { from: 0.5 });
      audio.play(shade === 'dome' ? 'place_glass' : 'paper', { volume: 0.5 });
      this.lampStep3();
    });
  }

  lampStep3() {
    this.setStep('Choose the glow');
    this.options(Object.entries(LAMP_FILTERS).map(([id, f]) => ({ value: id, label: f.name, color: f.hex })), (filter) => {
      this.active.choice.filter = filter;
      this.rebuildLamp({ shade: this.active.choice.shade, filter });
      this.lampStep4();
    });
  }

  lampStep4() {
    this.setStep('Flip the switch!');
    this.options([{ value: 1, label: 'Switch on', icon: '💡' }], () => {
      audio.play('lamp_switch', { volume: 0.7 });
      const { shade, filter } = this.active.choice;
      this.rebuildLamp({ shade, filter, on: true });
      const light = new THREE.PointLight(LAMP_FILTERS[filter].light, 0, 3, 2);
      light.position.copy(this.preview.position).add(new THREE.Vector3(0, 0.45, 0));
      this.world.scene.add(light);
      this.extra.push(light);
      tween({ duration: 0.5, easing: ease.outCubic, update: (k) => { light.intensity = k * 2.5; } });
      this.el.ui.innerHTML = '';
      setTimeout(() => {
        if (!this.active) return;
        const stars = clamp(Math.round(this.active.scores.reduce((a, b) => a + b, 0) / this.active.scores.length + (filter ? 0.2 : 0)), 1, 3);
        this.complete(lampKey(this.active.choice.base, shade, filter, stars), stars);
      }, 900);
    });
  }

  // ---------------- Lens grinder ----------------
  lensStep0() {
    const s = this.getState();
    this.setStep(`Choose what to grind · ${s.supplies.lens} blanks left`);
    this.options(Object.entries(LENS_FORMS).map(([id, f]) => ({ value: id, label: f.name, sub: `sells ~${f.market}`, icon: 'i-lens', locked: !hasLicence(s, f.licence) })), (form) => {
      this.active.choice.form = form;
      this.lensStep1();
    });
  }

  lensStep1() {
    this.setStep('Mount the glass blank on the wheel');
    this.options([{ value: 1, label: 'Mount blank', icon: 'i-lens' }], () => {
      const st = this.active.st;
      this.clearPreview();
      const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 28), new THREE.MeshToonMaterial({ color: '#b9cfd2', transparent: true, opacity: 0.75 }));
      blank.rotation.z = Math.PI / 2;
      const g = new THREE.Group();
      g.add(blank);
      g.position.set(st.center.x - 0.2, 1.16, st.center.z + 0.0);
      g.scale.setScalar(1.4);
      this.world.scene.add(g);
      this.preview = g;
      popIn(g, { from: 0.4 });
      audio.play('place_glass', { volume: 0.6 });
      this.lensStep2();
    });
  }

  lensStep2() {
    this.setStep('Draw slow circles on the ring to polish the lens');
    this.el.ui.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:12px;justify-items:center';
    wrap.innerHTML = '<div class="dial-pad"><i></i></div><div class="meter"><i></i></div>';
    this.el.ui.appendChild(wrap);
    const pad = wrap.querySelector('.dial-pad');
    const knob = pad.querySelector('i');
    const bar = wrap.querySelector('.meter i');
    const need = Math.PI * 2 * 4;      // four full turns
    const d = { angle: null, total: 0, off: 0, samples: 0, down: false, lastRub: 0 };
    const move = (e) => {
      if (!d.down) return;
      const r = pad.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const rad = Math.hypot(x, y) / (r.width / 2);
      const a = Math.atan2(y, x);
      knob.style.left = `${50 + Math.cos(a) * 33.5}%`;
      knob.style.top = `${50 + Math.sin(a) * 33.5}%`;
      if (d.angle !== null) {
        let da = a - d.angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        d.total += Math.abs(da);
        this.lensSpin = Math.abs(da) * 60;
        if (d.total - d.lastRub > 1.2) { audio.play('cloth', { volume: 0.25, rate: 1.4 }); d.lastRub = d.total; }
      }
      d.angle = a;
      d.off += Math.abs(rad - 0.67);
      d.samples++;
      bar.style.width = `${Math.min(100, (d.total / need) * 100)}%`;
      const k = Math.min(1, d.total / need);
      if (this.preview) this.preview.children[0].material.opacity = 0.75 - k * 0.45;
      if (d.total >= need) finish();
    };
    const finish = () => {
      if (d.done) return;
      d.done = true;
      this.stopDial();
      const wobble = d.off / Math.max(1, d.samples);
      this.active.scores.push(wobble < 0.12 ? 3 : wobble < 0.25 ? 2 : 1);
      audio.play('clink', { volume: 0.5 });
      setTimeout(() => this.lensStep3(), 300);
    };
    const down = (e) => { d.down = true; d.angle = null; pad.setPointerCapture?.(e.pointerId); move(e); };
    const up = () => { d.down = false; d.angle = null; };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    this.stopDial = () => { removeEventListener('pointerup', up); this.stopDial = null; this.lensSpin = 0; };
  }

  lensStep3() {
    this.setStep('Hold it up to the light');
    this.options([{ value: 1, label: 'Inspect', icon: 'i-sparkle' }], () => {
      const st = this.active.st;
      const form = this.active.choice.form;
      this.clearPreview();
      const l = lens(form, { polish: 1 });
      const g = new THREE.Group();
      g.add(l);
      g.position.set(st.center.x, 0.98, st.center.z + 0.05);
      g.scale.setScalar(2.2);
      this.world.scene.add(g);
      this.preview = g;
      tween({ duration: 0.8, easing: ease.outBack, update: (k) => { g.position.y = 0.98 + k * 0.25; g.rotation.y = k * Math.PI * 0.4; } });
      audio.play('clink', { volume: 0.5, rate: 1.3 });
      this.el.ui.innerHTML = '';
      setTimeout(() => {
        if (!this.active) return;
        const stars = clamp(Math.round(this.active.scores.reduce((a, b) => a + b, 0) / this.active.scores.length), 1, 3);
        this.complete(lensKey(form, stars), stars);
      }, 900);
    });
  }

  // ---------------- Stained glass table ----------------
  glassStep0() {
    const s = this.getState();
    this.setStep(`Choose a pattern · ${s.supplies.glass} sheets left`);
    this.options(Object.entries(GLASS_PATTERNS).map(([id, p]) => ({ value: id, label: p.name, icon: 'i-glass' })), (pattern) => {
      this.active.choice.pattern = pattern;
      this.glassStep1('c1');
    });
  }

  glassStep1(which) {
    this.setStep(which === 'c1' ? 'Pick the colour for the picture' : 'Pick the colour for the background');
    this.options(Object.entries(GLASS_COLORS).filter(([id]) => id !== this.active.choice.c1).map(([id, c]) => ({ value: id, label: c.name, color: c.hex })), (c) => {
      this.active.choice[which] = c;
      audio.play('clink', { volume: 0.4 });
      if (which === 'c1') this.glassStep1('c2'); else this.glassStep2();
    });
  }

  glassStep2() {
    const { pattern, c1, c2 } = this.active.choice;
    const st = this.active.st;
    this.clearPreview();
    const filled = new Set();
    const g = new THREE.Group();
    const panel = glassPanel(pattern, c1, c2, { filled });
    panel.rotation.x = -Math.PI / 2 + 0.25;
    panel.position.set(0, 0.02, 0.12);
    g.add(panel);
    g.position.set(st.center.x, 0.95, st.center.z + 0.05);
    g.scale.setScalar(2.2);
    this.world.scene.add(g);
    this.preview = g;
    this.setStep('Lay each piece of glass — follow the glowing square (drag to go faster)');
    const P = GLASS_PATTERNS[pattern];
    this.el.ui.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'grid-pick';
    grid.style.gridTemplateColumns = 'repeat(5, 44px)';
    const order = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) order.push(r * 5 + c);
    let next = 0, misses = 0, painting = false;
    const buttons = order.map((i) => {
      const b = document.createElement('button');
      b.dataset.i = i;
      // a faint tint shows the pattern before it is laid
      const hint = (P.grid[Math.floor(i / 5)][i % 5] === '1' ? GLASS_COLORS[c1] : GLASS_COLORS[c2]).hex;
      b.style.background = `color-mix(in srgb, ${hint} 28%, #2a1c14)`;
      grid.appendChild(b);
      return b;
    });
    const mark = () => buttons.forEach((b, i) => b.classList.toggle('want', i === order[next] && !filled.has(i)));
    const fill = (i) => {
      if (filled.has(i)) return;
      if (i !== order[next]) misses++;
      filled.add(i);
      const r = Math.floor(i / 5), c = i % 5;
      const hex = (P.grid[r][c] === '1' ? GLASS_COLORS[c1] : GLASS_COLORS[c2]).hex;
      buttons[i].style.background = hex;
      buttons[i].classList.add('filled');
      for (const cell of panel.userData.cells) if (cell.userData.cell === i) { cell.visible = true; cell.userData.back.visible = true; popIn(cell, { from: 0.3, duration: 0.25 }); }
      audio.play('place_glass', { volume: 0.35, rate: 1 + (filled.size % 5) * 0.04 });
      while (next < order.length && filled.has(order[next])) next++;
      mark();
      if (filled.size === 25) {
        this.active.scores.push(misses <= 2 ? 3 : misses <= 6 ? 2 : 1);
        setTimeout(() => this.glassStep3(), 350);
      }
    };
    grid.addEventListener('pointerdown', (e) => { painting = true; const i = e.target.dataset.i; if (i !== undefined) fill(+i); e.preventDefault(); });
    grid.addEventListener('pointerover', (e) => { if (painting && e.target.dataset.i !== undefined) fill(+e.target.dataset.i); });
    addEventListener('pointerup', () => { painting = false; }, { once: false });
    this.el.ui.appendChild(grid);
    mark();
  }

  glassStep3() {
    this.setStep('Hold to solder the lead came — let go in the green');
    this.holdMeter({
      label: 'Hold to solder',
      rate: 0.4,
      onTick: (ev) => { if (ev === 'start') audio.loop('fire_loop', { volume: 0.4, pos: this.active.st.center, rate: 1.4 }); else audio.stopLoop('fire_loop', 0.3); },
      onDone: (score) => {
        this.stopHold();
        audio.loop('fire_loop', { volume: 0.08, pos: this.world.shop.stations.candle.pot });
        this.active.scores.push(score);
        this.glassStep4();
      },
    });
  }

  glassStep4() {
    this.setStep('Lift it up to the window light!');
    this.options([{ value: 1, label: 'Lift it up', icon: 'i-sparkle' }], () => {
      const g = this.preview;
      const panel = g.children[0];
      const from = panel.rotation.x;
      tween({ duration: 0.9, easing: ease.outBack, update: (k) => { panel.rotation.x = from + (0 - from) * k; g.position.y = 0.95 + k * 0.12; } });
      audio.play('clink', { volume: 0.5, rate: 1.2 });
      this.el.ui.innerHTML = '';
      setTimeout(() => {
        if (!this.active) return;
        const { pattern, c1, c2 } = this.active.choice;
        const stars = clamp(Math.round(this.active.scores.reduce((a, b) => a + b, 0) / this.active.scores.length), 1, 3);
        this.complete(glassKey(pattern, c1, c2, stars), stars);
      }, 1000);
    });
  }

  // ---------------- shared ----------------
  complete(key, stars) {
    const s = this.getState();
    const id = this.active.id;
    s.supplies[id] = Math.max(0, (s.supplies[id] || 0) - 1);
    s.crafted.push(key);
    s.stats.crafted++;
    s.xp += 6 + stars * 2;
    audio.play('till_ding', { volume: 0.4, rate: 1.4 });
    this.updateCrates();
    this.onCrafted?.(key, stars);
    this.setStep(`${productName(key)} — into the crate!`);
    this.el.ui.innerHTML = `<div class="opt" style="pointer-events:none"><span class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span><small>${stars === 3 ? 'Beautiful work' : stars === 2 ? 'Lovely' : 'Charming'}</small></div>`;
    const again = document.createElement('button');
    again.className = 'opt';
    again.innerHTML = `${ico('i-sparkle')}<span>Make another</span><small>${s.supplies[id] || 0} left</small>`;
    again.disabled = (s.supplies[id] || 0) <= 0;
    again.addEventListener('click', () => { this.clearPreview(); this.active.scores = []; this.active.choice = {}; this.restart(); });
    const done = document.createElement('button');
    done.className = 'opt';
    done.innerHTML = `${ico('i-check')}<span>Done</span>`;
    done.addEventListener('click', () => this.close());
    this.el.ui.append(again, done);
    // fly the preview into the crate
    const g = this.preview;
    const crate = this.world.shop.crates[id];
    if (g && crate) {
      const from = g.position.clone();
      const to = crate.pos.clone().add(new THREE.Vector3(0, 0.35, 0));
      const s0 = g.scale.x;
      tween({ duration: 0.8, delay: 0.5, easing: ease.inOutCubic, update: (k) => { g.position.lerpVectors(from, to, k); g.position.y += Math.sin(k * Math.PI) * 0.35; g.scale.setScalar(s0 * (1 - k * 0.6)); }, done: () => { this.clearPreview(); audio.play('box_soft', { volume: 0.5 }); } });
      this.preview = null;
      this.extra.push(g);
    }
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
        m.scale.setScalar(id === 'lamp' ? 0.9 : 1.3);
        m.position.set(((i % 3) - 1) * 0.14, Math.floor(i / 3) * 0.05, (Math.floor(i / 3) - 0.5) * 0.12);
        crate.contents.add(m);
      });
    }
    // supply bins on the benches
    for (const [id, st] of Object.entries(this.world.shop.stations)) {
      st.supplyBin.clear();
      const n = Math.min(6, s.supplies[id] || 0);
      for (let i = 0; i < n; i++) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), new THREE.MeshToonMaterial({ color: id === 'candle' ? '#f3e6c8' : '#a8aca2' }));
        block.position.set((i % 2) * 0.11 - 0.05, Math.floor(i / 2) * 0.052 + 0.025, 0);
        st.supplyBin.add(block);
      }
    }
    const locked = !hasLicence(s, 'lamps');
    this.world.shop.lampLocked.visible = locked;
  }

  update(dt) {
    const wheel = this.world.shop.stations.lens?.wheel;
    if (wheel) { this.wheelSpin = ((this.wheelSpin || 0) * Math.exp(-3 * dt)) + (this.lensSpin || 0) * dt; wheel.rotation.x += this.wheelSpin * dt * 4; if (this.preview && this.active?.id === 'lens') this.preview.rotation.x += this.wheelSpin * dt * 4; this.lensSpin = 0; }
    if (this.hold && !this.hold.done) {
      if (this.hold.down) this.hold.v = Math.min(1, this.hold.v + this.hold.rate * dt);
      this.hold.bar.style.width = `${this.hold.v * 100}%`;
      if (this.active?.id === 'candle' && this.preview?.userData.candle) this.preview.userData.candle.scale.y = Math.max(0.02, this.hold.v);
      if (this.screwBulb) { this.screwBulb.rotation.y += this.hold.down ? dt * 9 : 0; this.screwBulb.position.y = 0.32 - (0.32 - 0.205) * this.hold.v; }
      if (this.hold.v >= 1 && this.hold.down) this.hold.release();
    }
    if (this.swing && !this.swing.done) {
      this.swing.t += dt;
      const v = 0.5 + Math.sin(this.swing.t * 2.4) * 0.45;
      this.swing.v = v;
      this.swing.mark.style.left = `calc(${v * 100}% - 5px)`;
      if (this.wick) this.wick.position.x = (v - 0.5) * 0.05;
    }
  }
}

