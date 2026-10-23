// Hand-modelled-in-code products. Lathe silhouettes + toon shading so the
// things you craft and sell look unique, not like generic pack props.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow, textures, LAYER_NO_INK } from './render.js';
import { parseKey } from './state.js';
import { CANDLE_COLORS, LAMP_BASES, LAMP_FILTERS, STOCK, SUPPLIES } from './config.js';

const V = (x, y) => new THREE.Vector2(x, y);
const mats = new Map();
const mat = (hex, opts) => {
  const k = hex + JSON.stringify(opts || {});
  if (!mats.has(k)) mats.set(k, toon(hex, opts));
  return mats.get(k);
};
const glassMat = (hex = '#cfe3dc', opacity = 0.38) => {
  const k = 'glass' + hex + opacity;
  if (!mats.has(k)) mats.set(k, new THREE.MeshToonMaterial({ color: hex, transparent: true, opacity, depthWrite: false, gradientMap: mat('#fff').gradientMap }));
  return mats.get(k);
};

/** Flames register here so one update() makes them all flicker. */
export const flames = new Set();
export function updateFlames(t) {
  for (const f of flames) {
    let root = f;
    while (root.parent) root = root.parent;
    if (!root.isScene) { if (f.userData.attached) flames.delete(f); continue; }
    f.userData.attached = true;
    const s = f.userData.seed;
    const k = 1 + Math.sin(t * 11 + s) * 0.08 + Math.sin(t * 23.7 + s * 2) * 0.05;
    f.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
    f.rotation.z = Math.sin(t * 3.1 + s) * 0.08;
  }
}

function mesh(geo, m, noInk = false) {
  const o = new THREE.Mesh(geo, m);
  if (noInk) o.layers.set(1);
  return o;
}

export function flame(scale = 1) {
  const g = new THREE.Group();
  const outer = mesh(new THREE.SphereGeometry(0.012 * scale, 10, 8), glow('#ffb04a', 3.2), true);
  outer.scale.set(1, 1.9, 1);
  outer.position.y = 0.018 * scale;
  const inner = mesh(new THREE.SphereGeometry(0.006 * scale, 8, 6), glow('#fff4d0', 4), true);
  inner.scale.set(1, 1.6, 1);
  inner.position.y = 0.012 * scale;
  g.add(outer, inner);
  g.userData.seed = Math.random() * 100;
  flames.add(g);
  return g;
}

// ---------- Candles ----------
function pillar(colorHex, { lit = false, h = 0.12, r = 0.042 } = {}) {
  const g = new THREE.Group();
  const prof = [V(0, 0), V(r, 0), V(r, h - 0.008), V(r * 0.96, h), V(r * 0.7, h - 0.004), V(0, h - 0.006)];
  const body = mesh(new THREE.LatheGeometry(prof, 28), mat(colorHex));
  g.add(body);
  const wick = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.016, 6), mat('#3b2a20'));
  wick.position.y = h + 0.002;
  g.add(wick);
  // a few drips for character
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const d = mesh(new THREE.CapsuleGeometry(0.006, 0.02 + i * 0.006, 4, 8), mat(colorHex));
    d.position.set(Math.cos(a) * r * 0.98, h - 0.018 - i * 0.004, Math.sin(a) * r * 0.98);
    g.add(d);
  }
  if (lit) { const f = flame(); f.position.y = h + 0.01; g.add(f); }
  return g;
}

function taperPair(colorHex) {
  const g = new THREE.Group();
  const holder = mesh(new THREE.LatheGeometry([V(0, 0), V(0.05, 0), V(0.052, 0.008), V(0.03, 0.012), V(0, 0.012)], 24), mat('#a8aca2'));
  holder.scale.set(1.5, 1, 0.8);
  g.add(holder);
  for (const x of [-0.025, 0.025]) {
    const t = mesh(new THREE.LatheGeometry([V(0, 0), V(0.011, 0), V(0.01, 0.17), V(0.004, 0.182), V(0, 0.182)], 16), mat(colorHex));
    t.position.set(x, 0.01, 0);
    g.add(t);
    const w = mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.012, 5), mat('#3b2a20'));
    w.position.set(x, 0.197, 0);
    g.add(w);
  }
  return g;
}

function jarCandle(colorHex) {
  const g = new THREE.Group();
  const wax = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 24), mat(colorHex));
  wax.position.y = 0.032;
  g.add(wax);
  const jar = mesh(new THREE.LatheGeometry([V(0, 0), V(0.046, 0), V(0.048, 0.01), V(0.048, 0.088), V(0.044, 0.092), V(0.044, 0.096)], 24), glassMat(), true);
  g.add(jar);
  const band = mesh(new THREE.CylinderGeometry(0.0485, 0.0485, 0.018, 24, 1, true), mat('#d9c49e'));
  band.position.y = 0.05;
  g.add(band);
  const wick = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.014, 5), mat('#3b2a20'));
  wick.position.y = 0.068;
  g.add(wick);
  return g;
}

