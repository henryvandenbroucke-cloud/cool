import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { frame } from './frameState';
import { overlay } from './overlay';
import { trailColor } from './Trails';
import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from '../shaders/common';

const MAX = 512;

const VERT = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute vec3 aColor;
attribute float aRadius;
attribute float aSize;
uniform float uViewport;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aRadius * projectionMatrix[1][1] * uViewport * 0.5 / max(-mv.z, 1e-6);
  // Markers stand in for bodies too small to see and fade out once the body itself is visible.
  vAlpha = 1.0 - smoothstep(2.0, 5.0, px);
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = length(c);
  if (d > 1.0 || vAlpha < 0.01) discard;
  float core = smoothstep(0.42, 0.25, d);
  float halo = exp(-d * d * 5.0) * 0.55;
  gl_FragColor = vec4(vColor * (core * 1.6 + halo) * vAlpha, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

const v = new THREE.Vector3();

/** Glowing dots for bodies smaller than a few pixels, plus per-frame projection for the DOM overlay. */
export function Markers() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const structure = useWorld((s) => s.structureVersion);
  const props = useWorld((s) => s.propertyVersion);
  const points = useRef<THREE.Points>(null);

  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
    g.setAttribute('aRadius', new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uViewport: { value: 800 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  // Colours and base sizes only change when bodies change.
  useEffect(() => {
    const col = geometry.attributes.aColor as THREE.BufferAttribute;
    const sz = geometry.attributes.aSize as THREE.BufferAttribute;
    engine.bodies.slice(0, MAX).forEach((b, i) => {
      const c = trailColor(b);
      col.setXYZ(i, c.r, c.g, c.b);
      sz.setX(i, b.kind === 'star' ? 9 : b.kind === 'blackHole' ? 8 : b.kind === 'asteroid' ? 3.2 : b.kind === 'moon' ? 4.5 : 6.5);
    });
    col.needsUpdate = true;
    sz.needsUpdate = true;
  }, [structure, props, geometry]);

  useFrame(() => {
    const n = Math.min(engine.bodies.length, MAX);
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const rad = geometry.attributes.aRadius as THREE.BufferAttribute;
    const halfH = size.height / 2;
    const halfW = size.width / 2;
    const focal = halfH / Math.tan((camera.fov * Math.PI) / 360);
    camera.updateMatrixWorld();
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const b = engine.bodies[i];
      const p = frame.positions.get(b.id);
      const r = frame.radii.get(b.id) ?? 0;
      if (!p) continue;
      pos.setXYZ(i, p.x, p.y, p.z);
      rad.setX(i, r);
      // Project for the DOM overlay.
      v.copy(p).applyMatrix4(camera.matrixWorldInverse);
      const depth = -v.z;
      let e = overlay.entries.get(b.id);
      if (!e) {
        e = { id: b.id, x: 0, y: 0, r: 0, depth: 0, visible: false };
        overlay.entries.set(b.id, e);
      }
      seen.add(b.id);
      if (depth <= camera.near) {
        e.visible = false;
        continue;
      }
      v.applyMatrix4(camera.projectionMatrix);
      e.x = (v.x + 1) * halfW;
      e.y = (1 - v.y) * halfH;
      e.r = (r * focal) / depth;
      e.depth = depth;
      e.visible = e.x > -200 && e.x < size.width + 200 && e.y > -200 && e.y < size.height + 200;
    }
    for (const id of overlay.entries.keys()) if (!seen.has(id)) overlay.entries.delete(id);
    pos.needsUpdate = true;
    rad.needsUpdate = true;
    geometry.setDrawRange(0, n);
    material.uniforms.uViewport.value = size.height;
    material.uniforms.uPixelRatio.value = dpr;
    overlay.publish();
  });

  return <points ref={points} geometry={geometry} material={material} frustumCulled={false} renderOrder={7} />;
}
