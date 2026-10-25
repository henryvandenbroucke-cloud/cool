// The guided tutorial: a task card at the top, a glowing path of moving
// chevrons along the floor to the next thing to do, and a bobbing marker over it.

import * as THREE from 'three';
import { LAYER_NO_INK } from './render.js';
import { parseKey } from './state.js';


function stockBox(g) {
  return g.state.boxes.find((b) => b.at !== 'held' && b.at !== 'staff' && parseKey(b.key).kind === 'stock' && b.count > 0);
}
function supplyBox(g, station) {
  return g.state.boxes.find((b) => b.at !== 'held' && b.at !== 'staff' && b.key === `supply:${station === 'candle' ? 'candle_supplies' : 'lamp_kit'}`);
}
const boxTarget = (g, b) => {
  const m = b && g.boxMeshes.get(b.id);
  return m ? { pos: m.position.clone().setY(0.75), floor: m.position.clone().setY(0) } : null;
};
function sectionTarget(g, key) {
  const sh = g.shelves;
  let best = null, bestD = Infinity;
  for (const [id, sec] of sh.sections) {
    if (id.startsWith('S-')) continue;
    const ok = key ? sh.accepts(id, key) && (sh.data(id)?.key === key || !sh.data(id)) : true;
    if (!ok) continue;
    const d = sec.customerSpot.distanceTo(g.player.pos);
    if (d < bestD) { bestD = d; best = sec; }
  }
  if (!best) return null;
  return { pos: best.holder.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.35, 0)), floor: best.customerSpot.clone() };
}
const fixed = (x, y, z, fx, fz) => ({ pos: new THREE.Vector3(x, y, z), floor: new THREE.Vector3(fx ?? x, 0, fz ?? z) });

// Each step is one clear action. title + act can change with what you're holding.
const click = (g, what) => `${g.input.touch ? 'Tap' : 'Click'} ${what}`;
export const STEPS = [
  {
    icon: 'i-box',
    title: () => 'Pick up the delivery box',
    act: (g) => click(g, 'the box on the porch'),
    label: 'Pick up',
    target: (g) => boxTarget(g, stockBox(g)),
    done: (g) => (g.held?.type === 'box' && parseKey(g.held.box.key).kind === 'stock') || Object.keys(g.state.sections).length > 0,
  },
  {
    icon: 'i-crate',
    title: () => 'Put the stock on a shelf',
    act: (g) => (g.held?.type === 'box' ? click(g, 'the glowing shelf to place items') : click(g, 'the box to pick it up again')),
    label: 'Place here',
    target: (g) => (g.held?.type === 'box' ? sectionTarget(g, g.held.box.key) : boxTarget(g, stockBox(g))),
    done: (g) => Object.values(g.state.sections).some((d) => d.count > 0),
  },
  {
    icon: 'i-tag',
    title: () => 'Set your price',
    act: (g) => click(g, 'the price tag on the shelf'),
    label: 'Price tag',
    target: (g) => {
      const id = Object.keys(g.state.sections).find((k) => g.state.sections[k].count > 0);
      const sec = id && g.shelves.sections.get(id);
      return sec ? { pos: sec.tag.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0)), floor: sec.customerSpot.clone() } : null;
    },
    done: (g) => g.flags.priceOpened || g.state.supplies.candle > 0 || g.state.stats.crafted > 0,
  },
  {
    icon: 'i-candle',
    title: () => 'Load the candle bench',
    act: (g) => (g.held?.type === 'box' && g.held.box.key === 'supply:candle_supplies' ? click(g, 'the candle bench') : g.held ? 'Put down what you carry (E)' : click(g, 'the Candle Supplies box')),
    label: 'Candle supplies',
    target: (g) => {
      if (g.held?.type === 'box' && g.held.box.key === 'supply:candle_supplies') return fixed(-3.3, 1.35, -3.5, -3.1, -2.6);
      if (g.held) return null;
      return boxTarget(g, supplyBox(g, 'candle'));
    },
    done: (g) => g.state.supplies.candle > 0 || g.state.stats.crafted > 0,
  },
  {
    icon: 'i-candle',
    title: () => 'Make your first candle',
    act: (g) => click(g, 'the candle bench'),
    label: 'Candle bench',
    target: () => fixed(-3.3, 1.35, -3.5, -3.1, -2.6),
    done: (g) => g.state.stats.crafted > 0,
  },
  {
    icon: 'i-crate',
    title: () => 'Put your candle on a shelf',
    act: (g) => (g.held?.type === 'crate' ? click(g, 'a shelf') : click(g, 'the crate by the bench')),
    label: 'Crate',
    target: (g) => (g.held?.type === 'crate' ? sectionTarget(g, g.state.crafted.find((k) => k.startsWith(g.held.id)) || null) : fixed(-1.55, 0.9, -3.55, -1.55, -2.85)),
    done: (g) => Object.values(g.state.sections).some((d) => d.key.startsWith('candle') && d.count > 0) || g.state.stats.sold > 0,
  },
  {
    icon: 'i-bell',
    title: () => 'Open the shop',
    act: (g) => click(g, 'the sign on the front door'),
    label: 'Open sign',
    target: () => fixed(2.9, 1.65, 4.02, 2.9, 3.2),
    done: (g) => g.state.phase === 'shift',
  },
  {
    icon: 'i-coin',
    title: () => 'Serve your first customer',
    act: (g) => {
      const c = g.customers.current();
      if (!c) return 'Wait behind the counter';
      return g.customers.counterItems.some((x) => x.customer === c && !x.scanned) ? click(g, 'each item to scan it') : click(g, 'the register to take payment');
    },
    label: 'Counter',
    target: (g) => {
      const c = g.customers.current();
      if (!c) return fixed(3.62, 1.45, 0.05, 4.4, 0.05);
      const it = g.customers.counterItems.find((x) => x.customer === c && !x.scanned);
      if (it) return { pos: it.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0)), floor: new THREE.Vector3(4.4, 0, it.mesh.position.z) };
      return fixed(3.72, 1.55, 0.05, 4.4, 0.05);
    },
    done: (g) => g.state.stats.sold > 0,
  },
];