export function candle(form, color, { lit = false } = {}) {
  const hex = CANDLE_COLORS[color]?.hex ?? '#f3e6c8';
  if (form === 'taper') return taperPair(hex);
  if (form === 'jar') return jarCandle(hex);
  return pillar(hex, { lit });
}

// ---------- Lamps ----------
export function lamp(base, shade, filter, { on = true } = {}) {
  const g = new THREE.Group();
  const baseHex = LAMP_BASES[base]?.hex ?? '#8a5a3b';
  const fHex = LAMP_FILTERS[filter]?.hex ?? '#ffb35c';
  let foot;
  if (base === 'ceramic') foot = new THREE.LatheGeometry([V(0, 0), V(0.07, 0), V(0.075, 0.01), V(0.08, 0.06), V(0.06, 0.12), V(0.025, 0.15), V(0.02, 0.16), V(0, 0.16)], 28);
  else if (base === 'brass') foot = new THREE.LatheGeometry([V(0, 0), V(0.07, 0), V(0.07, 0.012), V(0.03, 0.022), V(0.014, 0.04), V(0.012, 0.14), V(0.022, 0.15), V(0.012, 0.16), V(0, 0.16)], 24);
  else foot = new THREE.LatheGeometry([V(0, 0), V(0.065, 0), V(0.065, 0.02), V(0.05, 0.03), V(0.02, 0.04), V(0.016, 0.16), V(0, 0.16)], 20);
  g.add(mesh(foot, mat(baseHex)));
  const socket = mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.03, 12), mat('#4b5350'));
  socket.position.y = 0.175;
  g.add(socket);
  const bulb = mesh(new THREE.SphereGeometry(0.026, 14, 10), on ? glow(fHex, 2.6) : mat('#efe6d4'), true);
  bulb.position.y = 0.205;
  g.add(bulb);
  let sh;
  if (shade === 'dome') {
    sh = mesh(new THREE.SphereGeometry(0.085, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMat(fHex, 0.55), true);
    sh.material = sh.material.clone();
    sh.material.side = THREE.DoubleSide;
    sh.position.y = 0.16;
  } else if (shade === 'pleat') {
    const n = 16;
    const geo = new THREE.CylinderGeometry(0.06, 0.1, 0.12, n * 2, 1, true);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + (Math.round((a / (Math.PI * 2)) * n * 2) % 2 ? 0.07 : 0);
      pos.setXYZ(i, x * k, pos.getY(i), z * k);
    }
    geo.computeVertexNormals();
    sh = mesh(geo, toon(on ? lighten(fHex, 0.35) : '#efe3c9', { side: THREE.DoubleSide, emissive: on ? new THREE.Color(fHex).multiplyScalar(0.55) : new THREE.Color(0) }));
    sh.position.y = 0.23;
  } else {
    sh = mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.11, 28, 1, true), toon(on ? lighten(fHex, 0.45) : '#efe3c9', { side: THREE.DoubleSide, emissive: on ? new THREE.Color(fHex).multiplyScalar(0.5) : new THREE.Color(0) }));
    sh.position.y = 0.23;
  }
  g.add(sh);
  g.userData.bulb = bulb;
  return g;
}

function lighten(hex, k) { return '#' + new THREE.Color(hex).lerp(new THREE.Color('#fff8ec'), k).getHexString(); }

// ---------- Stock ----------
function matchbox() {
  const g = new THREE.Group();
  const tex = textures.label('MATCH', { bg: '#c8463b', fg: '#fff3dc', border: '#8d2c25', size: 40 });
  const top = new THREE.MeshToonMaterial({ map: tex, gradientMap: mat('#fff').gradientMap });
  const side = mat('#e7d6b4');
  const box = mesh(new RoundedBoxGeometry(0.075, 0.022, 0.05, 2, 0.004), [side, side, top, side, side, side]);
  box.position.y = 0.011;
  g.add(box);
  return g;
}

function tealightTin() {
  const g = new THREE.Group();
  const tin = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 28), mat('#b8bdb3'));
  tin.position.y = 0.02;
  g.add(tin);
  const lid = mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.008, 28), mat('#d8b65a'));
  lid.position.y = 0.043;
  g.add(lid);
  const dot = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.002, 20), mat('#f6ecd8'));
  dot.position.y = 0.048;
  g.add(dot);
  return g;
}

function oilBottle() {
  const g = new THREE.Group();
  const prof = [V(0, 0), V(0.034, 0), V(0.036, 0.01), V(0.036, 0.09), V(0.028, 0.11), V(0.013, 0.125), V(0.013, 0.15), V(0, 0.15)];
  const b = mesh(new THREE.LatheGeometry(prof, 20), toon('#d58f3a', { transparent: true, opacity: 0.85 }));
  g.add(b);
  const cork = mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.02, 10), mat('#b9895a'));
  cork.position.y = 0.158;
  g.add(cork);
  const label = mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.04, 20, 1, true), mat('#f3e6c8'));
  label.position.y = 0.05;
  g.add(label);
  return g;
}

