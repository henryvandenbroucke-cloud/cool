// The forest-edge hamlet: storybook cottages built in code (so every window
// can light up), a pine forest from the Kenney nature kit, the lane and stream.

import * as THREE from 'three';
import { toon, glow, textures, LAYER_NO_INK } from './render.js';
import { placeable, instanced } from './assets.js';
import { HOUSES } from './config.js';
import { rng } from './tween.js';

const WALLS = ['#efe1c6', '#e9d3b0', '#f3e9d6', '#e6cfb4', '#ecdcc0'];
const ROOFS = ['#7d4a3c', '#5b6f63', '#8a5a3b', '#4f6170', '#9a5a46', '#6a5a4a'];
const DOORS = ['#4f6f6a', '#8a3f35', '#5d4a7a', '#3f5a6f', '#7a5a2f'];
const TIMBER = '#5a3c2c';

// Cottage spots (x, z). Each faces the shop.
const SPOTS = [
  [-9, 17], [14, 21], [-2, 19.5], [-19, 14], [7.5, 17], [21, 14.5],
  [-14, 23], [2.5, 27], [-25, 21], [13, 29], [27, 23],
];

export const WINDOW_OFF = new THREE.Color('#2b3a4a');
export const WINDOW_ON = new THREE.Color('#ffbe6a').multiplyScalar(2.4);

export function uvBox(w, h, d, density = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] * density, uv.getY(k) * dims[f][1] * density);
    }
  }
  return geo;
}

const matCache = {};
function m(hex, opts) { const k = hex + (opts ? JSON.stringify(opts) : ''); return (matCache[k] ||= toon(hex, opts)); }
let shingleTex, plasterTex, pathTex, grassTex;

