import * as THREE from 'three';
import { RENDER_SCALE } from '../simulation/constants';
import type { SimulationEngine } from '../simulation/engine';
import { blackbodyRGB } from '../utils/color';
import { frame } from './frameState';

export const MAX_LIGHTS = 4;

/**
 * Light uniforms shared (by reference) between every lit material, so a single
 * update per frame relights the whole scene.
 */
export const lightUniforms = {
  uLightPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3()) },
  uLightStrength: { value: new Array<number>(MAX_LIGHTS).fill(0) },
  uLightCount: { value: 0 },
  uRenderScale: { value: RENDER_SCALE },
};

const candidates: { id: string; power: number; color: [number, number, number] }[] = [];

/** Picks the brightest emitters (stars, and black-hole accretion disks) as scene lights. */
export function updateLights(engine: SimulationEngine): void {
  candidates.length = 0;
  for (const b of engine.bodies) {
    if (b.kind === 'star') {
      const c = blackbodyRGB(b.appearance.temperature || 5778);
      candidates.push({ id: b.id, power: Math.sqrt(Math.max(b.luminosity, 1e-4)), color: c });
    } else if (b.kind === 'blackHole') {
      candidates.push({ id: b.id, power: 1.1 * Math.min(2, Math.sqrt(b.mass / 20)), color: [1, 0.62, 0.32] });
    }
  }
  candidates.sort((a, b) => b.power - a.power);
  const n = Math.min(MAX_LIGHTS, candidates.length);
  for (let i = 0; i < n; i++) {
    const c = candidates[i];
    const p = frame.positions.get(c.id);
    if (p) lightUniforms.uLightPos.value[i].copy(p);
    // Normalise colour so the brightest channel is 1 (hue only), strength carries luminosity.
    const m = Math.max(c.color[0], c.color[1], c.color[2]);
    lightUniforms.uLightColor.value[i].set(c.color[0] / m, c.color[1] / m, c.color[2] / m);
    lightUniforms.uLightStrength.value[i] = c.power;
  }
  lightUniforms.uLightCount.value = n;
}
