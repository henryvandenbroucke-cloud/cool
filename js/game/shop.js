// The shop: a timber-framed cottage with a plank floor, shelves you stock,
// a counter with an old brass register, two workbenches and a front porch.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, glow, textures, LAYER_NO_INK } from './render.js';
import { placeable } from './assets.js';
import { uvBox } from './village.js';
import { tinLantern, flame, lamp as lampMesh, candle } from './products.js';

export const ROOM = { minX: -5, maxX: 5, minZ: -4, maxZ: 4, h: 3.0 };
export const DOOR = { x0: 2.4, x1: 3.4, z: 4.1, h: 2.2 };

const mc = {};
const m = (hex, o) => (mc[hex + (o ? JSON.stringify(o) : '')] ||= toon(hex, o));

export async function buildShop(scene, ctx) {
  const { colliders, interact, hit } = ctx;
  const root = new THREE.Group();
  root.name = 'shop';
  scene.add(root);
  const planks = textures.planks([1, 1]);
  const plaster = textures.plaster([1, 1]);
  const logs = textures.logs([1, 1]);
  const wainscot = textures.planks([1, 1]);
  wainscot.rotation = Math.PI / 2;
  wainscot.center.set(0.5, 0.5);
  const plasterMat = toon('#ffffff', { map: plaster });
  const logMat = toon('#ffffff', { map: logs });
  const trimMat = m('#5a3c2c');
  const wainMat = toon('#e3c9a3', { map: wainscot });

  // ---------- floor & ceiling ----------
  const floorTex = textures.planks([5, 4]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), toon('#ffffff', { map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  root.add(floor);
  const ceilTex = textures.planks([4, 3]);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 8.4), toon('#e9d3b0', { map: ceilTex }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = ROOM.h;
  root.add(ceil);
  for (let x = -4.2; x <= 4.3; x += 1.7) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 8.2), trimMat);
    b.position.set(x, ROOM.h - 0.12, 0);
    root.add(b);
  }

  // ---------- walls (box per segment, plaster inside, logs outside) ----------
  const T = 0.22;
  const wallSeg = (x0, x1, y0, y1, z0, z1, inner) => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= 0.001 || h <= 0.001 || d <= 0.001) return;
    const mats = [logMat, logMat, trimMat, trimMat, logMat, logMat];
    // inner face index: +x 0, -x 1, +z 4, -z 5
    mats[inner] = plasterMat;
    const mesh = new THREE.Mesh(uvBox(w, h, d, 0.6), mats);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    root.add(mesh);
  };
  const wallAlongX = (z0, z1, holes, inner) => {
    // holes: [x0,x1,y0,y1]
    const xs = [ROOM.minX - T, ...holes.flatMap((h) => [h[0], h[1]]), ROOM.maxX + T];
    for (let i = 0; i < xs.length; i += 2) wallSeg(xs[i], xs[i + 1], 0, ROOM.h + 0.25, z0, z1, inner);
    for (const [x0, x1, y0, y1] of holes) {
      wallSeg(x0, x1, 0, y0, z0, z1, inner);
      wallSeg(x0, x1, y1, ROOM.h + 0.25, z0, z1, inner);
    }
  };
  const BIGWIN = [-4.3, -0.8, 0.85, 2.45];
  const SMALLWIN = [0.4, 1.6, 1.0, 2.25];
  const DOORHOLE = [DOOR.x0, DOOR.x1, 0, DOOR.h];
  wallAlongX(ROOM.maxZ, ROOM.maxZ + T, [BIGWIN, SMALLWIN, DOORHOLE], 5);
  const STUDIO_DOOR = [3.1, 4.1, 0, 2.15];
  wallAlongX(ROOM.minZ - T, ROOM.minZ, [[-1.0, 0.0, 1.2, 2.2], STUDIO_DOOR], 4);
  // side walls along z
  const sideWall = (x0, x1, inner, holes = []) => {
    const zs = [ROOM.minZ, ...holes.flatMap((h) => [h[0], h[1]]), ROOM.maxZ];
    for (let i = 0; i < zs.length; i += 2) wallSeg(x0, x1, 0, ROOM.h + 0.25, zs[i], zs[i + 1], inner);
    for (const [z0, z1, y0, y1] of holes) {
      wallSeg(x0, x1, 0, y0, z0, z1, inner);
      wallSeg(x0, x1, y1, ROOM.h + 0.25, z0, z1, inner);
    }
  };
  sideWall(ROOM.minX - T, ROOM.minX, 0, [[-3.4, -2.4, 1.3, 2.3]]);
  sideWall(ROOM.maxX, ROOM.maxX + T, 1, [[-3.4, -2.6, 1.4, 2.2]]);
  colliders.push(
    { minX: ROOM.minX - T, maxX: ROOM.minX, minZ: ROOM.minZ - T, maxZ: ROOM.maxZ + T },
    { minX: ROOM.maxX, maxX: ROOM.maxX + T, minZ: ROOM.minZ - T, maxZ: ROOM.maxZ + T },
    { minX: ROOM.minX - T, maxX: STUDIO_DOOR[0], minZ: ROOM.minZ - T, maxZ: ROOM.minZ },
    { minX: STUDIO_DOOR[1], maxX: ROOM.maxX + T, minZ: ROOM.minZ - T, maxZ: ROOM.minZ },
    { minX: ROOM.minX - T, maxX: DOOR.x0, minZ: ROOM.maxZ, maxZ: ROOM.maxZ + T },
    { minX: DOOR.x1, maxX: ROOM.maxX + T, minZ: ROOM.maxZ, maxZ: ROOM.maxZ + T },
  );

  // wainscot + rail on inner faces
  const wain = (x, z, w, rotY) => {
    const p = new THREE.Mesh(uvBox(w, 0.95, 0.03, 1.4), wainMat);
    p.position.set(x, 0.475, z);
    p.rotation.y = rotY;
    root.add(p);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.07), trimMat);
    rail.position.set(x, 0.97, z);
    rail.rotation.y = rotY;
    root.add(rail);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.05), trimMat);
    skirt.position.set(x, 0.06, z);
    skirt.rotation.y = rotY;
    root.add(skirt);
  };
  wain(-0.95, ROOM.minZ + 0.016, 8.1, 0);
  wain(4.55, ROOM.minZ + 0.016, 0.9, 0);
  wain(ROOM.minX + 0.016, 0, 8, Math.PI / 2);
  wain(ROOM.maxX - 0.016, 0, 8, Math.PI / 2);
  wain(-4.65, ROOM.maxZ - 0.016, 0.7, 0);
  wain(-0.2, ROOM.maxZ - 0.016, 1.2, 0);
  wain(2.0, ROOM.maxZ - 0.016, 0.8, 0);
  wain(4.2, ROOM.maxZ - 0.016, 1.6, 0);
  // timber posts on the walls
  for (const [x, z, ry] of [[-5 + 0.06, -2, 0], [-5 + 0.06, 2, 0], [5 - 0.06, -2, 0], [5 - 0.06, 2, 0], [-0.6, 4 - 0.06, 0], [1.9, 4 - 0.06, 0]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, ROOM.h, 0.16), trimMat);
    p.position.set(x, ROOM.h / 2, z);
    p.rotation.y = ry;
    root.add(p);
  }

  // ---------- windows (frames, mullions, glass) ----------
  const glassMat = new THREE.MeshToonMaterial({ color: '#cfe3e6', transparent: true, opacity: 0.16, depthWrite: false, gradientMap: m('#fff').gradientMap });
  const windowFrame = (cx, cy, w, h, z, axis = 'x', cols = 3, rows = 2) => {
    const g = new THREE.Group();
    const add = (geo, mat, x, y) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, 0); g.add(o); return o; };
    add(new THREE.BoxGeometry(w + 0.16, 0.1, 0.3), trimMat, 0, -h / 2 - 0.05);
    add(new THREE.BoxGeometry(w + 0.16, 0.1, 0.26), trimMat, 0, h / 2 + 0.05);
    add(new THREE.BoxGeometry(0.1, h + 0.2, 0.26), trimMat, -w / 2 - 0.04, 0);
    add(new THREE.BoxGeometry(0.1, h + 0.2, 0.26), trimMat, w / 2 + 0.04, 0);
    for (let c = 1; c < cols; c++) add(new THREE.BoxGeometry(0.05, h, 0.06), m('#f6ecd8'), -w / 2 + (w * c) / cols, 0);
    for (let r = 1; r < rows; r++) add(new THREE.BoxGeometry(w, 0.05, 0.06), m('#f6ecd8'), 0, -h / 2 + (h * r) / rows);
    const gl = add(new THREE.PlaneGeometry(w, h), glassMat, 0, 0);
    gl.layers.set(LAYER_NO_INK);
    gl.material.side = THREE.DoubleSide;
    const sill = add(new THREE.BoxGeometry(w + 0.3, 0.06, 0.4), m('#8a5a3b'), 0, -h / 2 - 0.08);
    sill.position.z = -0.12;
    g.position.set(axis === 'x' ? cx : z, cy, axis === 'x' ? z : cx);
    if (axis === 'z') g.rotation.y = Math.PI / 2;
    root.add(g);
    return g;
  };
  windowFrame((BIGWIN[0] + BIGWIN[1]) / 2, (BIGWIN[2] + BIGWIN[3]) / 2, BIGWIN[1] - BIGWIN[0], BIGWIN[3] - BIGWIN[2], ROOM.maxZ + T / 2, 'x', 4, 3);
  windowFrame((SMALLWIN[0] + SMALLWIN[1]) / 2, (SMALLWIN[2] + SMALLWIN[3]) / 2, 1.2, 1.25, ROOM.maxZ + T / 2, 'x', 2, 2);
  windowFrame(-0.5, 1.7, 1.0, 1.0, ROOM.minZ - T / 2, 'x', 2, 2);
  windowFrame(-2.9, 1.8, 1.0, 1.0, ROOM.minX - T / 2, 'z', 2, 2);
  windowFrame(-3.0, 1.8, 0.8, 0.8, ROOM.maxX + T / 2, 'z', 2, 2);

  // ---------- door (auto-opening, with bell) ----------
  const doorPivot = new THREE.Group();
  doorPivot.position.set(DOOR.x0 + 0.03, 0, ROOM.maxZ + T / 2);
  const leaf = new THREE.Group();
  const leafW = DOOR.x1 - DOOR.x0 - 0.06;
  const slab = new THREE.Mesh(new RoundedBoxGeometry(leafW, DOOR.h - 0.04, 0.07, 2, 0.015), m('#4f6f6a'));
  slab.position.set(leafW / 2, DOOR.h / 2, 0);
  leaf.add(slab);
  for (const [x, y] of [[0.25, 1.65], [0.67, 1.65], [0.25, 1.25], [0.67, 1.25]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.34), glassMat);
    pane.layers.set(LAYER_NO_INK);
    pane.position.set(x, y, 0.04);
    leaf.add(pane);
    const pane2 = pane.clone();
    pane2.position.z = -0.04;
    leaf.add(pane2);
  }
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), m('#d9b44a'));
  knob.position.set(leafW - 0.1, 1.0, 0.06);
  leaf.add(knob, knob.clone().translateZ(-0.12));
  // open/closed sign hanging inside the door
  const signTexOpen = textures.label('OPEN', { bg: '#f6ecd8', fg: '#5e8a6c', size: 54, w: 256, h: 112, border: '#5e8a6c' });
  const signTexClosed = textures.label('CLOSED', { bg: '#f6ecd8', fg: '#b85a4c', size: 48, w: 256, h: 112, border: '#b85a4c' });
  const signMat = new THREE.MeshToonMaterial({ map: signTexClosed, gradientMap: m('#fff').gradientMap });
  const sign = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.19, 0.02, 2, 0.01), [m('#8a5a3b'), m('#8a5a3b'), m('#8a5a3b'), m('#8a5a3b'), signMat, signMat]);
  sign.position.set(leafW / 2, 1.45, -0.07);
  sign.rotation.y = Math.PI;
  leaf.add(sign);
  doorPivot.add(leaf);
  doorPivot.userData.dynamic = true;
  root.add(doorPivot);
  const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(DOOR.x1 - DOOR.x0 + 0.2, 0.14, T + 0.08), trimMat);
  doorFrame.position.set((DOOR.x0 + DOOR.x1) / 2, DOOR.h + 0.07, ROOM.maxZ + T / 2);
  root.add(doorFrame);
  for (const x of [DOOR.x0 - 0.05, DOOR.x1 + 0.05]) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.1, DOOR.h + 0.1, T + 0.08), trimMat);
    j.position.set(x, DOOR.h / 2, ROOM.maxZ + T / 2);
    root.add(j);
  }
  const bell = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0.06), new THREE.Vector2(0.03, 0.05), new THREE.Vector2(0.045, 0), new THREE.Vector2(0.05, -0.01)], 14), m('#d9b44a', { side: THREE.DoubleSide }));
  const bellPivot = new THREE.Group();
  bellPivot.position.set(DOOR.x1 - 0.2, DOOR.h - 0.02, ROOM.maxZ - 0.08);
  bell.position.y = -0.08;
  bellPivot.add(bell);
  bellPivot.userData.dynamic = true;
  root.add(bellPivot);
  const signHit = hit(new THREE.BoxGeometry(0.5, 0.3, 0.12), new THREE.Vector3(), { type: 'sign' });
  sign.add(signHit);

  // ---------- porch ----------
  const deckTex = textures.planks([2, 1]);
  const deck = new THREE.Mesh(uvBox(4.4, 0.12, 2.2, 0.7), toon('#ffffff', { map: deckTex }));
  deck.position.set(3.1, -0.05, 5.3);
  root.add(deck);
  const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), m('#8a5a3b'));
  stepMesh.position.set(2.9, -0.07, 6.6);
  root.add(stepMesh);
  for (const [x, z] of [[1.05, 6.25], [5.15, 6.25]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.6, 0.16), trimMat);
    post.position.set(x, 1.3, z);
    root.add(post);
    colliders.push({ minX: x - 0.12, maxX: x + 0.12, minZ: z - 0.12, maxZ: z + 0.12 });
  }
  const porchRoof = new THREE.Mesh(uvBox(4.6, 0.12, 2.6, 0.6), toon('#6a5a4a', { map: textures.shingles([1, 1]) }));
  porchRoof.position.set(3.1, 2.75, 5.3);
  porchRoof.rotation.x = 0.22;
  root.add(porchRoof);
  const porchLantern = tinLantern({ lit: true });
  porchLantern.scale.setScalar(2.2);
  porchLantern.position.set(3.95, 1.95, 4.75);
  root.add(porchLantern);
  // hanging shop sign
  const shopSignTex = textures.label('Lantern & Lens', { bg: '#2f4a4f', fg: '#ffd89a', border: '#d9b44a', size: 40, w: 420, h: 110 });
  const shopSign = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.4, 0.05, 2, 0.02), [m('#5a3c2c'), m('#5a3c2c'), m('#5a3c2c'), m('#5a3c2c'), new THREE.MeshToonMaterial({ map: shopSignTex, gradientMap: m('#fff').gradientMap }), m('#5a3c2c')]);
  shopSign.position.set(1.7, 2.35, 6.3);
  root.add(shopSign);
  const wreath = await placeable('holiday/wreath.glb', { height: 0.42 });
  wreath.position.set(leafW / 2, 1.78, 0.06);
  leaf.add(wreath);

  // ---------- roof ----------
  const shingles = textures.shingles([1, 1]);
  const roofMat = toon('#7d4a3c', { map: shingles });
  const roofH = 2.0, over = 0.5;
  const depth = ROOM.maxZ - ROOM.minZ + 2 * T;
  const slope = Math.hypot(depth / 2 + over, roofH);
  const ang = Math.atan2(roofH, depth / 2 + over);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(uvBox(10.4 + 1.0, 0.16, slope, 0.6), roofMat);
    p.position.set(0, ROOM.h + 0.25 + roofH / 2, s * (depth / 4 + over / 2));
    p.rotation.x = s * ang;
    root.add(p);
  }
  const tri = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, roofH)]);
  const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const gab = new THREE.Mesh(gableGeo, logMat);
    gab.rotation.y = Math.PI / 2;
    gab.position.set(s > 0 ? ROOM.maxX : ROOM.minX - T, ROOM.h + 0.25, 0);
    root.add(gab);
  }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), m('#9a7a66'));
  chim.position.set(-3.6, ROOM.h + 1.6, -2.4);
  root.add(chim);

  // ---------- hanging lanterns (the shop's real lights) ----------
  const lights = [];
  for (const [x, z] of [[-2.6, 0.2], [1.4, 0.2], [3.9, 0.3], [-1.2, -2.9]]) {
    const l = tinLantern({ lit: true });
    l.scale.setScalar(2.4);
    l.position.set(x, ROOM.h - 1.0, z);
    root.add(l);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), m('#4b5350'));
    chain.position.set(x, ROOM.h - 0.22, z);
    root.add(chain);
  }
  // Few real lights (each one costs every pixel); the lanterns themselves glow.
  // Ordered by priority: quality tiers switch them on from the front.
  for (const [x, z, i, d] of [[-0.9, 0.2, 7, 11], [3.9, 0.3, 5, 8], [-1.6, -2.9, 4, 7]]) {
    const light = new THREE.PointLight('#ffb766', i, d, 1.5);
    light.position.set(x, ROOM.h - 0.75, z);
    root.add(light);
    lights.push(light);
  }

  // ---------- counter + register + ledger ----------
  const counterMat = toon('#ffffff', { map: textures.planks([1, 1]) });
  const counterBody = new THREE.Mesh(uvBox(0.66, 0.96, 2.6, 1.4), [counterMat, counterMat, counterMat, counterMat, counterMat, counterMat]);
  counterBody.position.set(3.6, 0.48, 0.3);
  root.add(counterBody);
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.82, 0.06, 2.76, 2, 0.02), m('#8a5a3b'));
  top.position.set(3.6, 0.99, 0.3);
  root.add(top);
  colliders.push({ minX: 3.2, maxX: 4.02, minZ: -1.05, maxZ: 1.68 });
  const register = buildRegister();
  register.position.set(3.72, 1.02, 0.05);
  register.rotation.y = -Math.PI / 2;
  register.userData.dynamic = true;
  root.add(register);
  register.add(hit(new THREE.BoxGeometry(0.5, 0.4, 0.45), new THREE.Vector3(0, 0.18, 0), { type: 'register' }));
  const ledger = buildLedger();
  ledger.position.set(3.62, 1.02, -0.7);
  ledger.rotation.y = -Math.PI / 2 + 0.15;
  root.add(ledger);
  ledger.add(hit(new THREE.BoxGeometry(0.5, 0.2, 0.4), new THREE.Vector3(0, 0.06, 0), { type: 'ledger' }));
  const radio = await placeable('furniture/radio.glb', { width: 0.42 });
  radio.position.set(3.7, 1.02, 1.25);
  radio.rotation.y = -Math.PI / 2;
  root.add(radio);
  radio.add(hit(new THREE.BoxGeometry(0.45, 0.32, 0.2), new THREE.Vector3(0, 0.15, 0), { type: 'radio' }));
  const counterCandle = candle('pillar', 'honey', { lit: true });
  counterCandle.position.set(3.45, 1.02, 1.55);
  root.add(counterCandle);

  // ---------- wall clock ----------
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 32), m('#f6ecd8'));
  face.rotation.z = Math.PI / 2;
  clock.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.035, 8, 32), m('#8a5a3b'));
  rim.rotation.y = Math.PI / 2;
  clock.add(rim);
  const hand = (len, w) => {
    const p = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.01, len, w), m('#3b2a20'));
    h.position.y = len / 2;
    p.add(h);
    p.position.x = -0.035;
    clock.add(p);
    return p;
  };
  const hourHand = hand(0.14, 0.03);
  const minHand = hand(0.21, 0.018);
  for (let k = 0; k < 12; k++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.035, 0.012), m('#3b2a20'));
    const a = (k / 12) * Math.PI * 2;
    t.position.set(-0.03, Math.cos(a) * 0.21, Math.sin(a) * 0.21);
    t.rotation.x = -a;
    clock.add(t);
  }
  clock.position.set(4.97, 2.15, 0.3);
  clock.userData.dynamic = true;
  root.add(clock);

  // ---------- shelves ----------
  const sections = new Map();
  const shelfWoodM = shelfWood();
  const shelfCtx = { hit };
  const register_ = (built) => {
    root.add(built.group);
    for (const sec of built.sections) sections.set(sec.id, sec);
    colliders.push(built.collider);
    return built;
  };
  register_(makeShelfUnit(shelfCtx, 'A', -4.74, -1.15, Math.PI / 2));
  register_(makeShelfUnit(shelfCtx, 'B', -4.74, 1.35, Math.PI / 2));
  register_(makeShelfUnit(shelfCtx, 'C', -1.86, 0.1, -Math.PI / 2));
  register_(makeShelfUnit(shelfCtx, 'D', -1.36, 0.1, Math.PI / 2, { backed: false }));
  // display table under the big window, customers browse it from the room side
  register_(makeTable(shelfCtx, 'W', -2.55, 3.35, Math.PI, { width: 2.2, cloth: true }));

  // ---------- workshop: candle station ----------
  const stove = await placeable('furniture/kitchenStove.glb', { height: 0.92 });
  stove.position.set(-4.35, 0, -3.62);
  root.add(stove);
  const bench = (x, w, color = '#8a5a3b') => {
    const g = new THREE.Group();
    g.position.set(x, 0, -3.62);
    const t = new THREE.Mesh(new RoundedBoxGeometry(w, 0.07, 0.72, 2, 0.02), m(color));
    t.position.y = 0.9;
    g.add(t);
    const body = new THREE.Mesh(uvBox(w - 0.06, 0.86, 0.66, 1.2), shelfWoodM);
    body.position.y = 0.43;
    g.add(body);
    root.add(g);
    return g;
  };
  bench(-2.95, 2.0);
  colliders.push({ minX: -4.95, maxX: -1.9, minZ: -4, maxZ: -3.2 });
  const pot = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.16, 0), new THREE.Vector2(0.17, 0.02), new THREE.Vector2(0.17, 0.2), new THREE.Vector2(0.185, 0.21)], 24), m('#6f7a74', { side: THREE.DoubleSide }));
  pot.position.set(-4.3, 0.93, -3.55);
  root.add(pot);
  const waxSurface = new THREE.Mesh(new THREE.CircleGeometry(0.165, 24), m('#f3e6c8'));
  waxSurface.rotation.x = -Math.PI / 2;
  waxSurface.position.set(-4.3, 1.08, -3.55);
  waxSurface.userData.dynamic = true;
  root.add(waxSurface);
  const stoveFlame = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 6, 16), glow('#7fb6ff', 2.0));
  stoveFlame.rotation.x = Math.PI / 2;
  stoveFlame.position.set(-4.3, 0.925, -3.55);
  stoveFlame.layers.set(LAYER_NO_INK);
  stoveFlame.userData.dynamic = true;
  root.add(stoveFlame);
  // moulds tray + dye shelf
  const tray = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.04, 0.4, 2, 0.01), m('#a8aca2'));
  tray.position.set(-2.8, 0.955, -3.55);
  root.add(tray);
  const dyeShelf = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.05, 0.25, 2, 0.01), shelfWoodM);
  dyeShelf.position.set(-2.95, 1.62, -3.86);
  root.add(dyeShelf);
  const candleSupplyBin = new THREE.Group();
  candleSupplyBin.position.set(-2.1, 0.94, -3.5);
  candleSupplyBin.userData.dynamic = true;
  root.add(candleSupplyBin);
  // bench props: moulds, wick spools, dye bottles, wax blocks
  for (let i = 0; i < 4; i++) {
    const mould = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 16, 1, true), m('#a8aca2', { side: THREE.DoubleSide }));
    mould.position.set(-3.15 + i * 0.13, 1.025, -3.55);
    root.add(mould);
  }
  for (const [x, c] of [[-3.55, '#f3e6c8'], [-3.35, '#e9b45a'], [-3.15, '#e48f86'], [-2.95, '#9cbf9a'], [-2.75, '#b5a3d8']]) {
    const b = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.04, 0), new THREE.Vector2(0.042, 0.1), new THREE.Vector2(0.018, 0.13), new THREE.Vector2(0.018, 0.16), new THREE.Vector2(0, 0.16)], 14), toon(c, { transparent: true, opacity: 0.88 }));
    b.position.set(x, 1.645, -3.86);
    root.add(b);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.025, 8), m('#b9895a'));
    cork.position.set(x, 1.815, -3.86);
    root.add(cork);
  }
  for (let i = 0; i < 2; i++) {
    const spool = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 14), m('#f3e9d6'));
    const rimA = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 14), m('#8a5a3b'));
    rimA.position.y = 0.035;
    const rimB = rimA.clone();
    rimB.position.y = -0.035;
    spool.add(core, rimA, rimB);
    spool.position.set(-2.35 + i * 0.12, 0.98, -3.8);
    root.add(spool);
  }
  const ladle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6), m('#6f7a74'));
  ladle.rotation.z = 1.0;
  ladle.position.set(-4.12, 1.18, -3.55);
  root.add(ladle);
  const candleSpot = { center: new THREE.Vector3(-3.1, 0.95, -3.55), cam: new THREE.Vector3(-3.1, 1.85, -2.45), look: new THREE.Vector3(-3.1, 0.95, -3.6), pot: pot.position.clone(), wax: waxSurface, flame: stoveFlame, tray, dyeShelf, supplyBin: candleSupplyBin };
  root.add(hit(new THREE.BoxGeometry(3.0, 0.9, 0.8), new THREE.Vector3(-3.4, 1.2, -3.5), { type: 'station', id: 'candle' }));

  // ---------- workshop: lamp bench ----------
  bench(1.0, 1.9, '#6e4a36');
  colliders.push({ minX: 0.0, maxX: 2.0, minZ: -4, maxZ: -3.22 });
  const peg = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.9, 0.03), toon('#c9a77a', { map: textures.cork() }));
  peg.position.set(1.0, 1.65, -3.96);
  root.add(peg);
  const hammer = await placeable('survival/tool-hammer.glb', { height: 0.28 });
  hammer.position.set(0.5, 1.5, -3.92);
  hammer.rotation.x = Math.PI / 2;
  root.add(hammer);
  const lampSupplyBin = new THREE.Group();
  lampSupplyBin.position.set(1.75, 0.94, -3.5);
  lampSupplyBin.userData.dynamic = true;
  root.add(lampSupplyBin);
  // lamp bench props: bulbs, shade frames, wire spool, screwdriver
  for (let i = 0; i < 3; i++) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 9), toon('#fff3dc', { transparent: true, opacity: 0.85 }));
    bulb.position.set(0.2 + i * 0.1, 0.975, -3.82);
    root.add(bulb);
  }
  for (let i = 0; i < 2; i++) {
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.15, 12, 1, true), new THREE.MeshToonMaterial({ color: '#4b5350', wireframe: true }));
    frame.position.set(1.55 + i * 0.05, 1.01 + i * 0.15, -3.8);
    root.add(frame);
  }
  const wire = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 8, 20), m('#b85a4c'));
  wire.position.set(1.85, 0.965, -3.4);
  wire.rotation.x = Math.PI / 2;
  root.add(wire);
  const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), m('#d9b44a'));
  driver.rotation.z = Math.PI / 2;
  driver.rotation.y = 0.4;
  driver.position.set(0.45, 0.95, -3.35);
  root.add(driver);
  const lampSpot = { center: new THREE.Vector3(0.9, 0.95, -3.55), cam: new THREE.Vector3(0.9, 1.75, -2.55), look: new THREE.Vector3(0.9, 0.98, -3.6), supplyBin: lampSupplyBin };
  root.add(hit(new THREE.BoxGeometry(1.9, 0.9, 0.8), new THREE.Vector3(1.0, 1.2, -3.5), { type: 'station', id: 'lamp' }));
  const lampLocked = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshToonMaterial({ map: textures.label('Licence needed', { size: 30, w: 300, h: 96 }), gradientMap: m('#fff').gradientMap }));
  lampLocked.position.set(1.0, 1.25, -3.94);
  lampLocked.userData.dynamic = true;
  root.add(lampLocked);

  // finished-goods crates
  const crates = {};
  for (const [id, x] of [['candle', -1.55], ['lamp', 2.45]]) {
    const c = await placeable('survival/box-open.glb', { width: 0.55 });
    c.position.set(x, 0, -3.55);
    root.add(c);
    const contents = new THREE.Group();
    contents.position.set(x, 0.12, -3.55);
    contents.userData.dynamic = true;
    root.add(contents);
    crates[id] = { group: c, contents, pos: c.position.clone() };
    c.add(hit(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.Vector3(0, 0.3, 0), { type: 'crate', id }));
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: -3.85, maxZ: -3.25 });
  }

  // ---------- corkboard ----------
  const board = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.9, 0.04, 2, 0.02), [m('#8a5a3b'), m('#8a5a3b'), m('#8a5a3b'), m('#8a5a3b'), toon('#ffffff', { map: textures.cork() }), m('#8a5a3b')]);
  board.position.set(4.96, 1.65, -1.95);
  board.rotation.y = -Math.PI / 2;
  root.add(board);
  const pins = new THREE.Group();
  pins.position.copy(board.position);
  pins.position.x -= 0.03;
  pins.rotation.y = -Math.PI / 2;
  pins.userData.dynamic = true;
  root.add(pins);
  const boardHit = hit(new THREE.BoxGeometry(1.4, 1.0, 0.2), board.position.clone(), { type: 'board' });
  boardHit.rotation.y = -Math.PI / 2;
  root.add(boardHit);

  // ---------- decor ----------
  const deco = async (path, opts, x, z, ry = 0, y = 0, collide = null) => {
    const o = await placeable(path, opts);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    root.add(o);
    if (collide) colliders.push({ minX: x - collide[0], maxX: x + collide[0], minZ: z - collide[1], maxZ: z + collide[1] });
    return o;
  };
  await deco('furniture/rugRound.glb', { width: 2.4 }, 0.6, 1.0);
  await deco('furniture/rugRectangle.glb', { width: 2.2 }, -3.05, -0.2, Math.PI / 2);
  await deco('furniture/rugDoormat.glb', { width: 1.0 }, 2.9, 3.55);
  await deco('furniture/pottedPlant.glb', { height: 1.2 }, -4.55, 3.55, 0, 0, [0.25, 0.25]);
  await deco('furniture/pottedPlant.glb', { height: 1.0 }, 4.6, -3.6, 1, 0, [0.25, 0.25]);
  await deco('furniture/coatRackStanding.glb', { height: 1.75 }, 4.55, 3.55, 0, 0, [0.2, 0.2]);
  await deco('furniture/loungeChair.glb', { width: 0.95 }, 0.95, 3.1, Math.PI + 0.4, 0, [0.45, 0.4]);
  await deco('furniture/stoolBar.glb', { height: 0.75 }, 4.5, 0.0, 0, 0, null);
  const bookPile = await deco('furniture/books.glb', { width: 0.34 }, -4.7, -1.6, Math.PI / 2, 1.88);
  await deco('furniture/books.glb', { width: 0.3 }, -4.7, 1.8, Math.PI / 2, 1.88);
  await deco('furniture/plantSmall2.glb', { height: 0.35 }, -4.72, 0.9, 0, 1.88);
  await deco('furniture/plantSmall1.glb', { height: 0.32 }, -4.72, -0.7, 0, 1.88);
  await deco('survival/barrel.glb', { height: 0.8 }, -4.45, -2.6, 0, 0, [0.28, 0.28]);
  await deco('furniture/plantSmall3.glb', { height: 0.3 }, -1.7, 3.2, 0, 0.78);
  await deco('survival/bottle-large.glb', { height: 0.22 }, -2.0, -3.8, 0, 1.65);
  void bookPile;
  // lit window lamp on the side table by the reading chair
  const sideT = await deco('furniture/sideTable.glb', { width: 0.6 }, 1.85, 3.6, Math.PI, 0, [0.3, 0.2]);
  void sideT;
  const readLamp = lampMesh('wood', 'drum', 'amber');
  readLamp.scale.setScalar(1.6);
  readLamp.position.set(1.85, 0.5, 3.6);
  root.add(readLamp);
  // candles in the window, the first thing the village sees
  for (const [x, c] of [[-4.0, 'cream'], [-1.15, 'rose']]) {
    const cd = candle('pillar', c, { lit: true });
    cd.scale.setScalar(1.25);
    cd.position.set(x, 0.84, ROOM.maxZ + 0.02);
    root.add(cd);
  }
  const porchLight = new THREE.PointLight('#ffc27a', 5, 8, 1.6);
  porchLight.position.set(3.95, 2.0, 4.9);
  root.add(porchLight);

  // ---------- expansion: back studio (hidden until built) ----------
  const studio = new THREE.Group();
  studio.userData.dynamic = true;   // baked on its own
  studio.visible = false;
  root.add(studio);
  const SX0 = 1.4, SX1 = 5.0, SZ0 = -7.8, SZ1 = ROOM.minZ - T;
  const studioSeg = (x0, x1, y0, y1, z0, z1, inner) => {
    const mats = [logMat, logMat, trimMat, trimMat, logMat, logMat];
    mats[inner] = plasterMat;
    const mesh = new THREE.Mesh(uvBox(x1 - x0, y1 - y0, z1 - z0, 0.6), mats);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    studio.add(mesh);
  };
  const SH = 2.7;
  studioSeg(SX0 - T, SX0, 0, 0.9, SZ0 - T, SZ1, 0);
  studioSeg(SX0 - T, SX0, 2.0, SH, SZ0 - T, SZ1, 0);
  studioSeg(SX0 - T, SX0, 0.9, 2.0, SZ0 - T, -6.6, 0);
  studioSeg(SX0 - T, SX0, 0.9, 2.0, -5.4, SZ1, 0);
  studioSeg(SX1, SX1 + T, 0, SH, SZ0 - T, SZ1, 1);
  studioSeg(SX0 - T, SX1 + T, 0, SH, SZ0 - T, SZ0, 4);
  const sFloor = new THREE.Mesh(new THREE.PlaneGeometry(SX1 - SX0, SZ1 - SZ0), toon('#ffffff', { map: textures.planks([2, 2]) }));
  sFloor.rotation.x = -Math.PI / 2;
  sFloor.position.set((SX0 + SX1) / 2, 0.003, (SZ0 + SZ1) / 2);
  studio.add(sFloor);
  const sCeil = new THREE.Mesh(new THREE.PlaneGeometry(SX1 - SX0 + 0.4, SZ1 - SZ0 + 0.4), toon('#e9d3b0', { map: textures.planks([2, 2]) }));
  sCeil.rotation.x = Math.PI / 2;
  sCeil.position.set((SX0 + SX1) / 2, SH, (SZ0 + SZ1) / 2);
  studio.add(sCeil);
  const sRoof = new THREE.Mesh(uvBox(SX1 - SX0 + 1.0, 0.14, SZ1 - SZ0 + 0.9, 0.6), roofMat);
  sRoof.position.set((SX0 + SX1) / 2, SH + 0.35, (SZ0 + SZ1) / 2 - 0.1);
  sRoof.rotation.x = -0.18;
  studio.add(sRoof);
  const sWinGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), glassMat);
  sWinGlass.layers.set(LAYER_NO_INK);
  sWinGlass.rotation.y = Math.PI / 2;
  sWinGlass.position.set(SX0 - T / 2, 1.45, -6.0);
  studio.add(sWinGlass);
  const sLantern = tinLantern({ lit: true });
  sLantern.scale.setScalar(2.2);
  sLantern.position.set(3.2, SH - 0.95, -6.0);
  studio.add(sLantern);
  // lens grinding bench: a treadle wheel on a sturdy table
  const lensBench = new THREE.Group();
  lensBench.position.set(2.4, 0, -7.35);
  const lbTop = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.07, 0.7, 2, 0.02), m('#6e4a36'));
  lbTop.position.y = 0.9;
  const lbBody = new THREE.Mesh(uvBox(1.44, 0.86, 0.64, 1.2), shelfWoodM);
  lbBody.position.y = 0.43;
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 28), m('#a8aca2'));
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(-0.45, 1.16, -0.1);
  const wheelStand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), m('#4b5350'));
  wheelStand.position.set(-0.45, 1.0, -0.1);
  lensBench.add(lbTop, lbBody, wheel, wheelStand);
  studio.add(lensBench);
  const lensSupplyBin = new THREE.Group();
  lensSupplyBin.position.set(3.0, 0.94, -7.3);
  lensSupplyBin.userData.dynamic = true;
  studio.add(lensSupplyBin);
  // stained glass bench: a glowing light table
  const glassBench = new THREE.Group();
  glassBench.position.set(4.15, 0, -7.35);
  const gbBody = new THREE.Mesh(uvBox(1.44, 0.86, 0.64, 1.2), shelfWoodM);
  gbBody.position.y = 0.43;
  const gbFrame = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.07, 0.7, 2, 0.02), m('#5a3c2c'));
  gbFrame.position.y = 0.9;
  const lightTable = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), glow('#fff3dc', 1.25));
  lightTable.rotation.x = -Math.PI / 2;
  lightTable.position.y = 0.94;
  glassBench.add(gbBody, gbFrame, lightTable);
  studio.add(glassBench);
  for (const [x, c] of [[3.55, '#f0a04a'], [3.62, '#4fb0a4'], [3.69, '#e07a7c'], [3.76, '#9a7ad0']]) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.4), toon(c, { transparent: true, opacity: 0.8 }));
    sheet.position.set(x + 1.0, 1.25, -7.62);
    studio.add(sheet);
  }
  const glassSupplyBin = new THREE.Group();
  glassSupplyBin.position.set(4.75, 0.94, -7.3);
  glassSupplyBin.userData.dynamic = true;
  studio.add(glassSupplyBin);
  const lensSpot = { center: new THREE.Vector3(2.4, 0.95, -7.3), cam: new THREE.Vector3(2.4, 1.75, -6.3), look: new THREE.Vector3(2.4, 0.98, -7.35), supplyBin: lensSupplyBin, wheel };
  const glassSpot = { center: new THREE.Vector3(4.15, 0.95, -7.3), cam: new THREE.Vector3(4.15, 1.95, -6.55), look: new THREE.Vector3(4.15, 0.95, -7.3), supplyBin: glassSupplyBin };
  studio.add(hit(new THREE.BoxGeometry(1.5, 0.9, 0.8), new THREE.Vector3(2.4, 1.2, -7.3), { type: 'station', id: 'lens' }));
  studio.add(hit(new THREE.BoxGeometry(1.5, 0.9, 0.8), new THREE.Vector3(4.15, 1.2, -7.3), { type: 'station', id: 'glass' }));
  const studioColliders = [
    { minX: SX0 - T, maxX: SX0, minZ: SZ0 - T, maxZ: SZ1 },
    { minX: SX1, maxX: SX1 + T, minZ: SZ0 - T, maxZ: SZ1 },
    { minX: SX0 - T, maxX: SX1 + T, minZ: SZ0 - T, maxZ: SZ0 },
    { minX: 1.6, maxX: 4.95, minZ: -7.8, maxZ: -6.95 },
  ];
  for (const [id, x] of [['lens', 1.75], ['glass', 4.75]]) {
    const c = await placeable('survival/box-open.glb', { width: 0.5 });
    c.position.set(x, 0, -6.55);
    studio.add(c);
    const contents = new THREE.Group();
    contents.position.set(x, 0.12, -6.55);
    contents.userData.dynamic = true;
    studio.add(contents);
    crates[id] = { group: c, contents, pos: c.position.clone() };
    c.add(hit(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.Vector3(0, 0.3, 0), { type: 'crate', id }));
    studioColliders.push({ minX: x - 0.28, maxX: x + 0.28, minZ: -6.83, maxZ: -6.27 });
  }
  // boards across the doorway until the studio is built
  const boards = new THREE.Group();
  boards.userData.dynamic = true;
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.05), m('#a8754c'));
    b.position.set(3.6, 0.45 + k * 0.48, ROOM.minZ + 0.06);
    b.rotation.z = (k % 2 ? 1 : -1) * 0.12;
    boards.add(b);
  }
  const soonSign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22), new THREE.MeshToonMaterial({ map: textures.label('Back Studio', { size: 30, w: 300, h: 96 }), gradientMap: m('#fff').gradientMap }));
  soonSign.position.set(3.6, 1.6, ROOM.minZ + 0.1);
  boards.add(soonSign);
  root.add(boards);
  const studioGate = { minX: STUDIO_DOOR[0], maxX: STUDIO_DOOR[1], minZ: ROOM.minZ - T, maxZ: ROOM.minZ };
  colliders.push(studioGate);

  // ---------- expansion: porch market stall (hidden until built) ----------
  const stall = makeTable(shelfCtx, 'S', -3.6, 5.55, 0, { width: 1.9, cloth: true, stall: true });
  stall.group.userData.dynamic = true;
  stall.group.visible = false;
  root.add(stall.group);

  const drop = (c) => { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); };
  const expansions = {
    studio: {
      open: () => {
        if (studio.visible) return;
        studio.visible = true;
        boards.visible = false;
        drop(studioGate);
        colliders.push(...studioColliders);
      },
      close: () => {
        if (!studio.visible) return;
        studio.visible = false;
        boards.visible = true;
        studioColliders.forEach(drop);
        colliders.push(studioGate);
      },
    },
    stall: {
      open: () => {
        if (stall.group.visible) return;
        stall.group.visible = true;
        for (const sec of stall.sections) sections.set(sec.id, sec);
        colliders.push(stall.collider);
      },
      close: () => {
        if (!stall.group.visible) return;
        stall.group.visible = false;
        for (const sec of stall.sections) sections.delete(sec.id);
        drop(stall.collider);
      },
    },
  };

  return {
    root, sections, lights, porchLight, door: { pivot: doorPivot, bellPivot, sign, signMat, signTexOpen, signTexClosed },
    clock: { hour: hourHand, minute: minHand, pos: clock.position.clone() },
    register, ledger, radio, board, pins, crates, stations: { candle: candleSpot, lamp: lampSpot, lens: lensSpot, glass: glassSpot }, lampLocked,
    studio, expansions, studioLight: new THREE.Vector3(3.2, 2.0, -6.0), shelfCtx, roofMat,
    anchors: {
      porchDrop: [new THREE.Vector3(4.3, 0.01, 5.0), new THREE.Vector3(4.6, 0.01, 5.65), new THREE.Vector3(3.8, 0.01, 5.7), new THREE.Vector3(1.8, 0.01, 5.0), new THREE.Vector3(1.6, 0.01, 5.65), new THREE.Vector3(4.75, 0.01, 4.55)],
      counterCustomer: new THREE.Vector3(2.82, 0, 0.05),
      queue: [new THREE.Vector3(2.82, 0, 0.05), new THREE.Vector3(2.7, 0, -0.85), new THREE.Vector3(2.55, 0, -1.7), new THREE.Vector3(1.9, 0, -2.35), new THREE.Vector3(1.0, 0, -2.5)],
      counterDrop: new THREE.Vector3(3.38, 1.02, 0.4),
      inside: new THREE.Vector3(2.9, 0, 3.2),
      outside: new THREE.Vector3(2.9, 0, 5.2),
      gate: new THREE.Vector3(2.9, 0, 11.2),
      playerStart: new THREE.Vector3(3.4, 0, 2.6),
      playerBehindCounter: new THREE.Vector3(4.5, 0, 0.05),
      catSpots: [new THREE.Vector3(0.6, 0, 1.0), new THREE.Vector3(-3.0, 0, -0.2), new THREE.Vector3(-3.8, 0, -2.7), new THREE.Vector3(0.6, 0, 2.6), new THREE.Vector3(4.45, 0, -1.6), new THREE.Vector3(-0.2, 0, -2.6)],
    },
  };
}

