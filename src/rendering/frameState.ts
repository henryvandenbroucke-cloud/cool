import * as THREE from 'three';
import { RENDER_SCALE } from '../simulation/constants';
import type { SimBody } from '../simulation/body';
import type { SimulationEngine } from '../simulation/engine';

/**
 * Per-frame render state shared by every visual. Updated once per frame by the
 * simulation driver (before anything draws) so components never recompute
 * positions or trigger React renders.
 */
export const frame = {
  /** Wall-clock seconds since start (visual animation time; keeps running while paused). */
  time: 0,
  /** Real seconds elapsed this frame (clamped). */
  delta: 0,
  /** Simulated years advanced this frame. */
  simDelta: 0,
  /** Body render positions in scene units. */
  positions: new Map<string, THREE.Vector3>(),
  /** Effective (display) radius in scene units. */
  radii: new Map<string, number>(),
  /** Accumulated visual spin angle (radians) per body. */
  spin: new Map<string, number>(),
  /** Temporary bloom boost from impacts (0..∞), decays every frame. */
  bloomBoost: 0,
  /** Camera shake amplitude in units of the current camera distance. */
  shake: 0,
  /** Lensing targets (black holes) in scene units. */
  blackHoles: [] as { id: string; position: THREE.Vector3; radius: number }[],
};

const tmp = { x: 0, y: 0, z: 0 };

export function updateFramePositions(engine: SimulationEngine): void {
  const seen = new Set<string>();
  frame.blackHoles.length = 0;
  for (const b of engine.bodies) {
    seen.add(b.id);
    let v = frame.positions.get(b.id);
    if (!v) {
      v = new THREE.Vector3();
      frame.positions.set(b.id, v);
    }
    engine.renderPosition(b, tmp);
    v.set(tmp.x * RENDER_SCALE, tmp.y * RENDER_SCALE, tmp.z * RENDER_SCALE);
    const r = engine.effectiveRadius(b) * RENDER_SCALE;
    frame.radii.set(b.id, r);
    if (b.kind === 'blackHole') frame.blackHoles.push({ id: b.id, position: v, radius: r });
  }
  if (frame.positions.size !== seen.size) {
    for (const id of frame.positions.keys()) {
      if (!seen.has(id)) {
        frame.positions.delete(id);
        frame.radii.delete(id);
        frame.spin.delete(id);
      }
    }
  }
}

/** Visual spin: real rotation rate, capped so fast-forward never strobes. */
export function updateSpin(b: SimBody, timeScale: number, delta: number, paused: boolean): number {
  let angle = frame.spin.get(b.id) ?? (b.appearance.seed % 628) / 100;
  if (!paused && b.rotationPeriod !== 0) {
    const revPerSec = (timeScale * 365.25) / b.rotationPeriod;
    const capped = Math.max(-0.05, Math.min(0.05, revPerSec));
    angle += capped * Math.PI * 2 * delta;
  }
  frame.spin.set(b.id, angle);
  return angle;
}

export function bodyPosition(id: string): THREE.Vector3 | undefined {
  return frame.positions.get(id);
}
