import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { frame } from './frameState';
import { Ribbon } from './ribbon';
import { previewPath } from './prediction';

const CAP = 640;

/** Dashed forward-path prediction for the selected body, recomputed from live state a few times per second. */
export function PredictionLine() {
  const scene = useThree((s) => s.scene);
  const show = useSettings((s) => s.showPrediction);
  const selectedId = useWorld((s) => s.selectedId);
  const ribbon = useMemo(() => new Ribbon(CAP, { color: new THREE.Color('#41d9ff'), headColor: new THREE.Color('#a5f0ff'), width: 1.8, opacity: 0.85, dash: 1 }), []);
  const state = useRef({ next: 0, relativeTo: null as string | null });

  useEffect(() => {
    scene.add(ribbon.mesh);
    return () => {
      scene.remove(ribbon.mesh);
      ribbon.dispose();
    };
  }, [scene, ribbon]);

  useEffect(() => {
    ribbon.clear();
    state.current.next = 0;
  }, [selectedId, ribbon]);

  useFrame(() => {
    const body = engine.getBody(selectedId);
    ribbon.mesh.visible = show && Boolean(body) && body?.kind !== 'blackHole';
    if (!ribbon.mesh.visible || !body) return;
    if (frame.time >= state.current.next) {
      state.current.next = frame.time + 0.35;
      const p = previewPath(engine, body, false);
      if (p && p.count > 1) {
        ribbon.setPoints(p.points, p.count);
        ribbon.rebuild();
        state.current.relativeTo = p.relativeTo;
        // Dash length scales with the size of the path.
        const r = Math.hypot(p.points[0] - p.points[Math.floor(p.count / 2) * 3], p.points[2] - p.points[Math.floor(p.count / 2) * 3 + 2]);
        ribbon.material.uniforms.uDash.value = Math.max(r * 0.04, 0.002);
      }
    }
    const rel = state.current.relativeTo ? frame.positions.get(state.current.relativeTo) : null;
    ribbon.material.uniforms.uOffset.value.set(0, 0, 0);
    if (rel) ribbon.material.uniforms.uOffset.value.copy(rel);
    ribbon.material.uniforms.uTime.value = frame.time;
  });

  return null;
}