function cottage(r, i) {
  const g = new THREE.Group();
  const w = 4.2 + r() * 1.4;
  const d = 3.4 + r() * 1.0;
  const h = 2.4 + r() * 0.5;
  const wallMat = toon(WALLS[i % WALLS.length], { map: plasterTex });
  const body = new THREE.Mesh(uvBox(w, h, d, 0.5), wallMat);
  body.position.y = h / 2;
  g.add(body);
  // stone footing
  const foot = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.35, d + 0.12), m('#8d918a'));
  foot.position.y = 0.17;
  g.add(foot);
  // timber frame on the front (+z faces the shop after rotation)
  const beam = (bw, bh, x, y) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), m(TIMBER));
    b.position.set(x, y, d / 2 + 0.03);
    g.add(b);
  };
  beam(w + 0.04, 0.14, 0, h - 0.07);
  beam(w + 0.04, 0.12, 0, 0.42);
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) beam(0.14, h - 0.3, x, h / 2 + 0.1);
  // roof (ridge along x)
  const roofH = 1.5 + r() * 0.6;
  const over = 0.35;
  const slope = Math.hypot(d / 2 + over, roofH);
  const ang = Math.atan2(roofH, d / 2 + over);
  const roofMat = toon(ROOFS[i % ROOFS.length], { map: shingleTex });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(uvBox(w + 0.6, 0.12, slope, 0.6), roofMat);
    p.position.set(0, h + roofH / 2 - 0.02, s * (d / 4 + over / 2 - 0.02));
    p.rotation.x = s * ang;
    g.add(p);
  }
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, roofH)]);
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.05, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const gab = new THREE.Mesh(gableGeo, wallMat);
    gab.rotation.y = Math.PI / 2;
    gab.position.set(s * (w / 2) - (s > 0 ? 0.05 : 0), h, 0);
    g.add(gab);
  }
  // chimney
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), m('#9a7a66'));
  ch.position.set((r() - 0.5) * w * 0.5, h + roofH * 0.6, -d * 0.18);
  g.add(ch);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.62), m('#6e5a4c'));
  cap.position.set(ch.position.x, ch.position.y + 0.72, ch.position.z);
  g.add(cap);
  // door
  const doorX = (r() - 0.5) * (w * 0.4);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.08), m(DOORS[i % DOORS.length]));
  door.position.set(doorX, 0.9 + 0.12, d / 2 + 0.03);
  g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), m('#d9b44a'));
  knob.position.set(doorX + 0.3, 1.0, d / 2 + 0.09);
  g.add(knob);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.5), m('#8d918a'));
  step.position.set(doorX, 0.07, d / 2 + 0.3);
  g.add(step);
  const doorLamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow('#ffcf8a', 2.2));
  doorLamp.layers.set(LAYER_NO_INK);
  doorLamp.position.set(doorX + 0.75, 2.0, d / 2 + 0.16);
  g.add(doorLamp);

  // windows: spread across the front, avoiding the door
  const count = HOUSES[i].windows;
  const slots = [];
  const usable = [-w / 2 + 0.75, w / 2 - 0.75];
  const candidates = [];
  for (let k = 0; k < 7; k++) candidates.push(usable[0] + ((usable[1] - usable[0]) * k) / 6);
  for (const x of candidates) if (Math.abs(x - doorX) > 0.95 && slots.every((s) => Math.abs(s.x - x) > 0.95)) slots.push({ x, y: 1.45 });
  // upstairs window in the gable if we still need more
  while (slots.length < count) slots.push({ x: 0, y: h + roofH * 0.38, gable: true, side: slots.length % 2 ? 1 : -1 });
  const windows = [];
  slots.slice(0, count).forEach((sl, k) => {
    const wg = new THREE.Group();
    const fw = sl.gable ? 0.6 : 0.8, fh = sl.gable ? 0.6 : 0.9;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.14, fh + 0.14, 0.08), m('#f6ecd8'));
    wg.add(frame);
    const paneMat = new THREE.MeshBasicMaterial({ color: WINDOW_OFF.clone() });
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), paneMat);
    pane.position.z = 0.045;
    wg.add(pane);
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.05, fh, 0.02), m('#f6ecd8'));
    mull.position.z = 0.055;
    const mull2 = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.05, 0.02), m('#f6ecd8'));
    mull2.position.z = 0.055;
    wg.add(mull, mull2);
    if (!sl.gable) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(fw + 0.3, 0.16, 0.22), m('#7a5a40'));
      sill.position.set(0, -fh / 2 - 0.14, 0.1);
      wg.add(sill);
      for (let f = 0; f < 4; f++) {
        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), m(['#e07a6c', '#f0c05a', '#b5a3d8', '#f6ecd8'][(f + k) % 4]));
        fl.position.set(-fw / 2 + 0.05 + f * (fw / 3.2), -fh / 2 - 0.02, 0.12);
        wg.add(fl);
      }
      wg.position.set(sl.x, sl.y, d / 2 + 0.04);
    } else {
      wg.position.set(sl.side * 0.0 + (k % 2 ? 0.55 : -0.55) * (count > 2 ? 1 : 0), sl.y, d / 2 + 0.06);
    }
    g.add(wg);
    windows.push(pane);
  });
  return { group: g, windows, size: { w, d, h: h + roofH } };
}

