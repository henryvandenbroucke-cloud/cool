import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { dominantBody, sampleOrbitHistory } from '../simulation/orbits';
import { RENDER_SCALE } from '../simulation/constants';
import type { SimBody } from '../simulation/body';
import { blackbodyHex, hexToRgb, rgbToHex } from '../utils/color';
import { frame } from './frameState';
import { Ribbon, ribbonResolution } from './ribbon';
import { QUALITY } from './quality';

const SELECT_COLOR = new THREE.Color('#41d9ff');
const LENGTH_FACTOR = { short: 0.5, medium: 1, long: 2 } as const;

/** Trail colour: the body's palette pushed to a readable, luminous tone. */
export function trailColor(b: SimBody): THREE.Color {
  if (b.kind === 'star') return new THREE.Color(blackbodyHex(b.appearance.temperature || 5778));
  if (b.kind === 'blackHole') return new THREE.Color('#ff9a3c');
  if (b.kind === 'comet') return new THREE.Color('#9fe9ff');
  const c = new THREE.Color(rgbToHex(hexToRgb(b.appearance.style === 'terran' ? '#4f9bff' : b.appearance.colors[0])));
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0.35, Math.min(0.85, hsl.s)), 0.62);
  return c;
}

interface TrailState {
  ribbon: Ribbon;
  parentId: string | null;
  relative: boolean;
  lastRel: THREE.Vector3;
  lastPoint: THREE.Vector3;
  nextParentCheck: number;
  selected: boolean;
}

const ZERO = new THREE.Vector3();
const tmpRel = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function hasTrail(b: SimBody, selectedId: string | null): boolean {
  if (b.id === selectedId) return true;
  return b.kind !== 'asteroid';
}

/**
 * Orbit trails. Each body records its real simulated path, sampled by angle
 * around its dominant body. Moons are drawn relative to their planet so their
 * loops stay readable while the planet moves.
 */
