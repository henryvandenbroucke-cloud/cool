import * as THREE from 'three';
import { mulberry32 } from '../utils/random';

const spheres = new Map<number, THREE.SphereGeometry>();

/** Shared unit spheres (scaled per body), so geometry is never recreated per frame or per body. */
export function unitSphere(segments: number): THREE.SphereGeometry {
  let g = spheres.get(segments);
  if (!g) {
    g = new THREE.SphereGeometry(1, segments, Math.max(16, Math.round(segments / 2)));
    spheres.set(segments, g);
  }
  return g;
}

let quad: THREE.PlaneGeometry | null = null;
export function unitQuad(): THREE.PlaneGeometry {
  if (!quad) quad = new THREE.PlaneGeometry(2, 2);
  return quad;
}

const rings = new Map<string, THREE.RingGeometry>();
export function ringGeometry(inner: number, outer: number, segments = 160): THREE.RingGeometry {
  const key = `${inner.toFixed(3)}:${outer.toFixed(3)}:${segments}`;
  let g = rings.get(key);
  if (!g) {
    g = new THREE.RingGeometry(inner, outer, segments, 4);
    rings.set(key, g);
  }
  return g;
}

const rocks = new Map<number, THREE.BufferGeometry>();
/** Lumpy asteroid shapes: a few cached variants displaced with layered noise. */
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const variant = Math.abs(seed) % 8;
  let g = rocks.get(variant);
  if (g) return g;
  const base = new THREE.IcosahedronGeometry(1, 4);
  const pos = base.attributes.position as THREE.BufferAttribute;
  const rng = mulberry32(variant * 7919 + 17);
  const blobs = Array.from({ length: 7 }, () => ({
    d: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
    s: 0.2 + rng() * 0.35,
    w: 1.5 + rng() * 3,
  }));
  const craters = Array.from({ length: 10 }, () => ({
    d: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize(),
    r: 0.15 + rng() * 0.3,
  }));
  const stretch = new THREE.Vector3(1 + rng() * 0.5, 0.7 + rng() * 0.3, 0.8 + rng() * 0.3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1;
    for (const b of blobs) r += b.s * Math.pow(Math.max(0, v.dot(b.d)), b.w) - b.s * 0.25;
    for (const c of craters) {
      const d = v.angleTo(c.d) / c.r;
      if (d < 1.3) r -= 0.08 * (d < 1 ? 1 - d * d : -(d - 1) * 0.6);
    }
    v.multiply(stretch).multiplyScalar(r * 0.8);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  base.computeVertexNormals();
  g = base;
  rocks.set(variant, g);
  return g;
}