export async function buildVillage(scene, colliders) {
  shingleTex = textures.shingles([1, 1]);
  plasterTex = textures.plaster([1, 1]);
  pathTex = textures.path([1, 1]);
  grassTex = textures.grass([60, 60]);
  const r = rng(42);
  const root = new THREE.Group();
  root.name = 'village';
  scene.add(root);

  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), toon('#ffffff', { map: grassTex }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  root.add(ground);

  // lane
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(90, 2.6), toon('#ffffff', { map: pathTex }));
  pathTex.repeat.set(30, 1);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.005, 12.5);
  root.add(lane);
  const garden = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 6.2), toon('#ffffff', { map: textures.path([1, 4]) }));
  garden.rotation.x = -Math.PI / 2;
  garden.position.set(2.9, 0.006, 8.3);
  root.add(garden);

  // cottages
  const windows = new Map();
  const houses = [];
  SPOTS.forEach(([x, z], i) => {
    const c = cottage(r, i);
    c.group.position.set(x, 0, z);
    c.group.rotation.y = Math.atan2(0 - x, 2 - z);
    root.add(c.group);
    c.windows.forEach((pane, k) => windows.set(`${i}:${k}`, pane));
    houses.push({ pos: new THREE.Vector3(x, 0, z), door: c.group.localToWorld(new THREE.Vector3(0, 0, c.size.d / 2 + 1.2)) });
    // little picket path from house to lane
    const pv = c.group.localToWorld(new THREE.Vector3(0, 0, c.size.d / 2 + 0.6));
    const len = Math.abs(pv.z - 12.5);
    if (len > 1.2) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1, len), toon('#ffffff', { map: pathTex }));
      p.rotation.x = -Math.PI / 2;
      p.position.set(pv.x, 0.004, (pv.z + 12.5) / 2);
      root.add(p);
    }
  });

  // stream crossing the lane on the left, with a wooden bridge
  const streamPts = [];
  for (let k = 0; k <= 24; k++) {
    const z = -30 + k * 4;
    streamPts.push(new THREE.Vector3(-13.5 + Math.sin(z * 0.12) * 2.5, 0.02, z));
  }
  const curve = new THREE.CatmullRomCurve3(streamPts);
  const water = new THREE.Mesh(ribbon(curve, 2.4, 120), toon('#3f6f7a', { emissive: new THREE.Color('#0d2a33'), transparent: true, opacity: 0.92 }));
  root.add(water);
  const bridge = await placeable('nature/bridge_wood.glb', { width: 3.4 });
  const bz = 12.5;
  bridge.position.set(-13.5 + Math.sin(bz * 0.12) * 2.5, 0, bz);
  bridge.rotation.y = Math.PI / 2;
  root.add(bridge);

  // lamp posts along the lane
  const posts = [];
  for (const x of [-22, -8, 4.6, 12, 24]) {
    const lp = await placeable('holiday/lantern.glb', { height: 2.7 });
    lp.position.set(x, 0, 11);
    root.add(lp);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), glow('#ffcf8a', 2.6));
    bulb.layers.set(LAYER_NO_INK);
    bulb.position.set(x, 2.25, 11);
    root.add(bulb);
    posts.push(bulb);
  }

  // forest: dense behind the shop, a looser ring around the village
  const trees = { 'nature/tree_pineTallA_detailed.glb': [], 'nature/tree_pineTallB_detailed.glb': [], 'nature/tree_pineTallC_detailed.glb': [], 'nature/tree_pineRoundA.glb': [], 'nature/tree_pineRoundC.glb': [], 'nature/tree_pineDefaultA.glb': [], 'nature/tree_oak.glb': [] };
  const keys = Object.keys(trees);
  const blocked = (x, z) => {
    if (x > -8.5 && x < 9 && z > -6.5 && z < 11) return true;          // shop + yard
    if (Math.abs(z - 12.5) < 2.6 && Math.abs(x) < 46) return true;     // lane
    if (Math.abs(x - (-13.5 + Math.sin(z * 0.12) * 2.5)) < 2.2) return true; // stream
    for (const [hx, hz] of SPOTS) if (Math.hypot(x - hx, z - hz) < 5.2) return true;
    return false;
  };
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (x, z, s) => {
    if (blocked(x, z)) return;
    const key = keys[Math.floor(r() * keys.length)];
    q.setFromAxisAngle(up, r() * Math.PI * 2);
    trees[key].push({ position: new THREE.Vector3(x, 0, z), quaternion: q.clone(), scale: new THREE.Vector3(s, s * (0.9 + r() * 0.25), s) });
  };
  for (let k = 0; k < 420; k++) {
    const x = -40 + r() * 80;
    const z = -45 + r() * 38;
    place(x, z, 0.9 + r() * 0.9);
  }
  for (let k = 0; k < 520; k++) {
    const a = r() * Math.PI * 2;
    const rad = 26 + r() * 50;
    place(Math.cos(a) * rad, 10 + Math.sin(a) * rad * 0.9, 0.9 + r() * 1.0);
  }
  // a few trees scattered through the village
  for (let k = 0; k < 40; k++) place(-30 + r() * 60, 14 + r() * 20, 0.7 + r() * 0.5);
  for (const [path, list] of Object.entries(trees)) {
    if (!list.length) continue;
    const isOak = path.includes('oak');
    root.add(await instanced(path, list, { height: isOak ? 5.5 : 7.5 }));
  }

  // undergrowth near paths and the shop
  const scatter = async (path, n, area, h) => {
    const list = [];
    for (let k = 0; k < n; k++) {
      const x = area[0] + r() * (area[1] - area[0]);
      const z = area[2] + r() * (area[3] - area[2]);
      if (Math.abs(z - 12.5) < 1.5 || (x > -6.2 && x < 7.2 && z > -4.8 && z < 4.6) || (Math.abs(x - 2.9) < 1 && z > 4 && z < 12)) continue;
      q.setFromAxisAngle(up, r() * Math.PI * 2);
      const s = 0.8 + r() * 0.5;
      list.push({ position: new THREE.Vector3(x, 0, z), quaternion: q.clone(), scale: new THREE.Vector3(s, s, s) });
    }
    if (list.length) root.add(await instanced(path, list, { height: h }));
  };
  await scatter('nature/grass_large.glb', 260, [-30, 30, -8, 32], 0.45);
  await scatter('nature/plant_bushLarge.glb', 70, [-30, 30, -8, 32], 0.8);
  await scatter('nature/mushroom_redGroup.glb', 40, [-12, 12, -7, 11], 0.28);
  await scatter('nature/mushroom_tanGroup.glb', 30, [-12, 12, -7, 11], 0.26);
  await scatter('nature/flower_yellowB.glb', 60, [-20, 20, 4, 30], 0.25);
  await scatter('nature/flower_purpleA.glb', 60, [-20, 20, 4, 30], 0.3);
  await scatter('nature/rock_smallA.glb', 30, [-25, 25, -8, 30], 0.35);

  // yard fence (built in code so the gate gap is exact)
  const fenceMat = toon('#c48a58');
  const postGeo = new THREE.BoxGeometry(0.11, 0.95, 0.11);
  const fenceParts = new THREE.Group();
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) {
      const p = new THREE.Mesh(postGeo, fenceMat);
      p.position.set(x0 + ((x1 - x0) * k) / n, 0.475, z0 + ((z1 - z0) * k) / n);
      fenceParts.add(p);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 4), fenceMat);
      cap.position.set(p.position.x, 1.0, p.position.z);
      cap.rotation.y = Math.PI / 4;
      fenceParts.add(cap);
    }
    for (const y of [0.38, 0.72]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.05), toon('#a8754c'));
      rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      rail.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      fenceParts.add(rail);
    }
  };
  run(-7, 10.6, 2.15, 10.6);
  run(3.65, 10.6, 7, 10.6);
  run(-7, 4.4, -7, 10.6);
  run(7, 4.4, 7, 10.6);
  for (const x of [2.15, 3.65]) {
    const gp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.25, 0.16), toon('#8a5a3b'));
    gp.position.set(x, 0.62, 10.6);
    fenceParts.add(gp);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 6, 20, Math.PI), toon('#8a5a3b'));
  arch.position.set(2.9, 1.22, 10.6);
  fenceParts.add(arch);
  root.add(fenceParts);
  colliders.push({ minX: -7.2, maxX: 2.1, minZ: 10.45, maxZ: 10.75, outside: true });
  colliders.push({ minX: 3.7, maxX: 7.2, minZ: 10.45, maxZ: 10.75, outside: true });
  colliders.push({ minX: 2.1, maxX: 3.7, minZ: 10.6, maxZ: 10.9, outside: true, playerOnly: true });
  colliders.push({ minX: -7.3, maxX: -6.9, minZ: 4.2, maxZ: 10.7, outside: true });
  colliders.push({ minX: 6.9, maxX: 7.3, minZ: 4.2, maxZ: 10.7, outside: true });

  // a bench and log pile in the yard
  const bench = await placeable('holiday/bench.glb', { width: 1.5 });
  bench.position.set(-4.6, 0, 6.4);
  root.add(bench);
  colliders.push({ minX: -5.4, maxX: -3.8, minZ: 6.05, maxZ: 6.75, outside: true });
  const logs = await placeable('nature/log_stack.glb', { width: 1.2 });
  logs.position.set(5.6, 0, 5.4);
  logs.rotation.y = 0.3;
  root.add(logs);
  colliders.push({ minX: 5.0, maxX: 6.3, minZ: 4.8, maxZ: 6.0, outside: true });
  const signpost = await placeable('nature/sign.glb', { height: 1.1 });
  signpost.position.set(1.6, 0, 10.2);
  root.add(signpost);

  return { root, windows, houses, posts, water, laneZ: 12.5 };
}

function ribbon(curve, width, segs) {
  const pos = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3().crossVectors(up, tan).normalize().multiplyScalar(width / 2 * (0.85 + Math.sin(t * 40) * 0.15));
    pos.push(p.x + side.x, p.y, p.z + side.z, p.x - side.x, p.y, p.z - side.z);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
