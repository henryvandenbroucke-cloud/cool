// Shelf sections: lays items out in tidy rows, keeps price tags in sync with
// the save, and pops items in and out with a little squash.

import * as THREE from 'three';
import { productMesh, footprint } from './products.js';
import { sectionCapacity, priceFor, productName } from './state.js';
import { textures } from './render.js';
import { popIn, tween, ease } from './tween.js';

export class Shelves {
  constructor(world, state) {
    this.world = world;
    this.sections = world.shop.sections;
    this.state = state;
  }

  setState(state) { this.state = state; this.rebuildAll(); }

  data(id) {
    return this.state.sections[id] || null;
  }

  rebuildAll() {
    for (const id of this.sections.keys()) this.rebuild(id);
  }

  slotPositions(sec, key, count) {
    const k0 = this.scaleFor(key, sec);
    const f0 = footprint(key);
    const fp = { w: f0.w * k0, d: f0.d * k0 };
    const cols = Math.max(1, Math.floor(sec.width / fp.w));
    const rows = Math.max(1, Math.floor(sec.depth / fp.d));
    const out = [];
    for (let k = 0; k < count; k++) {
      const c = k % cols, r = Math.floor(k / cols) % rows;
      const x = -((cols - 1) * fp.w) / 2 + c * fp.w;
      const z = ((rows - 1) * fp.d) / 2 - r * fp.d;
      out.push(new THREE.Vector3(x, 0, z));
    }
    return out;
  }

  rebuild(id) {
    const sec = this.sections.get(id);
    if (!sec) return;
    for (const it of sec.items) sec.holder.remove(it);
    sec.items = [];
    const d = this.data(id);
    if (d && d.count > 0) {
      const pos = this.slotPositions(sec, d.key, d.count);
      for (let k = 0; k < d.count; k++) {
        const m = productMesh(d.key, { on: true });
        m.scale.setScalar(this.scaleFor(d.key, sec));
        m.position.copy(pos[k]);
        m.rotation.y = (Math.random() - 0.5) * 0.18;
        sec.holder.add(m);
        sec.items.push(m);
      }
    }
    this.updateTag(id);
  }

  scaleFor(key, sec) {
    // products are modelled at real size; shelves keep them a touch larger for legibility
    if (key.startsWith('lamp')) return Math.min(1.5, sec.maxH / 0.32);
    return 1.35;
  }

  updateTag(id) {
    const sec = this.sections.get(id);
    const d = this.data(id);
    const text = d && d.key ? `${priceFor(this.state, d.key).toFixed(2)}` : '—';
    if (sec.tagMat.userData.text === text) return;
    sec.tagMat.map?.dispose();
    sec.tagMat.map = textures.label(text, { size: 40, w: 160, h: 72, bg: d?.count ? '#f6ecd8' : '#e7d6b4' });
    sec.tagMat.needsUpdate = true;
    sec.tagMat.userData.text = text;
  }

  updateTagsFor(key) {
    for (const [id] of this.sections) if (this.data(id)?.key === key) this.updateTag(id);
  }

  /** Can this key go into this section? */
  accepts(id, key) {
    const d = this.data(id);
    if (!d || d.count === 0) return true;
    return d.key === key && d.count < sectionCapacity(key);
  }

  space(id, key) {
    const d = this.data(id);
    if (!d || d.count === 0) return sectionCapacity(key);
    return d.key === key ? sectionCapacity(key) - d.count : 0;
  }

  /** Add one item; returns true on success. */
  add(id, key) {
    if (!this.accepts(id, key)) return false;
    const sec = this.sections.get(id);
    let d = this.data(id);
    if (!d || d.count === 0) { d = this.state.sections[id] = { key, count: 0 }; for (const it of sec.items) sec.holder.remove(it); sec.items = []; }
    d.count++;
    const pos = this.slotPositions(sec, key, d.count);
    const m = productMesh(key, { on: true });
    m.scale.setScalar(this.scaleFor(key, sec));
    m.position.copy(pos[d.count - 1]);
    m.position.y += 0.08;
    m.rotation.y = (Math.random() - 0.5) * 0.18;
    sec.holder.add(m);
    sec.items.push(m);
    const y0 = m.position.y;
    tween({ duration: 0.22, easing: ease.outCubic, update: (k) => { m.position.y = y0 - 0.08 * k; } });
    popIn(m, { from: 0.75, duration: 0.3, squash: 0.1 });
    this.updateTag(id);
    return true;
  }

  /** Remove one item (customer pick-up or player taking back). */
  take(id) {
    const d = this.data(id);
    if (!d || d.count <= 0) return null;
    const sec = this.sections.get(id);
    const m = sec.items.pop();
    d.count--;
    const key = d.key;
    if (m) {
      const world = new THREE.Vector3();
      m.getWorldPosition(world);
      sec.holder.remove(m);
      m.userData.worldPos = world;
    }
    if (d.count === 0) { delete this.state.sections[id]; this.updateTag(id); }
    return { key, mesh: m };
  }

  /** Sections currently holding stock that matches a want pattern. */
  findStock(match) {
    const out = [];
    for (const [id, sec] of this.sections) {
      const d = this.data(id);
      if (d && d.count > 0 && match(d.key)) out.push({ id, sec, key: d.key });
    }
    return out;
  }

  label(id) {
    const d = this.data(id);
    return d?.count ? `${productName(d.key)} ×${d.count}` : 'Empty shelf';
  }
}