// ---------- reusable fixtures (also used for decor placed by the player) ----------
let shelfWoodMat = null;
const shelfWood = () => (shelfWoodMat ||= toon('#ffffff', { map: textures.planks([1, 1]) }));
const tagMaterial = () => new THREE.MeshToonMaterial({ map: textures.label('—', { size: 40, w: 160, h: 72 }), gradientMap: m('#fff').gradientMap });

function worldBox(x, z, rotY, hw, hd) {
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const ex = hw * c + hd * s, ez = hw * s + hd * c;
  return { minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez };
}

/** A 1.6 m shelf unit with 3 levels × 2 sections. Front faces local +z. */
export function makeShelfUnit({ hit }, id, x, z, rotY, { levels = [0.28, 0.78, 1.28], height = 1.85, backed = true } = {}) {
  const W = 1.6, D = 0.44;
  const unit = new THREE.Group();
  unit.position.set(x, 0, z);
  unit.rotation.y = rotY;
  const wood = shelfWood();
  const side = (sx) => { const sm = new THREE.Mesh(new RoundedBoxGeometry(0.06, height, D, 2, 0.012), wood); sm.position.set(sx, height / 2, 0); unit.add(sm); };
  side(-W / 2); side(W / 2);
  if (backed) { const back = new THREE.Mesh(new THREE.BoxGeometry(W, height, 0.03), m('#a8754c')); back.position.set(0, height / 2, -D / 2 + 0.015); unit.add(back); }
  const topB = new THREE.Mesh(new RoundedBoxGeometry(W + 0.08, 0.05, D + 0.04, 2, 0.012), wood);
  topB.position.set(0, height, 0);
  unit.add(topB);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, D - 0.04), m('#6e4a36'));
  plinth.position.y = 0.05;
  unit.add(plinth);
  const sections = [];
  unit.updateMatrixWorld(true);
  levels.forEach((y, li) => {
    const board = new THREE.Mesh(new RoundedBoxGeometry(W - 0.06, 0.035, D - 0.02, 2, 0.01), wood);
    board.position.set(0, y, 0);
    unit.add(board);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, 0.05, 0.02), m('#8a5a3b'));
    lip.position.set(0, y - 0.005, D / 2 - 0.01);
    unit.add(lip);
    for (let si = 0; si < 2; si++) {
      const sid = `${id}-${li}${si}`;
      const cx = -W / 4 + (si * W) / 2;
      const holder = new THREE.Group();
      holder.position.set(cx, y + 0.018, 0.0);
      holder.userData.dynamic = true;
      unit.add(holder);
      const tagMat = tagMaterial();
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.058), tagMat);
      tag.position.set(cx, y - 0.003, D / 2 + 0.002);
      tag.userData.dynamic = true;
      unit.add(tag);
      unit.add(hit(new THREE.BoxGeometry(W / 2 - 0.04, 0.42, D), new THREE.Vector3(cx, y + 0.21, 0), { type: 'section', id: sid }));
      unit.add(hit(new THREE.BoxGeometry(0.16, 0.08, 0.06), new THREE.Vector3(cx, y - 0.003, D / 2 + 0.01), { type: 'tag', id: sid }));
      const front = new THREE.Vector3(cx, 0, D / 2 + 0.55).applyMatrix4(unit.matrixWorld);
      front.y = 0;
      sections.push({ id: sid, holder, tag, tagMat, width: W / 2 - 0.08, depth: D - 0.08, maxH: li < levels.length - 1 ? levels[li + 1] - y - 0.06 : height - y - 0.06, customerSpot: front, unit, level: li, items: [] });
    }
  });
  return { group: unit, sections, collider: worldBox(x, z, rotY, W / 2 + 0.05, D / 2 + 0.03) };
}

