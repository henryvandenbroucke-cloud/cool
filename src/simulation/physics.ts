import { G } from './constants';
import type { SimBody } from './body';
import type { Vec3 } from './types';

/** Accuracy parameter for the dynamical-time step criterion (~125 substeps per orbit). */
export const ETA_DYNAMICAL = 0.05;
/** Accuracy parameter for the approach-time criterion (prevents tunnelling through contacts). */
export const ETA_APPROACH = 0.08;

export interface ForceStats {
  /** Smallest pairwise dynamical time sqrt(r³ / G(m_i + m_j)) in years. */
  minDynamical: number;
  /** Smallest pairwise approach time r / v_radial (approaching pairs only) in years. */
  minApproach: number;
}

const statsScratch: ForceStats = { minDynamical: Infinity, minApproach: Infinity };

/**
 * Computes Newtonian gravitational accelerations for every body (O(N²), using
 * Newton's third law so each pair is evaluated once) with Plummer softening.
 *
 * Optionally records overlapping pairs into `contacts` as flat [i, j, i, j…]
 * index pairs, using the per-body collision radius in `radii`.
 */
export function computeAccelerations(
  bodies: readonly SimBody[],
  softening: number,
  radii: Float64Array | null,
  contacts: number[] | null,
  time = 0,
): ForceStats {
  const n = bodies.length;
  const eps2 = softening * softening;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    b.ax = 0;
    b.ay = 0;
    b.az = 0;
  }
  let minDyn2 = Infinity;
  let minApproach = Infinity;
  if (contacts) contacts.length = 0;

  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    const xi = bi.x;
    const yi = bi.y;
    const zi = bi.z;
    const mi = bi.mass;
    let axi = 0;
    let ayi = 0;
    let azi = 0;
    const ri = radii ? radii[i] : 0;
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.x - xi;
      const dy = bj.y - yi;
      const dz = bj.z - zi;
      const r2 = dx * dx + dy * dy + dz * dz;
      const d2 = r2 + eps2;
      const d = Math.sqrt(d2);
      const d3 = d2 * d;
      const inv = G / d3;
      const fj = bj.mass * inv;
      const fi = mi * inv;
      axi += fj * dx;
      ayi += fj * dy;
      azi += fj * dz;
      bj.ax -= fi * dx;
      bj.ay -= fi * dy;
      bj.az -= fi * dz;

      // Step-size criteria.
      const dyn2 = d3 / (G * (mi + bj.mass));
      if (dyn2 < minDyn2) minDyn2 = dyn2;
      const rv = dx * (bj.vx - bi.vx) + dy * (bj.vy - bi.vy) + dz * (bj.vz - bi.vz);
      if (rv < 0) {
        const tc = d2 / -rv;
        if (tc < minApproach) minApproach = tc;
      }

      if (contacts && radii) {
        const rs = ri + radii[j];
        if (r2 < rs * rs && time >= bi.collisionGraceUntil && time >= bj.collisionGraceUntil) {
          contacts.push(i, j);
        }
      }
    }
    bi.ax += axi;
    bi.ay += ayi;
    bi.az += azi;
  }
  statsScratch.minDynamical = Math.sqrt(minDyn2);
  statsScratch.minApproach = minApproach;
  return statsScratch;
}

/** Number of substeps needed to resolve the current configuration within one fixed step. */
export function substepsFor(dt: number, stats: ForceStats, maxSubsteps: number): number {
  const limit = Math.min(ETA_DYNAMICAL * stats.minDynamical, ETA_APPROACH * stats.minApproach);
  if (!(limit > 0) || !Number.isFinite(limit)) return 1;
  const n = Math.ceil(dt / limit);
  return n < 1 ? 1 : n > maxSubsteps ? maxSubsteps : n;
}

/** Kick: v += a·h. */
export function kick(bodies: readonly SimBody[], h: number): void {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.vx += b.ax * h;
    b.vy += b.ay * h;
    b.vz += b.az * h;
  }
}

/** Drift: x += v·h. */
export function drift(bodies: readonly SimBody[], h: number): void {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
  }
}

export function kineticEnergy(bodies: readonly SimBody[]): number {
  let e = 0;
  for (const b of bodies) e += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  return e;
}

export function potentialEnergy(bodies: readonly SimBody[], softening: number): number {
  let e = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      e -= (G * a.mass * b.mass) / Math.sqrt(dx * dx + dy * dy + dz * dz + eps2);
    }
  }
  return e;
}

export function totalMomentum(bodies: readonly SimBody[]): Vec3 {
  const p = { x: 0, y: 0, z: 0 };
  for (const b of bodies) {
    p.x += b.mass * b.vx;
    p.y += b.mass * b.vy;
    p.z += b.mass * b.vz;
  }
  return p;
}

export function totalMass(bodies: readonly SimBody[]): number {
  let m = 0;
  for (const b of bodies) m += b.mass;
  return m;
}

export function centerOfMass(bodies: readonly SimBody[]): { position: Vec3; velocity: Vec3; mass: number } {
  const m = totalMass(bodies);
  const position = { x: 0, y: 0, z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  if (m <= 0) return { position, velocity, mass: 0 };
  for (const b of bodies) {
    position.x += b.mass * b.x;
    position.y += b.mass * b.y;
    position.z += b.mass * b.z;
    velocity.x += b.mass * b.vx;
    velocity.y += b.mass * b.vy;
    velocity.z += b.mass * b.vz;
  }
  position.x /= m;
  position.y /= m;
  position.z /= m;
  velocity.x /= m;
  velocity.y /= m;
  velocity.z /= m;
  return { position, velocity, mass: m };
}

/** Gravitational acceleration magnitude a body of mass `m` produces at distance `r` (AU/yr²). */
export function accelerationAt(m: number, r: number): number {
  return (G * m) / (r * r);
}
