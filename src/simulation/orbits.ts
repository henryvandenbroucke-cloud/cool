import { G } from './constants';
import { effectiveRadius } from './body';
import type { SimBody } from './body';
import type { SizeScale, Vec3 } from './types';

export interface PointMass {
  id?: string;
  kind?: string;
  mass: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * The body that dominates the local dynamics of a point: the heavier body with
 * the largest tidal strength m/d³. Stars and black holes get the Hill-sphere
 * factor of 3 (a planet's Hill radius r_H satisfies m/r_H³ = 3·M_star/a³), so a
 * point is attributed to a planet only inside roughly that planet's Hill sphere.
 */
export function dominantBody<T extends PointMass>(
  bodies: readonly T[],
  x: number,
  y: number,
  z: number,
  minMass = 0,
  exclude?: T,
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const b of bodies) {
    if (b === exclude || b.mass <= minMass) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const dz = b.z - z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 1e-24) continue;
    const primary = b.kind === 'star' || b.kind === 'blackHole';
    const score = ((primary ? 3 : 1) * b.mass) / (d2 * Math.sqrt(d2));
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return best;
}

/** Speed for a circular orbit of radius r around total mass M (AU/yr). */
export function circularSpeed(totalMass: number, r: number): number {
  return Math.sqrt((G * totalMass) / r);
}

export function escapeSpeed(totalMass: number, r: number): number {
  return Math.sqrt((2 * G * totalMass) / r);
}

/**
 * Velocity for a circular, prograde orbit (counter-clockwise seen from +Y)
 * around `parent`, including the parent's own velocity.
 */
export function circularOrbitVelocity(parent: PointMass, position: Vec3, mass: number, normal: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const rx = position.x - parent.x;
  const ry = position.y - parent.y;
  const rz = position.z - parent.z;
  const r = Math.hypot(rx, ry, rz);
  if (r < 1e-12) return { x: parent.vx, y: parent.vy, z: parent.vz };
  // Tangent = normal × r̂ (projected so it is perpendicular to r).
  let tx = normal.y * rz - normal.z * ry;
  let ty = normal.z * rx - normal.x * rz;
  let tz = normal.x * ry - normal.y * rx;
  let tl = Math.hypot(tx, ty, tz);
  if (tl < 1e-12) {
    // r parallel to the normal: pick any perpendicular direction.
    tx = 1;
    ty = 0;
    tz = 0;
    tl = 1;
  }
  const v = circularSpeed(parent.mass + mass, r);
  return {
    x: parent.vx + (tx / tl) * v,
    y: parent.vy + (ty / tl) * v,
    z: parent.vz + (tz / tl) * v,
  };
}

export interface OrbitalElements {
  semiMajorAxis: number;
  eccentricity: number;
  /** Orbital period (yr); Infinity for unbound orbits. */
  period: number;
  /** Inclination relative to the XZ (ecliptic) plane, radians. */
  inclination: number;
  bound: boolean;
  distance: number;
  relativeSpeed: number;
}

/** Two-body osculating elements of `body` relative to `parent`. */
export function orbitalElements(body: PointMass, parent: PointMass): OrbitalElements {
  const rx = body.x - parent.x;
  const ry = body.y - parent.y;
  const rz = body.z - parent.z;
  const vx = body.vx - parent.vx;
  const vy = body.vy - parent.vy;
  const vz = body.vz - parent.vz;
  const r = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const mu = G * (body.mass + parent.mass);
  const energy = v2 / 2 - mu / r;
  const a = -mu / (2 * energy);
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);
  // e = (v × h)/μ − r̂
  const ex = (vy * hz - vz * hy) / mu - rx / r;
  const ey = (vz * hx - vx * hz) / mu - ry / r;
  const ez = (vx * hy - vy * hx) / mu - rz / r;
  const e = Math.hypot(ex, ey, ez);
  const bound = energy < 0;
  return {
    semiMajorAxis: a,
    eccentricity: e,
    period: bound ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity,
    inclination: h > 0 ? Math.acos(Math.min(1, Math.max(-1, Math.abs(hy) / h))) : 0,
    bound,
    distance: r,
    relativeSpeed: Math.sqrt(v2),
  };
}

export interface PredictionResult {
  /** Positions of the predicted body, xyz interleaved (AU). */
  path: Float32Array;
  /** Positions of the reference body at the same instants (AU), if requested. */
  reference: Float32Array | null;
  count: number;
  /** Id of the body the path collides with, if any. */
  impactId: string | null;
  /** Simulated duration covered by the path (yr). */
  duration: number;
}

export interface PredictOptions {
  steps: number;
  duration: number;
  softening: number;
  scale: SizeScale;
  /** Index of a body (in `bodies`) whose path should be recorded alongside, for relative drawing. */
  referenceIndex?: number;
  maxSubsteps?: number;
}

interface Particle {
  id: string;
  kind: SimBody['kind'];
  radius: number;
  mass: number;
}

/**
 * Integrates a throw-away copy of the system forward to preview the path of
 * `target` (an index into `bodies`, or an extra body appended to the system).
 * Uses the same leapfrog scheme as the engine; collisions end the preview.
 */