export function Trails() {
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const showTrails = useSettings((s) => s.showTrails);
  const trailLength = useSettings((s) => s.trailLength);
  const quality = useSettings((s) => s.quality);
  const epoch = useWorld((s) => s.epoch);
  const capacity = Math.round(QUALITY[quality].trailPoints * LENGTH_FACTOR[trailLength]);

  const group = useMemo(() => new THREE.Group(), []);
  const trails = useMemo(() => new Map<string, TrailState>(), []);
  // `prefill` marks the first frame after a world loads.
  const state = useMemo(() => ({ prefill: true }), []);

  useEffect(() => {
    scene.add(group);
    return () => {
      scene.remove(group);
    };
  }, [scene, group]);

  // Rebuild everything when the world, the capacity or visibility changes.
  useEffect(() => {
    for (const t of trails.values()) {
      group.remove(t.ribbon.mesh);
      t.ribbon.dispose();
    }
    trails.clear();
    state.prefill = true;
  }, [epoch, capacity, trails, group, state]);

  useEffect(() => {
    group.visible = showTrails;
  }, [showTrails, group]);

  useEffect(() => {
    ribbonResolution.value.set(size.width, size.height);
  }, [size]);

  useEffect(
    () => () => {
      for (const t of trails.values()) t.ribbon.dispose();
      trails.clear();
    },
    [trails],
  );

  useFrame(() => {
    if (!showTrails) return;
    const selectedId = useWorld.getState().selectedId;
    const dTheta = (Math.PI * 2 * 0.92) / capacity;
    const prefill = state.prefill;
    state.prefill = false;
    const alive = new Set<string>();

    for (const b of engine.bodies) {
      if (!hasTrail(b, selectedId)) continue;
      const pos = frame.positions.get(b.id);
      if (!pos) continue;
      alive.add(b.id);
      let t = trails.get(b.id);
      if (!t) {
        const color = trailColor(b);
        const ribbon = new Ribbon(capacity, { color, headColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.35), width: 1.6, opacity: 0.75 });
        group.add(ribbon.mesh);
        t = { ribbon, parentId: null, relative: false, lastRel: new THREE.Vector3(), lastPoint: new THREE.Vector3(), nextParentCheck: 0, selected: false };
        trails.set(b.id, t);
      }

      // Re-evaluate which body this one orbits (cheap; staggered).
      if (frame.time >= t.nextParentCheck) {
        t.nextParentCheck = frame.time + 0.5 + Math.random() * 0.3;
        const parent = dominantBody(engine.bodies, b.x, b.y, b.z, b.mass, b);
        const parentId = parent?.id ?? null;
        const relative = Boolean(parent && parent.kind !== 'star' && parent.kind !== 'blackHole');
        if (parentId !== t.parentId || relative !== t.relative) {
          t.parentId = parentId;
          t.relative = relative;
          t.ribbon.clear();
          if (prefill && parent) prefillTrail(t, b, parent, capacity);
        }
      }

      const parentPos = t.parentId ? frame.positions.get(t.parentId) : undefined;
      const offset = t.relative && parentPos ? parentPos : null;
      tmpP.copy(pos);
      if (offset) tmpP.sub(offset);
      if (parentPos) tmpRel.copy(pos).sub(parentPos);
      else tmpRel.copy(pos);

      const selected = b.id === selectedId;
      if (selected !== t.selected) {
        t.selected = selected;
        const base = trailColor(b);
        t.ribbon.material.uniforms.uColor.value.copy(selected ? SELECT_COLOR : base);
        t.ribbon.material.uniforms.uHeadColor.value.copy(selected ? new THREE.Color('#e6fbff') : base.clone().lerp(new THREE.Color('#ffffff'), 0.35));
        t.ribbon.material.uniforms.uWidth.value = selected ? 2.6 : 1.6;
        t.ribbon.material.uniforms.uOpacity.value = selected ? 1 : 0.75;
      }
      t.ribbon.material.uniforms.uOffset.value.copy(offset ?? ZERO);

      if (t.ribbon.count === 0) {
        t.ribbon.push(tmpP.x, tmpP.y, tmpP.z);
        t.ribbon.push(tmpP.x, tmpP.y, tmpP.z);
        t.lastRel.copy(tmpRel);
        t.lastPoint.copy(tmpP);
        t.ribbon.rebuild();
        continue;
      }

      const rLen = tmpRel.length();
      const angle = t.lastRel.lengthSq() > 0 && rLen > 0 ? t.lastRel.angleTo(tmpRel) : 0;
      const moved = tmpP.distanceTo(t.lastPoint);
      const minStep = Math.max(rLen * dTheta, 0.00002 * RENDER_SCALE);
      if (angle >= dTheta || moved >= minStep * 1.5) {
        // Commit the current head and start a new one.
        t.ribbon.setHead(tmpP.x, tmpP.y, tmpP.z);
        t.ribbon.push(tmpP.x, tmpP.y, tmpP.z);
        t.lastRel.copy(tmpRel);
        t.lastPoint.copy(tmpP);
        t.ribbon.rebuild();
      } else {
        t.ribbon.setHead(tmpP.x, tmpP.y, tmpP.z);
        t.ribbon.refreshHead();
      }
    }

    for (const [id, t] of trails) {
      if (!alive.has(id)) {
        group.remove(t.ribbon.mesh);
        t.ribbon.dispose();
        trails.delete(id);
      }
    }
  });

  return null;
}

/** Seeds a trail with the osculating orbit so orbits are visible the moment a world loads. */
function prefillTrail(t: TrailState, b: SimBody, parent: SimBody, capacity: number) {
  const samples = sampleOrbitHistory(b, parent, 0.88, capacity);
  if (!samples) return;
  const ppos = frame.positions.get(parent.id);
  const pts = new Float32Array(capacity * 3);
  for (let i = 0; i < capacity; i++) {
    const x = samples[i * 3] * RENDER_SCALE;
    const y = samples[i * 3 + 1] * RENDER_SCALE;
    const z = samples[i * 3 + 2] * RENDER_SCALE;
    if (t.relative || !ppos) {
      pts[i * 3] = x;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = z;
    } else {
      pts[i * 3] = ppos.x + x;
      pts[i * 3 + 1] = ppos.y + y;
      pts[i * 3 + 2] = ppos.z + z;
    }
  }
  t.ribbon.setPoints(pts, capacity);
  t.lastPoint.set(pts[0], pts[1], pts[2]);
  const ref = ppos ?? ZERO;
  t.lastRel.set(b.x * RENDER_SCALE - ref.x, b.y * RENDER_SCALE - ref.y, b.z * RENDER_SCALE - ref.z);
  t.ribbon.rebuild();
}
