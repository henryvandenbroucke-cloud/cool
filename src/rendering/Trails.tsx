import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { sampleOrbitHistory } from '../simulation/orbits';
import { RENDER_SCALE } from '../simulation/constants';
import type { SimBody } from '../simulation/body';
import { blackbodyHex } from '../utils/color';
import { frame } from './frameState';
import { Ribbon, ribbonResolution } from './ribbon';
import { QUALITY } from './quality';

const SELECT_COLOR = new THREE.Color('#41d9ff');
const SELECT_HEAD = new THREE.Color('#e6fbff');
const WHITE = new THREE.Color('#ffffff');
const LENGTH_FACTOR = { short: 0.5, medium: 1, long: 2 } as const;
const ZERO = new THREE.Vector3();

/** Trail colour: the body's palette pushed to a luminous, saturated tone. */
export function trailColor(b: SimBody): THREE.Color {
  if (b.kind === 'star') return new THREE.Color(blackbodyHex(b.appearance.temperature || 5778));
  if (b.kind === 'blackHole') return new THREE.Color('#ff9a3c');
  if (b.kind === 'comet') return new THREE.Color('#8fe6ff');
  const source = b.appearance.style === 'terran' ? '#3f8cff' : b.appearance.style === 'ice' ? '#9fd8ff' : b.appearance.colors[0];
  const c = new THREE.Color(source);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.max(0.5, Math.min(0.9, hsl.s * 1.25)), 0.6);
  return c;
}

interface TrailState {
  ribbon: Ribbon;
  body: SimBody;
  parent: SimBody | null;
  relative: boolean;
  lastRel: THREE.Vector3;
  lastPoint: THREE.Vector3;
  nextParentCheck: number;
  selected: boolean;
}

const tmpRel = new THREE.Vector3();
const tmpP = new THREE.Vector3();

function hasTrail(b: SimBody, selectedId: string | null): boolean {
  if (b.id === selectedId) return true;
  return b.kind !== 'asteroid';
}

function parentScore(b: SimBody, p: SimBody): number {
  const dx = p.x - b.x;
  const dy = p.y - b.y;
  const dz = p.z - b.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const primary = p.kind === 'star' || p.kind === 'blackHole';
  return ((primary ? 3 : 1) * p.mass) / (d2 * Math.sqrt(d2) + 1e-30);
}

/**
 * The body a trail is drawn around. Like `dominantBody`, but debris never
 * becomes a parent and a new parent must clearly dominate before the trail
 * switches frames (hysteresis), so impacts don't make trails jump around.
 */
function trailParent(b: SimBody, current: SimBody | null): SimBody | null {
  let best: SimBody | null = null;
  let bestScore = 0;
  for (const p of engine.bodies) {
    if (p === b || p.mass < b.mass * 1.5 || p.kind === 'asteroid' || p.kind === 'comet' || p.type === 'fragment') continue;
    const s = parentScore(b, p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (current && current.alive && best && best !== current && bestScore < parentScore(b, current) * 1.8) return current;
  return best;
}

/**
 * Orbit trails. Positions are sampled after every physics step (by angle
 * around the dominant body), so trails stay smooth at any frame rate or time
 * speed. Moons are drawn relative to their planet so their loops stay readable.
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
  const state = useMemo(() => ({ prefill: true }), []);

  useEffect(() => {
    scene.add(group);
    return () => {
      scene.remove(group);
    };
  }, [scene, group]);

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

  // Dense sampling after every fixed physics step.
  useEffect(() => {
    if (!showTrails) return;
    const dTheta = (Math.PI * 2 * 0.92) / capacity;
    const onStep = () => {
      for (const t of trails.values()) {
        const b = t.body;
        if (!b.alive) continue;
        const p = t.parent && t.parent.alive ? t.parent : null;
        tmpP.set(b.x * RENDER_SCALE, b.y * RENDER_SCALE, b.z * RENDER_SCALE);
        if (p) tmpRel.set((b.x - p.x) * RENDER_SCALE, (b.y - p.y) * RENDER_SCALE, (b.z - p.z) * RENDER_SCALE);
        else tmpRel.copy(tmpP);
        if (t.relative) tmpP.copy(tmpRel);
        const rLen = tmpRel.length();
        const angle = t.lastRel.lengthSq() > 0 && rLen > 0 ? t.lastRel.angleTo(tmpRel) : 0;
        const moved = tmpP.distanceTo(t.lastPoint);
        const minStep = Math.max(rLen * dTheta, 0.00002 * RENDER_SCALE);
        if (angle >= dTheta || moved >= minStep * 1.5) {
          t.ribbon.commit(tmpP.x, tmpP.y, tmpP.z);
          t.lastRel.copy(tmpRel);
          t.lastPoint.copy(tmpP);
        }
      }
    };
    engine.onStep = onStep;
    return () => {
      if (engine.onStep === onStep) engine.onStep = null;
    };
  }, [showTrails, capacity, trails]);

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
        const ribbon = new Ribbon(capacity, { color, headColor: color.clone().lerp(WHITE, 0.4), width: 2.4, opacity: 0.8 });
        group.add(ribbon.mesh);
        t = { ribbon, body: b, parent: null, relative: false, lastRel: new THREE.Vector3(), lastPoint: new THREE.Vector3(), nextParentCheck: 0, selected: false };
        trails.set(b.id, t);
      }
      t.body = b;

      if (frame.time >= t.nextParentCheck) {
        t.nextParentCheck = frame.time + 0.4 + Math.random() * 0.3;
        const parent = trailParent(b, t.parent);
        const relative = Boolean(parent && parent.kind !== 'star' && parent.kind !== 'blackHole');
        if (parent !== t.parent || relative !== t.relative) {
          t.parent = parent;
          t.relative = relative;
          t.ribbon.clear();
          t.lastRel.set(0, 0, 0);
          if (prefill && parent) prefillTrail(t, b, parent, capacity);
        }
      }

      const parentPos = t.parent ? frame.positions.get(t.parent.id) : undefined;
      const offset = t.relative && parentPos ? parentPos : null;
      tmpP.copy(pos);
      if (offset) tmpP.sub(offset);

      const selected = b.id === selectedId;
      if (selected !== t.selected) {
        t.selected = selected;
        const base = trailColor(b);
        const u = t.ribbon.material.uniforms;
        u.uColor.value.copy(selected ? SELECT_COLOR : base);
        u.uHeadColor.value.copy(selected ? SELECT_HEAD : base.clone().lerp(WHITE, 0.4));
        u.uWidth.value = selected ? 3.4 : 2.4;
        u.uOpacity.value = selected ? 1 : 0.8;
      }
      const u = t.ribbon.material.uniforms;
      u.uOffset.value.copy(offset ?? ZERO);
      u.uHeadClear.value = frame.radii.get(b.id) ?? 0;

      if (t.ribbon.count === 0) {
        t.ribbon.push(tmpP.x, tmpP.y, tmpP.z);
        t.ribbon.push(tmpP.x, tmpP.y, tmpP.z);
        t.lastRel.copy(t.parent && parentPos ? tmpRel.copy(pos).sub(parentPos) : pos);
        t.lastPoint.copy(tmpP);
        t.ribbon.rebuild();
        continue;
      }
      t.ribbon.setHead(tmpP.x, tmpP.y, tmpP.z);
      if (t.ribbon.dirty) t.ribbon.rebuild();
      else t.ribbon.refreshHead();
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
  t.lastRel.set((b.x - parent.x) * RENDER_SCALE, (b.y - parent.y) * RENDER_SCALE, (b.z - parent.z) * RENDER_SCALE);
  t.ribbon.rebuild();
}