export function predictTrajectory(
  bodies: readonly (PointMass & Particle)[],
  extra: (PointMass & Particle) | null,
  targetIndex: number,
  opts: PredictOptions,
): PredictionResult {
  const list = extra ? [...bodies, extra] : [...bodies];
  const n = list.length;
  const tIdx = extra ? n - 1 : targetIndex;
  const x = new Float64Array(n * 3);
  const v = new Float64Array(n * 3);
  const a = new Float64Array(n * 3);
  const m = new Float64Array(n);
  const rad = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = list[i];
    x[i * 3] = b.x;
    x[i * 3 + 1] = b.y;
    x[i * 3 + 2] = b.z;
    v[i * 3] = b.vx;
    v[i * 3 + 1] = b.vy;
    v[i * 3 + 2] = b.vz;
    m[i] = b.mass;
    rad[i] = effectiveRadius(b, opts.scale);
  }
  const eps2 = opts.softening * opts.softening;
  const path = new Float32Array((opts.steps + 1) * 3);
  const refIdx = opts.referenceIndex ?? -1;
  const reference = refIdx >= 0 ? new Float32Array((opts.steps + 1) * 3) : null;
  const dt = opts.duration / opts.steps;
  const maxSub = opts.maxSubsteps ?? 6;
  let impactId: string | null = null;
  let minDyn = Infinity;

  const accel = (): number => {
    a.fill(0);
    let minD2 = Infinity;
    let hit = -1;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j * 3] - x[i * 3];
        const dy = x[j * 3 + 1] - x[i * 3 + 1];
        const dz = x[j * 3 + 2] - x[i * 3 + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        const d2 = r2 + eps2;
        const d = Math.sqrt(d2);
        const inv = G / (d2 * d);
        a[i * 3] += m[j] * inv * dx;
        a[i * 3 + 1] += m[j] * inv * dy;
        a[i * 3 + 2] += m[j] * inv * dz;
        a[j * 3] -= m[i] * inv * dx;
        a[j * 3 + 1] -= m[i] * inv * dy;
        a[j * 3 + 2] -= m[i] * inv * dz;
        const dyn2 = (d2 * d) / (G * (m[i] + m[j]));
        if (dyn2 < minD2) minD2 = dyn2;
        if ((i === tIdx || j === tIdx) && hit < 0) {
          const rs = rad[i] + rad[j];
          if (r2 < rs * rs) hit = i === tIdx ? j : i;
        }
      }
    }
    minDyn = Math.sqrt(minD2);
    return hit;
  };

  accel();
  let count = 0;
  const record = () => {
    path[count * 3] = x[tIdx * 3];
    path[count * 3 + 1] = x[tIdx * 3 + 1];
    path[count * 3 + 2] = x[tIdx * 3 + 2];
    if (reference) {
      reference[count * 3] = x[refIdx * 3];
      reference[count * 3 + 1] = x[refIdx * 3 + 1];
      reference[count * 3 + 2] = x[refIdx * 3 + 2];
    }
    count++;
  };
  record();
  let elapsed = 0;
  for (let s = 0; s < opts.steps && impactId === null; s++) {
    const sub = Math.min(maxSub, Math.max(1, Math.ceil(dt / (0.05 * minDyn))));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      for (let i = 0; i < n * 3; i++) v[i] += a[i] * h * 0.5;
      for (let i = 0; i < n * 3; i++) x[i] += v[i] * h;
      const hit = accel();
      for (let i = 0; i < n * 3; i++) v[i] += a[i] * h * 0.5;
      elapsed += h;
      if (hit >= 0) {
        impactId = list[hit].id;
        break;
      }
    }
    record();
  }
  return { path, reference, count, impactId, duration: elapsed };
}

/**
 * Samples the osculating (two-body) orbit of `body` around `parent` backwards
 * in time, returning `count` positions relative to the parent (newest first).
 * Used only to pre-fill orbit trails when a world loads, so they are visible
 * immediately; afterwards trails record real simulated positions.
 * Returns null for unbound or nearly parabolic orbits.
 */
export function sampleOrbitHistory(body: PointMass, parent: PointMass, fraction: number, count: number): Float64Array | null {
  const rx = body.x - parent.x;
  const ry = body.y - parent.y;
  const rz = body.z - parent.z;
  const vx = body.vx - parent.vx;
  const vy = body.vy - parent.vy;
  const vz = body.vz - parent.vz;
  const mu = G * (body.mass + parent.mass);
  const r = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  const energy = v2 / 2 - mu / r;
  if (!(energy < 0) || r <= 0) return null;
  const a = -mu / (2 * energy);
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h = Math.hypot(hx, hy, hz);
  if (h <= 0) return null;
  let ex = (vy * hz - vz * hy) / mu - rx / r;
  let ey = (vz * hx - vx * hz) / mu - ry / r;
  let ez = (vx * hy - vy * hx) / mu - rz / r;
  const e = Math.hypot(ex, ey, ez);
  if (e > 0.97) return null;
  // Perifocal basis (P toward periapsis; for near-circular orbits use the current radius).
  if (e < 1e-8) {
    ex = rx / r;
    ey = ry / r;
    ez = rz / r;
  } else {
    ex /= e;
    ey /= e;
    ez /= e;
  }
  const wx = hx / h;
  const wy = hy / h;
  const wz = hz / h;
  const qx = wy * ez - wz * ey;
  const qy = wz * ex - wx * ez;
  const qz = wx * ey - wy * ex;
  const nu0 = Math.atan2(rx * qx + ry * qy + rz * qz, rx * ex + ry * ey + rz * ez);
  const E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu0 / 2), Math.sqrt(1 + e) * Math.cos(nu0 / 2));
  const M0 = E0 - e * Math.sin(E0);
  const b = a * Math.sqrt(1 - e * e);
  const out = new Float64Array(count * 3);
  for (let k = 0; k < count; k++) {
    const M = M0 - (fraction * 2 * Math.PI * k) / Math.max(1, count - 1);
    let E = M;
    for (let it = 0; it < 12; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const px = a * (Math.cos(E) - e);
    const py = b * Math.sin(E);
    out[k * 3] = px * ex + py * qx;
    out[k * 3 + 1] = px * ey + py * qy;
    out[k * 3 + 2] = px * ez + py * qz;
  }
  return out;
}
