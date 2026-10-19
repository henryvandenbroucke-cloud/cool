import type { SimBody } from '../simulation/body';
import type { SimulationEngine } from '../simulation/engine';
import { dominantBody, orbitalElements, predictTrajectory, type PointMass } from '../simulation/orbits';
import { RENDER_SCALE } from '../simulation/constants';
import type { BodyKind } from '../simulation/types';

export type PredictBody = PointMass & { id: string; kind: BodyKind; radius: number; mass: number };

export interface PathPreview {
  /** Points in trail space (scene units), newest-first order is not required: index 0 = now. */
  points: Float32Array;
  count: number;
  /** Draw relative to this body's current render position (moons), or null for world space. */
  relativeTo: string | null;
  impactId: string | null;
  impactName: string | null;
  duration: number;
  parentId: string | null;
}

/**
 * Forward-integrates a reduced copy of the system (the most massive bodies plus
 * the target's parent) to preview where `target` is heading. Light bodies are
 * left out to keep this cheap enough to run several times a second.
 */
export function previewPath(engine: SimulationEngine, target: PredictBody, isExtra: boolean, steps = 520): PathPreview | null {
  const parent = dominantBody(engine.bodies, target.x, target.y, target.z, target.mass, isExtra ? undefined : (target as unknown as SimBody));
  const sorted = engine.bodies.filter((b) => b.id !== target.id).sort((a, b) => b.mass - a.mass);
  const subset: SimBody[] = sorted.slice(0, 12);
  if (parent && !subset.includes(parent)) subset.push(parent);
  // Include nearby bodies so impacts are detected.
  for (const b of sorted) {
    if (subset.length > 22) break;
    if (subset.includes(b)) continue;
    const d = Math.hypot(b.x - target.x, b.y - target.y, b.z - target.z);
    if (d < 0.6) subset.push(b);
  }
  const list: PredictBody[] = isExtra ? subset : [...subset, target];
  const targetIndex = isExtra ? -1 : list.length - 1;

  let duration = 1;
  if (parent) {
    const el = orbitalElements(target, parent);
    if (el.bound && Number.isFinite(el.period)) duration = Math.min(Math.max(el.period * 1.02, 0.01), 400);
    else duration = Math.min(Math.max((6 * el.distance) / Math.max(el.relativeSpeed, 1e-6), 0.02), 60);
  }
  const relative = Boolean(parent && parent.kind !== 'star' && parent.kind !== 'blackHole');
  const refIndex = relative && parent ? list.indexOf(parent) : -1;
  const res = predictTrajectory(list, isExtra ? target : null, targetIndex, {
    steps,
    duration,
    softening: engine.softening,
    scale: engine.settings.sizeScale,
    referenceIndex: refIndex >= 0 ? refIndex : undefined,
    maxSubsteps: 8,
  });
  const out = new Float32Array(res.count * 3);
  for (let i = 0; i < res.count; i++) {
    let x = res.path[i * 3];
    let y = res.path[i * 3 + 1];
    let z = res.path[i * 3 + 2];
    if (res.reference) {
      x -= res.reference[i * 3];
      y -= res.reference[i * 3 + 1];
      z -= res.reference[i * 3 + 2];
    }
    out[i * 3] = x * RENDER_SCALE;
    out[i * 3 + 1] = y * RENDER_SCALE;
    out[i * 3 + 2] = z * RENDER_SCALE;
  }
  const impact = res.impactId ? engine.getBody(res.impactId) : undefined;
  return {
    points: out,
    count: res.count,
    relativeTo: relative && parent ? parent.id : null,
    impactId: res.impactId,
    impactName: impact?.name ?? null,
    duration: res.duration,
    parentId: parent?.id ?? null,
  };
}
