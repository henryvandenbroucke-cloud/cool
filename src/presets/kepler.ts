import { G } from '../simulation/constants';
import type { Vec3 } from '../simulation/types';

export interface KeplerParent {
  mass: number;
  position: Vec3;
  velocity: Vec3;
}

export interface KeplerElements {
  /** Semi-major axis (AU). */
  a: number;
  e?: number;
  /** Inclination (deg) relative to the XZ plane. */
  i?: number;
  /** Longitude of the ascending node (deg). */
  node?: number;
  /** Argument of periapsis (deg). */
  peri?: number;
  /** True anomaly (deg). */
  anomaly?: number;
  /** Retrograde orbit (clockwise seen from +Y). */
  retrograde?: boolean;
}

const DEG = Math.PI / 180;

/**
 * Converts classical orbital elements into a state vector around `parent`.
 * Orbits are prograde = counter-clockwise when viewed from +Y (the scene's "up").
 */
export function keplerState(parent: KeplerParent, mass: number, el: KeplerElements): { position: Vec3; velocity: Vec3 } {
  const e = el.e ?? 0;
  const inc = (el.i ?? 0) * DEG + (el.retrograde ? Math.PI : 0);
  const node = (el.node ?? 0) * DEG;
  const peri = (el.peri ?? 0) * DEG;
  const nu = (el.anomaly ?? 0) * DEG;
  const mu = G * (parent.mass + mass);
  const p = el.a * (1 - e * e);
  const r = p / (1 + e * Math.cos(nu));
  // Perifocal frame.
  const px = r * Math.cos(nu);
  const py = r * Math.sin(nu);
  const k = Math.sqrt(mu / p);
  const vx = -k * Math.sin(nu);
  const vy = k * (e + Math.cos(nu));
  const rot = (x: number, y: number): Vec3 => {
    // Rz(peri)
    const x1 = x * Math.cos(peri) - y * Math.sin(peri);
    const y1 = x * Math.sin(peri) + y * Math.cos(peri);
    // Rx(inc)
    const x2 = x1;
    const y2 = y1 * Math.cos(inc);
    const z2 = y1 * Math.sin(inc);
    // Rz(node)
    const x3 = x2 * Math.cos(node) - y2 * Math.sin(node);
    const y3 = x2 * Math.sin(node) + y2 * Math.cos(node);
    const z3 = z2;
    // Reference frame (normal +Z) → scene (normal +Y): x→x, y→−z, z→y.
    return { x: x3, y: z3, z: -y3 };
  };
  const pos = rot(px, py);
  const vel = rot(vx, vy);
  return {
    position: { x: parent.position.x + pos.x, y: parent.position.y + pos.y, z: parent.position.z + pos.z },
    velocity: { x: parent.velocity.x + vel.x, y: parent.velocity.y + vel.y, z: parent.velocity.z + vel.z },
  };
}
