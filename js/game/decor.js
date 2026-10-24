// Decorating: place, rotate and move furniture. Shelves and tables you place
// become real selling space; everything else makes the shop cozier.

import * as THREE from 'three';
import { placeable } from './assets.js';
import { audio } from './audio.js';
import { DECOR } from './config.js';
import { placeDecor, storeDecor } from './state.js';
import { makeShelfUnit, makeTable } from './shop.js';
import { lamp as lampMesh } from './products.js';
import { toon, LAYER_NO_INK } from './render.js';
import { popIn } from './tween.js';

const ROOM = { minX: -4.75, maxX: 4.75, minZ: -3.75, maxZ: 3.75 };
const STUDIO = { minX: 1.6, maxX: 4.8, minZ: -6.9, maxZ: -4.4 };
const YARD = { minX: -6.5, maxX: 6.5, minZ: 4.5, maxZ: 10.2 };

function proc(type) {
  const g = new THREE.Group();
  if (type === 'catbed') {
    const basket = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 24), toon('#b9895a'));
    basket.rotation.x = Math.PI / 2;
    basket.position.y = 0.08;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24), toon('#a8754c'));
    base.position.y = 0.025;
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 24), toon('#b85a4c'));
    cushion.position.y = 0.07;
    g.add(basket, base, cushion);
  } else if (type === 'floorlamp') {
    const l = lampMesh('brass', 'drum', 'amber', { on: true });
    l.scale.set(2.2, 2.2, 2.2);
    l.position.y = 0.9;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 10), toon('#c99a3e'));
    pole.position.y = 0.5;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.04, 20), toon('#5a3c2c'));
    foot.position.y = 0.02;
    g.add(pole, foot, l);
  }
  return g;
}

