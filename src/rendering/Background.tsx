import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BRIGHT_STARS_FRAGMENT,
  BRIGHT_STARS_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  SKY_BAKE_FRAGMENT,
  SKY_BAKE_VERTEX,
  SKY_STARS_FRAGMENT,
  SKY_STARS_VERTEX,
} from '../shaders/space';
import { useSettings } from '../stores/settingsStore';
import { QUALITY } from './quality';
import { skyRef } from './registry';
import { blackbodyRGB } from '../utils/color';
import { mulberry32 } from '../utils/random';
import { frame } from './frameState';

const BAND_NORMAL = new THREE.Vector3(0.32, 0.88, 0.35).normalize();
const CORE_DIR = new THREE.Vector3(0.85, -0.25, -0.46).normalize();

/** Picks a star colour from a rough stellar population (mostly orange/yellow-white, a few blue). */
function starColor(rng: () => number): [number, number, number] {
  const r = rng();
  const t = r < 0.12 ? 3200 + rng() * 800 : r < 0.55 ? 4200 + rng() * 1600 : r < 0.88 ? 5800 + rng() * 2400 : 8500 + rng() * 14000;
  return blackbodyRGB(t);
}

function randomDirection(rng: () => number, bandBias: number): THREE.Vector3 {
  const v = new THREE.Vector3();
  for (let tries = 0; tries < 8; tries++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    v.set(s * Math.cos(th), u, s * Math.sin(th));
    const h = v.dot(BAND_NORMAL);
    const w = (1 - bandBias) + bandBias * Math.exp(-(h * h) / (2 * 0.12 * 0.12));
    if (rng() < w) break;
  }
  return v;
}

/** Bakes nebulae, the galactic band and the faint star field into a cubemap (once per quality level). */
function bakeSky(renderer: THREE.WebGLRenderer, faceSize: number, starCount: number): THREE.WebGLCubeRenderTarget {
  const target = new THREE.WebGLCubeRenderTarget(faceSize, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const scene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_BAKE_VERTEX,
    fragmentShader: SKY_BAKE_FRAGMENT,
    uniforms: { uSeed: { value: 4.7 }, uBandNormal: { value: BAND_NORMAL }, uCoreDir: { value: CORE_DIR } },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sphereGeo = new THREE.SphereGeometry(100, 96, 64);
  scene.add(new THREE.Mesh(sphereGeo, skyMat));

  const rng = mulberry32(9001);
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const sizeScale = faceSize / 1024;
  for (let i = 0; i < starCount; i++) {
    const d = randomDirection(rng, 0.55).multiplyScalar(90);
    positions.set([d.x, d.y, d.z], i * 3);
    const c = starColor(rng);
    const mag = Math.pow(rng(), 7); // most stars faint, a few bright
    const b = 0.05 + mag * 1.5;
    colors.set([Math.pow(c[0], 2.2) * b, Math.pow(c[1], 2.2) * b, Math.pow(c[2], 2.2) * b], i * 3);
    sizes[i] = Math.max(1, (1.0 + mag * 1.6) * sizeScale);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: SKY_STARS_VERTEX,
    fragmentShader: SKY_STARS_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  scene.add(new THREE.Points(starGeo, starMat));

  const cubeCamera = new THREE.CubeCamera(1, 1000, target);
  const prevTarget = renderer.getRenderTarget();
  const prevToneMapping = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubeCamera.update(renderer, scene);
  renderer.toneMapping = prevToneMapping;
  renderer.setRenderTarget(prevTarget);

  sphereGeo.dispose();
  skyMat.dispose();
  starGeo.dispose();
  starMat.dispose();
  return target;
}

export function Background() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const dpr = useThree((s) => s.viewport.dpr);
  const quality = useSettings((s) => s.quality);
  const reduced = useSettings((s) => s.reducedEffects);
  const profile = QUALITY[quality];
  const brightRef = useRef<THREE.Points>(null);
  const dustRef = useRef<THREE.Points>(null);

  const sky = useMemo(() => bakeSky(gl, profile.skyFace, profile.skyStars), [gl, profile.skyFace, profile.skyStars]);
  useEffect(() => {
    scene.background = sky.texture;
    scene.backgroundIntensity = 1;
    skyRef.texture = sky.texture;
    return () => {
      if (scene.background === sky.texture) scene.background = null;
      skyRef.texture = null;
      sky.dispose();
    };
  }, [scene, sky]);

  const bright = useMemo(() => {
    const n = profile.brightStars;
    const rng = mulberry32(31337);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const spike = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = randomDirection(rng, 0.35).multiplyScalar(50000);
      pos.set([d.x, d.y, d.z], i * 3);
      const c = starColor(rng);
      const m = Math.pow(rng(), 5);
      const isSpike = rng() < 0.006;
      const b = isSpike ? 2.2 + rng() * 1.5 : 0.18 + m * 1.6;
      col.set([Math.pow(c[0], 2.2) * b, Math.pow(c[1], 2.2) * b, Math.pow(c[2], 2.2) * b], i * 3);
      size[i] = isSpike ? 1.6 + rng() * 0.8 : 0.8 + m * 1.1;
      phase[i] = rng();
      spike[i] = isSpike ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    g.setAttribute('aSpike', new THREE.BufferAttribute(spike, 1));
    const m = new THREE.ShaderMaterial({
      vertexShader: BRIGHT_STARS_VERTEX,
      fragmentShader: BRIGHT_STARS_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { g, m };
  }, [profile.brightStars]);

  const dust = useMemo(() => {
    const n = profile.dust;
    if (n === 0) return null;
    const rng = mulberry32(777);
    const seeds = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) seeds[i] = rng();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    const m = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: { uBox: { value: 100 }, uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { g, m };
  }, [profile.dust]);

  useEffect(
    () => () => {
      bright.g.dispose();
      bright.m.dispose();
    },
    [bright],
  );
  useEffect(
    () => () => {
      dust?.g.dispose();
      dust?.m.dispose();
    },
    [dust],
  );

  useFrame((state) => {
    if (brightRef.current) {
      brightRef.current.position.copy(camera.position);
      bright.m.uniforms.uTime.value = frame.time;
      bright.m.uniforms.uPixelRatio.value = dpr;
    }
    if (dust && dustRef.current) {
      dustRef.current.visible = !reduced;
      // Dust volume scales with how far the camera sits from what it looks at.
      const controls = state.controls as unknown as { target?: THREE.Vector3 } | null;
      const d = controls?.target ? camera.position.distanceTo(controls.target) : 100;
      dust.m.uniforms.uBox.value = THREE.MathUtils.clamp(d * 2.2, 0.05, 6000);
      dust.m.uniforms.uTime.value = frame.time;
      dust.m.uniforms.uPixelRatio.value = dpr;
    }
  });

  return (
    <>
      <points ref={brightRef} geometry={bright.g} material={bright.m} frustumCulled={false} renderOrder={-10} />
      {dust && <points ref={dustRef} geometry={dust.g} material={dust.m} frustumCulled={false} renderOrder={-9} />}
    </>
  );
}