/** A display table with 2 sections. Customers stand on the local +z side. */
export function makeTable({ hit }, id, x, z, rotY, { width = 1.8, cloth = true, stall = false } = {}) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const wood = shelfWood();
  const top = new THREE.Mesh(new RoundedBoxGeometry(width, 0.07, 0.75, 2, 0.02), wood);
  top.position.y = 0.74;
  g.add(top);
  for (const [lx, lz] of [[-width / 2 + 0.1, -0.3], [width / 2 - 0.1, -0.3], [-width / 2 + 0.1, 0.3], [width / 2 - 0.1, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), m('#6e4a36'));
    leg.position.set(lx, 0.36, lz);
    g.add(leg);
  }
  if (cloth) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(width + 0.04, 0.01, 0.4), m('#b85a4c'));
    c.position.set(0, 0.78, 0);
    g.add(c);
  }
  if (stall) {
    // striped market awning on four posts
    for (const [px, pz] of [[-width / 2, -0.38], [width / 2, -0.38], [-width / 2, 0.42], [width / 2, 0.42]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), m('#8a5a3b'));
      post.position.set(px, 1.1, pz);
      g.add(post);
    }
    const stripes = 8;
    for (let k = 0; k < stripes; k++) {
      const sw = (width + 0.3) / stripes;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.04, 1.2), m(k % 2 ? '#f6ecd8' : '#b85a4c'));
      strip.position.set(-width / 2 - 0.15 + sw * (k + 0.5), 2.2, 0.12);
      strip.rotation.x = -0.28;
      g.add(strip);
      const flap = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.16, 0.03), m(k % 2 ? '#f6ecd8' : '#b85a4c'));
      flap.position.set(strip.position.x, 1.98, 0.72);
      g.add(flap);
    }
  }
  g.updateMatrixWorld(true);
  const sections = [];
  for (let si = 0; si < 2; si++) {
    const sid = `${id}-0${si}`;
    const cx = -width / 4 + (si * width) / 2;
    const holder = new THREE.Group();
    holder.position.set(cx, 0.78, 0);
    holder.userData.dynamic = true;
    g.add(holder);
    const tagMat = tagMaterial();
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.058), tagMat);
    tag.position.set(cx, 0.74, 0.38);
    tag.userData.dynamic = true;
    g.add(tag);
    g.add(hit(new THREE.BoxGeometry(width / 2 - 0.08, 0.5, 0.7), new THREE.Vector3(cx, 1.02, 0), { type: 'section', id: sid }));
    g.add(hit(new THREE.BoxGeometry(0.16, 0.08, 0.06), new THREE.Vector3(cx, 0.74, 0.39), { type: 'tag', id: sid }));
    const front = new THREE.Vector3(cx, 0, 0.9).applyMatrix4(g.matrixWorld);
    front.y = 0;
    sections.push({ id: sid, holder, tag, tagMat, width: width / 2 - 0.12, depth: 0.6, maxH: stall ? 1.0 : 0.8, customerSpot: front, unit: g, level: 0, items: [] });
  }
  return { group: g, sections, collider: worldBox(x, z, rotY, width / 2 + 0.05, 0.42) };
}

