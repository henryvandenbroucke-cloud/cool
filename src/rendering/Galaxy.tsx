import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GALAXY_FRAGMENT, GALAXY_VERTEX } from '../shaders/space';
import { BILLBOARD_VERTEX, GLOW_FRAGMENT } from '../shaders/star';
import { useSettings } from '../stores/settingsStore';
import { useWorld } from '../stores/worldStore';
import { QUALITY } from './quality';
import { frame } from './frameState';
import { unitQuad } from './geometries';
import { blackbodyRGB } from '../utils/color';
import { mulberry32 } from '../utils/random';
import { RENDER_SCALE } from '../simulation/constants';

const GALAXY_RADIUS_AU = 140;

function gauss(rng: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());
}

/**
 * Decorative spiral galaxy: ~100k particles on logarithmic spiral arms with a
 * flat rotation curve evaluated in the vertex shader. Not gravitationally simulated.
 */
export function Galaxy({ centerId }: { centerId: string | null }) {
  const quality = useSettings((s) => s.quality);
  const n = QUALITY[quality].galaxyParticles;
  const dpr = useThree((s) => s.viewport.dpr);
  const group = useRef<THREE.Group>(null);
  const time = useRef(0);

  const { geometry, material, glow } = useMemo(() => {
    const rng = mulberry32(2718);
    const orbit = new Float32Array(n * 4);
    const color = new Float32Array(n * 3);
    const arms = 4;
    const pitch = 0.24;
    for (let i = 0; i < n; i++) {
      const roll = rng();
      let r: number;
      let a: number;
      let h: number;
      let kind = 0;
      let temp: number;
      let bright = 0.35 + rng() * 0.45;
      if (roll < 0.16) {
        // Bulge: old, warm, centrally concentrated.
        r = Math.abs(gauss(rng)) * 0.1;
        a = rng() * Math.PI * 2;
        h = gauss(rng) * 0.045 * (1 - Math.min(1, r * 4));
        temp = 3600 + rng() * 1400;
        bright *= 1.4;
      } else if (roll < 0.42) {
        // Smooth inter-arm disk of older stars.
        r = Math.min(1.1, -Math.log(1 - rng() * 0.97) * 0.32 + 0.05);
        a = rng() * Math.PI * 2;
        h = gauss(rng) * 0.014;
        temp = 4200 + rng() * 2200;
        bright *= 0.6;
      } else {
        // Logarithmic spiral arms: young blue stars and pink HII regions.
        r = Math.min(1.15, -Math.log(1 - rng() * 0.98) * 0.3 + 0.06);
        const arm = Math.floor(rng() * arms);
        const spread = gauss(rng) * (0.06 + 0.05 * r);
        a = (arm / arms) * Math.PI * 2 + (Math.log(r / 0.05) / Math.tan(pitch)) * 0.5 + spread;
        h = gauss(rng) * 0.01;
        const core = Math.exp(-Math.pow(spread / 0.05, 2));
        temp = rng() < 0.65 ? 8500 + rng() * 15000 : 5200 + rng() * 2400;
        if (rng() < 0.05 * core && r > 0.12) {
          kind = 1;
          bright *= 2.2;
        } else if (rng() < 0.012 && r > 0.1) {
          kind = 2;
          bright *= 0.14;
        }
        bright *= 0.8 + core * 0.6;
      }
      orbit.set([r, a, h, kind], i * 4);
      let c = blackbodyRGB(temp);
      if (kind === 1) c = [1.0, 0.32, 0.58];
      if (kind === 2) c = [0.5, 0.42, 0.9];
      color.set([Math.pow(c[0], 2.2) * bright, Math.pow(c[1], 2.2) * bright, Math.pow(c[2], 2.2) * bright], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    const m = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERTEX,
      fragmentShader: GALAXY_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uScale: { value: GALAXY_RADIUS_AU * RENDER_SCALE } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      uniforms: { uSize: { value: GALAXY_RADIUS_AU * RENDER_SCALE * 0.3 }, uColor: { value: new THREE.Vector3(1, 0.72, 0.42) }, uIntensity: { value: 0.32 }, uFalloff: { value: 5 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m, glow: glowMat };
  }, [n]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      glow.dispose();
    },
    [geometry, material, glow],
  );

  useFrame(() => {
    const w = useWorld.getState();
    if (!w.paused) time.current += frame.delta * Math.min(w.timeScale, 5) * 0.4;
    material.uniforms.uTime.value = time.current;
    material.uniforms.uPixelRatio.value = dpr;
    const p = centerId ? frame.positions.get(centerId) : null;
    if (group.current && p) group.current.position.copy(p);
  });

  return (
    <group ref={group} rotation={[0.08, 0, 0.05]}>
      <points geometry={geometry} material={material} frustumCulled={false} renderOrder={-2} />
      <mesh geometry={unitQuad()} material={glow} frustumCulled={false} renderOrder={-2} />
    </group>
  );
}