function bulbPack() {
  const g = new THREE.Group();
  const sleeve = mesh(new RoundedBoxGeometry(0.06, 0.09, 0.06, 2, 0.006), mat('#e9dcc4'));
  sleeve.position.y = 0.045;
  g.add(sleeve);
  const bulb = mesh(new THREE.SphereGeometry(0.026, 14, 10), glow('#ffe2a8', 1.4), true);
  bulb.position.y = 0.115;
  g.add(bulb);
  const screw = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 10), mat('#a8aca2'));
  screw.position.y = 0.092;
  g.add(screw);
  return g;
}

export function tinLantern({ lit = false } = {}) {
  const g = new THREE.Group();
  const tin = mat('#6f7a74');
  const base = mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.02, 6), tin);
  base.position.y = 0.01;
  g.add(base);
  const glass = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.13, 6, 1, true), glassMat('#fff0cc', lit ? 0.5 : 0.3), true);
  glass.position.y = 0.085;
  g.add(glass);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = mesh(new THREE.BoxGeometry(0.008, 0.13, 0.008), tin);
    p.position.set(Math.cos(a) * 0.052, 0.085, Math.sin(a) * 0.052);
    g.add(p);
  }
  const roof = mesh(new THREE.ConeGeometry(0.068, 0.06, 6), tin);
  roof.position.y = 0.18;
  g.add(roof);
  const ring = mesh(new THREE.TorusGeometry(0.022, 0.004, 6, 16), tin);
  ring.position.y = 0.225;
  g.add(ring);
  const c = pillar('#f3e6c8', { lit, h: 0.05, r: 0.016 });
  c.position.y = 0.02;
  g.add(c);
  return g;
}

export function stockMesh(id) {
  switch (id) {
    case 'matches': return matchbox();
    case 'tealights': return tealightTin();
    case 'oil': return oilBottle();
    case 'bulbs': return bulbPack();
    case 'lantern': return tinLantern();
    default: return matchbox();
  }
}

/** Any product key → a mesh, normalised so its origin sits on the base. */
export function productMesh(key, opts = {}) {
  const p = parseKey(key);
  let m;
  if (p.kind === 'candle') m = candle(p.form, p.color, opts);
  else if (p.kind === 'lamp') m = lamp(p.base, p.shade, p.filter, opts);
  else m = stockMesh(p.id);
  m.userData.key = key;
  return m;
}

// ---------- Delivery box ----------
const boxGeo = new RoundedBoxGeometry(0.46, 0.3, 0.36, 3, 0.02);
const labelCache = new Map();
export function deliveryBox(key, { open = false } = {}) {
  const g = new THREE.Group();
  const p = parseKey(key);
  const info = p.kind === 'supply' ? SUPPLIES[p.id] : STOCK[p.id];
  const card = mat(p.kind === 'supply' ? '#b99062' : '#c99a66');
  const body = mesh(boxGeo, card);
  body.position.y = 0.15;
  g.add(body);
  const tape = mesh(new THREE.BoxGeometry(0.08, 0.004, 0.365), mat('#e8d4a8'));
  tape.position.y = 0.301;
  g.add(tape);
  if (!labelCache.has(key)) {
    labelCache.set(key, new THREE.MeshToonMaterial({ map: textures.label(`${info?.icon ?? ''} ${info?.name ?? key}`, { size: 30, w: 320, h: 96 }), gradientMap: mat('#fff').gradientMap }));
  }
  const label = mesh(new THREE.PlaneGeometry(0.3, 0.09), labelCache.get(key));
  label.position.set(0, 0.16, 0.181);
  g.add(label);
  const flapGeo = new THREE.BoxGeometry(0.44, 0.006, 0.17);
  const flaps = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.3, s * 0.175);
    const f = mesh(flapGeo, card);
    f.position.z = -s * 0.085;
    pivot.add(f);
    pivot.visible = open;
    pivot.rotation.x = s * 2.2;
    g.add(pivot);
    flaps.push(pivot);
  }
  g.userData.flaps = flaps;
  g.userData.tape = tape;
  g.userData.key = key;
  return g;
}

export function setBoxOpen(box, open) {
  box.userData.flaps?.forEach((f) => { f.visible = open; });
  if (box.userData.tape) box.userData.tape.visible = !open;
}

/** Footprint spacing per product for laying items out on a shelf section. */
export function footprint(key) {
  const p = parseKey(key);
  if (p.kind === 'lamp') return { w: 0.24, d: 0.22 };
  if (p.kind === 'stock' && p.id === 'lantern') return { w: 0.16, d: 0.16 };
  if (p.kind === 'candle' && p.form === 'taper') return { w: 0.13, d: 0.11 };
  if (p.kind === 'stock' && p.id === 'matches') return { w: 0.09, d: 0.07 };
  return { w: 0.11, d: 0.11 };
}

export { LAYER_NO_INK };
