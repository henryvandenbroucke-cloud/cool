import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { frame } from './frameState';
import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from '../shaders/common';

const N = 16;

const VERT = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
#define N ${N}
uniform vec4 uWells[N]; // xyz position, w = strength
uniform float uSoft[N];
uniform int uCount;
uniform float uDepthScale;
varying vec3 vWorld;
varying float vDepth;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float depth = 0.0;
  for (int i = 0; i < N; i++) {
    if (i >= uCount) break;
    vec2 d = wp.xz - uWells[i].xz;
    depth += uWells[i].w / sqrt(dot(d, d) + uSoft[i] * uSoft[i]);
  }
  depth = min(depth * uDepthScale, uDepthScale * 40.0);
  wp.y -= depth;
  vWorld = wp.xyz;
  vDepth = depth;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FRAG = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform float uSpacing;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uDepthNorm;
uniform vec3 uSelected;
uniform float uSelectedR;
varying vec3 vWorld;
varying float vDepth;
float line(float v) {
  float d = abs(fract(v - 0.5) - 0.5) / fwidth(v);
  return 1.0 - smoothstep(0.0, 1.2, d);
}
void main() {
  vec2 p = vWorld.xz / uSpacing;
  float g = max(line(p.x), line(p.y));
  float major = max(line(p.x / 5.0), line(p.y / 5.0));
  float r = length(vWorld.xz - uCenter.xz) / uRadius;
  float fade = smoothstep(1.0, 0.35, r);
  float deep = clamp(vDepth / uDepthNorm, 0.0, 1.0);
  vec3 col = mix(vec3(0.16, 0.62, 0.95), vec3(0.62, 0.38, 1.0), deep);
  float sel = uSelectedR > 0.0 ? exp(-length(vWorld.xz - uSelected.xz) / uSelectedR) : 0.0;
  float a = (g * 0.22 + major * 0.25) * fade * (0.6 + deep * 1.4 + sel * 2.0);
  gl_FragColor = vec4(col * a, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/**
 * "Spacetime fabric" visualisation of the Newtonian potential: the sheet dips
 * by Σ √m / √(d² + s²). The √m scaling is a visual exaggeration so planets
 * show up next to stars — it is a depiction of attraction, not GR curvature.
 */
export function GravityGrid() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;
  const mesh = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2, 220, 220);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uWells: { value: Array.from({ length: N }, () => new THREE.Vector4()) },
        uSoft: { value: new Array(N).fill(1) },
        uCount: { value: 0 },
        uDepthScale: { value: 1 },
        uSpacing: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uRadius: { value: 1 },
        uDepthNorm: { value: 1 },
        uSelected: { value: new THREE.Vector3() },
        uSelectedR: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
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

  useFrame(() => {
    if (!mesh.current) return;
    const target = controls?.target ?? new THREE.Vector3();
    const dist = camera.position.distanceTo(target);
    const size = dist * 2.2;
    const spacingRaw = size / 28;
    const p = Math.pow(10, Math.floor(Math.log10(spacingRaw)));
    const spacing = (spacingRaw / p < 2 ? 1 : spacingRaw / p < 5 ? 2 : 5) * p;
    // Snap so lines don't swim as the camera moves.
    const cx = Math.round(target.x / spacing) * spacing;
    const cz = Math.round(target.z / spacing) * spacing;
    mesh.current.position.set(cx, target.y - dist * 0.02, cz);
    mesh.current.scale.setScalar(size);
    const u = material.uniforms;
    const wells = [...engine.bodies].sort((a, b) => b.mass - a.mass).slice(0, N);
    let maxW = 0;
    wells.forEach((b, i) => {
      const pos = frame.positions.get(b.id);
      if (!pos) return;
      const w = Math.sqrt(b.mass);
      const soft = Math.max((frame.radii.get(b.id) ?? 0) * 2.5, size * 0.012);
      u.uWells.value[i].set(pos.x, pos.y, pos.z, w);
      u.uSoft.value[i] = soft;
      maxW = Math.max(maxW, w / soft);
    });
    u.uCount.value = wells.length;
    u.uDepthScale.value = maxW > 0 ? (dist * 0.32) / maxW : 0;
    u.uDepthNorm.value = dist * 0.15;
    u.uSpacing.value = spacing;
    u.uCenter.value.set(cx, 0, cz);
    u.uRadius.value = size;
    const sel = useWorld.getState().selectedId;
    const sp = sel ? frame.positions.get(sel) : null;
    if (sp) {
      u.uSelected.value.copy(sp);
      u.uSelectedR.value = dist * 0.08;
    } else u.uSelectedR.value = 0;
  });

  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1} />;
}
