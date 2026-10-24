// Grid pathfinding for townsfolk inside the shop + yard. Colliders are
// inflated by a body radius; paths are smoothed with line-of-sight checks.

import * as THREE from 'three';

const CELL = 0.2;
const BOUNDS = { minX: -7, maxX: 7.4, minZ: -8, maxZ: 12 };

export class NavGrid {
  constructor(colliders, { radius = 0.3, extraBlocked = [] } = {}) {
    this.w = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / CELL);
    this.h = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / CELL);
    this.blocked = new Uint8Array(this.w * this.h);
    const all = colliders.filter((c) => !c.playerOnly).concat(extraBlocked);
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = BOUNDS.minX + (i + 0.5) * CELL;
        const z = BOUNDS.minZ + (j + 0.5) * CELL;
        let b = false;
        for (const c of all) {
          if (x > c.minX - radius && x < c.maxX + radius && z > c.minZ - radius && z < c.maxZ + radius) { b = true; break; }
        }
        // behind the shop is forest, except the studio annex
        if (z < -3.7 && !(x > 1.4 && x < 5.0 && z > -7.8)) b = true;
        this.blocked[j * this.w + i] = b ? 1 : 0;
      }
    }
  }

  cell(x, z) {
    return [Math.floor((x - BOUNDS.minX) / CELL), Math.floor((z - BOUNDS.minZ) / CELL)];
  }
  center(i, j) { return new THREE.Vector3(BOUNDS.minX + (i + 0.5) * CELL, 0, BOUNDS.minZ + (j + 0.5) * CELL); }
  isFree(i, j) { return i >= 0 && j >= 0 && i < this.w && j < this.h && !this.blocked[j * this.w + i]; }

  nearestFree(i, j) {
    if (this.isFree(i, j)) return [i, j];
    for (let r = 1; r < 12; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        if (this.isFree(i + di, j + dj)) return [i + di, j + dj];
      }
    }
    return [i, j];
  }

  find(from, to) {
    const [si, sj] = this.nearestFree(...this.cell(from.x, from.z));
    const [ti, tj] = this.nearestFree(...this.cell(to.x, to.z));
    const W = this.w;
    const start = sj * W + si, goal = tj * W + ti;
    const g = new Float32Array(this.w * this.h).fill(Infinity);
    const came = new Int32Array(this.w * this.h).fill(-1);
    const closed = new Uint8Array(this.w * this.h);
    const open = new MinHeap();
    g[start] = 0;
    open.push(start, 0);
    const hfn = (n) => { const i = n % W, j = (n / W) | 0; return Math.hypot(i - ti, j - tj); };
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false;
    let guard = 0;
    while (open.size && guard++ < 40000) {
      const cur = open.pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % W, cj = (cur / W) | 0;
      for (const [di, dj, cost] of dirs) {
        const ni = ci + di, nj = cj + dj;
        if (!this.isFree(ni, nj)) continue;
        if (di && dj && (!this.isFree(ci + di, cj) || !this.isFree(ci, cj + dj))) continue;
        const n = nj * W + ni;
        const ng = g[cur] + cost;
        if (ng < g[n]) { g[n] = ng; came[n] = cur; open.push(n, ng + hfn(n)); }
      }
    }
    if (!found) return [to.clone()];
    const cells = [];
    for (let n = goal; n !== -1; n = came[n]) cells.push(n);
    cells.reverse();
    const pts = cells.map((n) => this.center(n % W, (n / W) | 0));
    return this.smooth([from.clone(), ...pts.slice(1, -1), to.clone()]);
  }

  lineFree(a, b) {
    const steps = Math.ceil(a.distanceTo(b) / (CELL * 0.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const [i, j] = this.cell(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.isFree(i, j)) return false;
    }
    return true;
  }

  smooth(pts) {
    if (pts.length <= 2) return pts.slice(1);
    const out = [];
    let anchor = pts[0];
    let i = 1;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineFree(anchor, pts[j])) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.n = []; this.p = []; }
  get size() { return this.n.length; }
  push(n, p) {
    this.n.push(n); this.p.push(p);
    let i = this.n.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (this.p[par] <= this.p[i]) break;
      [this.n[par], this.n[i]] = [this.n[i], this.n[par]];
      [this.p[par], this.p[i]] = [this.p[i], this.p[par]];
      i = par;
    }
  }
  pop() {
    const top = this.n[0];
    const ln = this.n.pop(), lp = this.p.pop();
    if (this.n.length) {
      this.n[0] = ln; this.p[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.n.length && this.p[l] < this.p[m]) m = l;
        if (r < this.n.length && this.p[r] < this.p[m]) m = r;
        if (m === i) break;
        [this.n[m], this.n[i]] = [this.n[i], this.n[m]];
        [this.p[m], this.p[i]] = [this.p[i], this.p[m]];
        i = m;
      }
    }
    return top;
  }
}