function buildRegister() {
  const g = new THREE.Group();
  const brass = m('#c99a3e');
  const dark = m('#5a3c2c');
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.1, 0.36, 2, 0.02), dark);
  base.position.y = 0.05;
  g.add(base);
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.2, 0.26, 2, 0.03), brass);
  body.position.set(0, 0.2, -0.02);
  body.rotation.x = -0.25;
  g.add(body);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 12), m('#f6ecd8'));
      k.position.set(-0.13 + c * 0.065, 0.27 - r * 0.045, 0.1 - r * 0.05);
      k.rotation.x = -0.25;
      g.add(k);
    }
  }
  const display = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.09, 0.05, 2, 0.01), brass);
  display.position.set(0, 0.36, -0.1);
  g.add(display);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), glow('#bfe8c8', 0.9));
  scr.position.set(0, 0.36, -0.07);
  g.add(scr);
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.02), m('#8a5a3b'));
  drawer.position.set(0, 0.06, 0.18);
  g.add(drawer);
  const bellTop = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass);
  bellTop.position.set(0.19, 0.1, 0.14);
  g.add(bellTop);
  g.userData.drawer = drawer;
  return g;
}

function buildLedger() {
  const g = new THREE.Group();
  const cover = m('#7d3d35');
  const book = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.05, 0.3, 2, 0.01), cover);
  book.position.y = 0.025;
  g.add(book);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.035, 0.28), m('#f6ecd8'));
  pages.position.y = 0.03;
  g.add(pages);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.055, 0.305), m('#d9b44a'));
  strap.position.set(0.12, 0.026, 0);
  g.add(strap);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.28, 6), m('#f3e9d6'));
  quill.rotation.z = Math.PI / 2.3;
  quill.position.set(-0.05, 0.08, 0.2);
  g.add(quill);
  return g;
}

export { flame };