const pathVert = /* glsl */`
  attribute float along;
  attribute float side;
  varying float vAlong; varying float vSide;
  void main() { vAlong = along; vSide = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const pathFrag = /* glsl */`
  uniform float uTime; uniform float uLen; uniform vec3 uColor;
  varying float vAlong; varying float vSide;
  void main() {
    float chevron = fract(vAlong * 1.6 + abs(vSide) * 0.45 - uTime * 1.1);   // tips lead toward the goal
    float shape = smoothstep(0.0, 0.12, chevron) * (1.0 - smoothstep(0.32, 0.5, chevron));
    float edge = 1.0 - smoothstep(0.75, 1.0, abs(vSide));
    float fadeIn = smoothstep(0.2, 1.0, vAlong);
    float fadeOut = 1.0 - smoothstep(uLen - 0.5, uLen, vAlong);
    float a = (0.22 + 0.78 * shape) * edge * fadeIn * fadeOut;
    gl_FragColor = vec4(uColor * (1.2 + shape), a);
  }`;

export class Guide {
  constructor(game) {
    this.game = game;
    this.t = 0;
    this.recalc = 0;
    this.lastFrom = new THREE.Vector3(1e9, 0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: pathVert, fragmentShader: pathFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uLen: { value: 1 }, uColor: { value: new THREE.Color('#ffb35c') } },
    });
    this.path = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.path.layers.set(LAYER_NO_INK);
    this.path.frustumCulled = false;
    this.path.renderOrder = 4;
    // marker: a glowing arrow and a ring on the floor
    this.marker = new THREE.Group();
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc27a').multiplyScalar(2.2), transparent: true, opacity: 0.95 });
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), glowMat);
    arrow.rotation.x = Math.PI;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), glowMat);
    gem.position.y = 0.2;
    this.marker.add(arrow, gem);
    this.marker.traverse((o) => { o.layers.set(LAYER_NO_INK); o.renderOrder = 20; });
    this.arrow = arrow;
    this.gem = gem;
    const ringGeo = new THREE.RingGeometry(0.28, 0.36, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb35c').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.ring.layers.set(LAYER_NO_INK);
    game.scene.add(this.path, this.marker, this.ring);
    // a screen-space label that follows the target, or points to it from the edge
    this.pin = document.getElementById('guide-pin');
    this.pinLabel = this.pin.querySelector('b');
    this.pinDist = this.pin.querySelector('small');
    this.hide();
    this.doneT = 0;
  }

  get active() { const s = this.game.state; return !s.tutorialDone; }

  hide() { this.path.visible = false; this.marker.visible = false; this.ring.visible = false; this.pin.hidden = true; }

  /** Place the HUD pin over the target, or clamp it to the screen edge as an arrow. */
  placePin(target, label) {
    const cam = this.game.camera;
    const p = target.pos.clone().project(cam);
    const behind = p.z > 1;
    const W = innerWidth, H = innerHeight, m = 56;
    let x = (p.x * 0.5 + 0.5) * W, y = (-p.y * 0.5 + 0.5) * H;
    if (behind) { x = W - x; y = H - m; }
    const on = !behind && x > m && x < W - m && y > m + 60 && y < H - m;
    const cx = Math.min(W - m, Math.max(m, x)), cy = Math.min(H - m, Math.max(m + 60, y));
    this.pin.hidden = false;
    this.pin.classList.toggle('edge', !on);
    this.pin.style.transform = `translate(${cx}px, ${cy}px)`;
    if (!on) this.pin.style.setProperty('--a', `${Math.atan2(y - cy, x - cx) || (behind ? Math.PI / 2 : 0)}rad`);
    this.pinLabel.textContent = label;
    const d = this.game.player.pos.distanceTo(target.floor);
    this.pinDist.textContent = d > 1.6 ? `${Math.round(d)} m` : '';
  }

  skip() {
    this.game.state.tutorialDone = true;
    this.hide();
    this.game.ui.guide(null);
  }

  restart() {
    this.game.state.tutorialDone = false;
    this.game.state.tutorial = 0;
    this.doneT = 0;
  }

  buildPath(points) {
    if (points.length < 2) { this.path.visible = false; return; }
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0.035, p.z)), false, 'centripetal');
    const len = curve.getLength();
    const segs = Math.max(4, Math.ceil(len * 6));
    const pos = [], along = [], side = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const n = new THREE.Vector3().crossVectors(up, tan).normalize().multiplyScalar(0.16);
      pos.push(p.x - n.x, p.y, p.z - n.z, p.x + n.x, p.y, p.z + n.z);
      along.push(u * len, u * len);
      side.push(-1, 1);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    geo.setAttribute('side', new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    this.path.geometry.dispose();
    this.path.geometry = geo;
    this.mat.uniforms.uLen.value = len;
    this.path.visible = true;
  }

  show(target, withPath = true) {
    if (!target) { this.hide(); return; }
    this.marker.visible = true;
    this.ring.visible = true;
    this.marker.position.copy(target.pos).add(new THREE.Vector3(0, 0.18 + Math.sin(this.t * 3) * 0.05, 0));
    this.gem.rotation.y = this.t * 2;
    this.ring.position.set(target.floor.x, 0.03, target.floor.z);
    const k = 1 + Math.sin(this.t * 4) * 0.12;
    this.ring.scale.setScalar(k);
    if (!withPath) { this.path.visible = false; return; }
    const from = this.game.player.pos;
    this.recalc -= this.dt;
    if (this.recalc <= 0 || from.distanceTo(this.lastFrom) > 0.5 || !this.lastTarget || target.floor.distanceTo(this.lastTarget) > 0.3) {
      this.recalc = 0.4;
      this.lastFrom.copy(from);
      this.lastTarget = target.floor.clone();
      if (from.distanceTo(target.floor) < 0.9) this.path.visible = false;
      else {
        // skip grid points right under (or behind) the player so the ribbon starts ahead of you
        const pts = this.game.customers.nav.find(from.clone(), target.floor.clone()).filter((q, i, a) => i === a.length - 1 || q.distanceTo(from) > 0.7);
        this.buildPath([from.clone(), ...pts]);
      }
    }
  }

  update(dt) {
    this.t += dt;
    this.dt = dt;
    this.mat.uniforms.uTime.value = this.t;
    const g = this.game;
    const s = g.state;
    if (g.photo.on || g.crafting.isOpen) { this.hide(); return; }
    if (s.tutorialDone) {
      if (this.doneT > 0) { this.doneT -= dt; if (this.doneT <= 0) g.ui.guide(null); }
      // gentle reminder when someone waits at the counter and you're far away
      const c = g.customers.current();
      const wren = s.staff.includes('wren') && s.phase === 'shift';
      if (c && !wren && g.player.pos.distanceTo(g.world.shop.anchors.playerBehindCounter) > 4.5) { const t = STEPS[7].target(g); this.show(t, false); this.placePin(t, 'Customer waiting'); }
      else this.hide();
      return;
    }
    let step = s.tutorial || 0;
    while (step < STEPS.length && STEPS[step].done(g)) step++;
    if (step !== s.tutorial) { s.tutorial = step; g.onTutorialStep?.(step); }
    if (step >= STEPS.length) {
      s.tutorialDone = true;
      g.ui.guide({ done: true, title: 'You’re ready, shopkeeper!', body: 'Order more stock from the ledger on the counter', n: STEPS.length, total: STEPS.length });
      this.doneT = 5;
      this.hide();
      return;
    }
    const S = STEPS[step];
    g.ui.guide({ n: step + 1, total: STEPS.length, title: S.title(g), body: S.act(g), icon: S.icon, touch: g.input.touch });
    const target = S.target(g);
    this.show(target);
    if (target) this.placePin(target, S.label);
  }
}
