import * as THREE from 'three';
import { RIBBON_FRAGMENT, RIBBON_VERTEX } from '../shaders/lines';

/** Resolution uniform shared by every ribbon (updated once per frame). */
export const ribbonResolution = { value: new THREE.Vector2(1, 1) };

export interface RibbonStyle {
  color: THREE.Color;
  headColor?: THREE.Color;
  width: number;
  opacity: number;
  dash?: number;
}

/**
 * A polyline rendered as a screen-space ribbon. Points are stored newest
 * first; `age` runs 0 (head) → 1 (tail) and drives the fade.
 */
export class Ribbon {
  readonly capacity: number;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly points: Float32Array;
  count = 0;
  private geometry: THREE.BufferGeometry;
  private pos: THREE.BufferAttribute;
  private prev: THREE.BufferAttribute;
  private next: THREE.BufferAttribute;
  private age: THREE.BufferAttribute;
  private dist: THREE.BufferAttribute;

  constructor(capacity: number, style: RibbonStyle) {
    this.capacity = capacity;
    this.points = new Float32Array(capacity * 3);
    const v = capacity * 2;
    this.geometry = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.prev = new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.next = new THREE.BufferAttribute(new Float32Array(v * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.age = new THREE.BufferAttribute(new Float32Array(v), 1).setUsage(THREE.DynamicDrawUsage);
    this.dist = new THREE.BufferAttribute(new Float32Array(v), 1).setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(v);
    for (let i = 0; i < capacity; i++) {
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
    }
    const index: number[] = [];
    for (let i = 0; i < capacity - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.geometry.setAttribute('position', this.pos);
    this.geometry.setAttribute('aPrev', this.prev);
    this.geometry.setAttribute('aNext', this.next);
    this.geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geometry.setAttribute('aAge', this.age);
    this.geometry.setAttribute('aDist', this.dist);
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      uniforms: {
        uResolution: ribbonResolution,
        uWidth: { value: style.width },
        uOffset: { value: new THREE.Vector3() },
        uColor: { value: style.color.clone() },
        uHeadColor: { value: (style.headColor ?? style.color).clone() },
        uOpacity: { value: style.opacity },
        uDash: { value: style.dash ?? 0 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
      // Screen-space expansion makes winding depend on travel direction: never cull.
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  clear(): void {
    this.count = 0;
    this.geometry.setDrawRange(0, 0);
  }

  /** Inserts a new head point, shifting older points back (oldest falls off). */
  push(x: number, y: number, z: number): void {
    const n = Math.min(this.count, this.capacity - 1);
    this.points.copyWithin(3, 0, n * 3);
    this.points[0] = x;
    this.points[1] = y;
    this.points[2] = z;
    this.count = n + 1;
  }

  /** Moves the head point without committing a new sample. */
  setHead(x: number, y: number, z: number): void {
    if (this.count === 0) {
      this.push(x, y, z);
      return;
    }
    this.points[0] = x;
    this.points[1] = y;
    this.points[2] = z;
  }

  setPoints(src: ArrayLike<number>, count: number): void {
    const n = Math.min(count, this.capacity);
    for (let i = 0; i < n * 3; i++) this.points[i] = src[i];
    this.count = n;
  }

  /** Rebuilds all vertex attributes from `points`. */
  rebuild(): void {
    const n = this.count;
    const p = this.points;
    const pos = this.pos.array as Float32Array;
    const prev = this.prev.array as Float32Array;
    const next = this.next.array as Float32Array;
    const age = this.age.array as Float32Array;
    const dist = this.dist.array as Float32Array;
    let d = 0;
    for (let i = 0; i < n; i++) {
      const ip = Math.max(0, i - 1);
      const inx = Math.min(n - 1, i + 1);
      if (i > 0) d += Math.hypot(p[i * 3] - p[ip * 3], p[i * 3 + 1] - p[ip * 3 + 1], p[i * 3 + 2] - p[ip * 3 + 2]);
      const a = n > 1 ? i / (n - 1) : 0;
      for (let s = 0; s < 2; s++) {
        const v = i * 2 + s;
        pos[v * 3] = p[i * 3];
        pos[v * 3 + 1] = p[i * 3 + 1];
        pos[v * 3 + 2] = p[i * 3 + 2];
        prev[v * 3] = p[ip * 3];
        prev[v * 3 + 1] = p[ip * 3 + 1];
        prev[v * 3 + 2] = p[ip * 3 + 2];
        next[v * 3] = p[inx * 3];
        next[v * 3 + 1] = p[inx * 3 + 1];
        next[v * 3 + 2] = p[inx * 3 + 2];
        age[v] = a;
        dist[v] = d;
      }
    }
    for (const attr of [this.pos, this.prev, this.next]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 6);
      attr.needsUpdate = true;
    }
    for (const attr of [this.age, this.dist]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 2);
      attr.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  /** Cheap per-frame update of just the head vertices. */
  refreshHead(): void {
    if (this.count < 2) {
      this.rebuild();
      return;
    }
    const p = this.points;
    const pos = this.pos.array as Float32Array;
    const prev = this.prev.array as Float32Array;
    for (let s = 0; s < 2; s++) {
      pos[s * 3] = p[0];
      pos[s * 3 + 1] = p[1];
      pos[s * 3 + 2] = p[2];
      prev[s * 3] = p[0];
      prev[s * 3 + 1] = p[1];
      prev[s * 3 + 2] = p[2];
      // Vertex pair 1 references the head as its "prev".
      prev[(2 + s) * 3] = p[0];
      prev[(2 + s) * 3 + 1] = p[1];
      prev[(2 + s) * 3 + 2] = p[2];
    }
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, 6);
    this.pos.needsUpdate = true;
    this.prev.clearUpdateRanges();
    this.prev.addUpdateRange(0, 12);
    this.prev.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