export class Decor {
  constructor(game) {
    this.game = game;
    this.items = new Map();   // decor id -> { root, collider, sections }
    this.placing = null;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.ray = new THREE.Raycaster();
    const ringGeo = new THREE.RingGeometry(0.9, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#8fe3a8', transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.layers.set(LAYER_NO_INK);
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    game.scene.add(this.ring);
    this.bar = document.getElementById('place-bar');
    this.barName = document.getElementById('place-name');
  }

  get world() { return this.game.world; }

  async makeMesh(type, x, z, rot, id) {
    const D = DECOR[type];
    if (D.proc === 'shelf' || D.proc === 'table') {
      const built = D.proc === 'shelf'
        ? makeShelfUnit(this.world.shop.shelfCtx, id, x, z, rot)
        : makeTable(this.world.shop.shelfCtx, id, x, z, rot, { width: 1.5, cloth: true });
      return { root: built.group, sections: built.sections, collider: built.collider };
    }
    let root;
    if (D.model) root = await placeable(D.model, { height: D.height, width: D.width });
    else if (D.proc === 'barrel') {
      root = await placeable('survival/barrel.glb', { height: 0.75 });
      const flowers = new THREE.Group();
      ['#e07a6c', '#f0c05a', '#b5a3d8', '#f6ecd8', '#e07a6c', '#f0c05a'].forEach((c, i) => {
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), toon(c));
        const a = (i / 6) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.12, 0.8 + (i % 2) * 0.05, Math.sin(a) * 0.12);
        flowers.add(f);
      });
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), toon('#5f9a62'));
      leaves.scale.y = 0.5;
      leaves.position.y = 0.76;
      root.add(leaves, flowers);
    } else root = proc(D.proc);
    root.position.set(x, 0, z);
    root.rotation.y = rot;
    const collider = D.flat ? null : { minX: x - D.r * 0.85, maxX: x + D.r * 0.85, minZ: z - D.r * 0.85, maxZ: z + D.r * 0.85 };
    return { root, sections: [], collider };
  }

  /** Rebuild every placed decor item from the save. */
  async rebuild(state) {
    for (const id of [...this.items.keys()]) this.removeInstance(id);
    for (const d of state.decor) await this.addInstance(d);
    this.game.rebuildNav();
  }

  async addInstance(d) {
    const built = await this.makeMesh(d.type, d.x, d.z, d.rot, d.id);
    this.game.scene.add(built.root);
    const hit = this.world.hit(new THREE.CylinderGeometry(DECOR[d.type].r, DECOR[d.type].r, 0.9, 12), new THREE.Vector3(0, 0.45, 0), { type: 'decor', id: d.id });
    built.root.add(hit);
    if (built.collider) this.world.colliders.push(built.collider);
    for (const sec of built.sections) this.world.shop.sections.set(sec.id, sec);
    if (built.sections.length) this.game.shelves.rebuildAll();
    this.items.set(d.id, built);
    return built;
  }

  removeInstance(id) {
    const it = this.items.get(id);
    if (!it) return;
    it.root.parent?.remove(it.root);
    if (it.collider) { const i = this.world.colliders.indexOf(it.collider); if (i >= 0) this.world.colliders.splice(i, 1); }
    for (const sec of it.sections) this.world.shop.sections.delete(sec.id);
    this.items.delete(id);
  }

  hasStock(id) {
    const it = this.items.get(id);
    return !!it && it.sections.some((sec) => this.game.state.sections[sec.id]?.count > 0);
  }

  // ---------- placement mode ----------
  async start(type) {
    if (this.placing) this.cancel();
    const D = DECOR[type];
    const tmpId = '__ghost';
    const built = await this.makeMesh(type, 0, 0, 0, tmpId);
    built.root.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
    this.game.scene.add(built.root);
    this.placing = { type, built, rot: this.lastRot || 0, valid: false, x: 0, z: 0 };
    this.ring.scale.setScalar(D.r || 0.4);
    this.ring.visible = true;
    this.bar.hidden = false;
    this.barName.textContent = D.name;
    if (this.game.held) this.game.dropHeld();
  }

  rotate(dir = 1) {
    if (!this.placing) return;
    this.placing.rot += (Math.PI / 4) * dir;
    this.lastRot = this.placing.rot;
    audio.play('cloth', { volume: 0.3 });
  }

  validAt(x, z) {
    const p = this.placing;
    const D = DECOR[p.type];
    const r = D.r || 0.4;
    const inside = (A) => x - r * 0.6 > A.minX && x + r * 0.6 < A.maxX && z - r * 0.6 > A.minZ && z + r * 0.6 < A.maxZ;
    const okArea = inside(ROOM) || (this.world.studioOpen && inside(STUDIO)) || (D.outdoor && inside(YARD));
    if (!okArea) return false;
    if (Math.hypot(x - 2.9, z - 4.0) < 1.2) return false;               // keep the doorway clear
    if (x > 3.0 && z > -1.3 && z < 1.9 && x < 5) return false;          // behind the counter
    if (D.flat) return true;
    // footprint of the item (shelves are long; others round-ish)
    const box = p.built.collider
      ? (() => { const c = p.built.collider; const hw = (c.maxX - c.minX) / 2, hd = (c.maxZ - c.minZ) / 2; return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd }; })()
      : { minX: x - r * 0.8, maxX: x + r * 0.8, minZ: z - r * 0.8, maxZ: z + r * 0.8 };
    for (const c of this.world.colliders) {
      if (c.outside && !D.outdoor) continue;
      if (box.minX < c.maxX && box.maxX > c.minX && box.minZ < c.maxZ && box.maxZ > c.minZ) return false;
    }
    const pp = this.game.player.pos;
    if (pp.x > box.minX - 0.25 && pp.x < box.maxX + 0.25 && pp.z > box.minZ - 0.25 && pp.z < box.maxZ + 0.25) return false;
    return true;
  }

  update() {
    const p = this.placing;
    if (!p) return;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), this.game.camera);
    const hitPt = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, hitPt)) return;
    const from = this.game.player.pos;
    const d = Math.hypot(hitPt.x - from.x, hitPt.z - from.z);
    if (d > 4) hitPt.set(from.x + ((hitPt.x - from.x) / d) * 4, 0, from.z + ((hitPt.z - from.z) / d) * 4);
    p.x = Math.round(hitPt.x * 10) / 10;
    p.z = Math.round(hitPt.z * 10) / 10;
    // shelf colliders were built at the origin with a rotation; recompute the footprint for this rotation
    if (p.built.collider && (p.colRot !== p.rot)) {
      const D = DECOR[p.type];
      const W = D.proc === 'shelf' ? 0.85 : 0.8, H = D.proc === 'shelf' ? 0.25 : 0.42;
      const c = Math.abs(Math.cos(p.rot)), s = Math.abs(Math.sin(p.rot));
      const ex = W * c + H * s, ez = W * s + H * c;
      p.built.collider = { minX: -ex, maxX: ex, minZ: -ez, maxZ: ez };
      p.colRot = p.rot;
    }
    p.valid = this.validAt(p.x, p.z);
    p.built.root.position.set(p.x, 0, p.z);
    p.built.root.rotation.y = p.rot;
    this.ring.position.set(p.x, 0.02, p.z);
    this.ring.material.color.set(p.valid ? '#8fe3a8' : '#ff8a7a');
  }

  async confirm() {
    const p = this.placing;
    if (!p) return false;
    if (!p.valid) { audio.play('cloth', { volume: 0.3, rate: 0.7 }); this.game.ui.toast('It won’t fit there — try another spot.', 'i-chair', 1.8); return false; }
    const s = this.game.state;
    const d = placeDecor(s, p.type, p.x, p.z, p.rot);
    this.clearGhost();
    if (!d) return false;
    const built = await this.addInstance(d);
    popIn(built.root, { from: 0.8, squash: 0.08 });
    audio.play('place_wood', { volume: 0.6 });
    this.game.rebuildNav();
    this.game.onDecorChanged();
    return true;
  }

  cancel() {
    if (!this.placing) return;
    this.clearGhost();
    this.game.ui.toast('Put away — find it under Decor in the ledger.', 'i-crate', 2);
    this.game.onDecorChanged();
  }

  clearGhost() {
    const p = this.placing;
    if (!p) return;
    p.built.root.parent?.remove(p.built.root);
    this.placing = null;
    this.ring.visible = false;
    this.bar.hidden = true;
  }

  /** Pick up something already placed and move it. */
  move(id) {
    if (this.hasStock(id)) { this.game.ui.toast('Empty this shelf before moving it.', 'i-crate', 2); return; }
    const d = storeDecor(this.game.state, id);
    if (!d) return;
    this.removeInstance(id);
    this.game.rebuildNav();
    this.lastRot = d.rot;
    this.start(d.type);
  }
}
