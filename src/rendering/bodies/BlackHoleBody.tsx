import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimBody } from '../../simulation/body';
import { DISK_FRAGMENT, DISK_VERTEX, HALO_FRAGMENT, INFALL_FRAGMENT, INFALL_VERTEX, LENS_FRAGMENT, LENS_VERTEX } from '../../shaders/blackHole';
import { BILLBOARD_VERTEX, GLOW_FRAGMENT } from '../../shaders/star';
import { frame } from '../frameState';
import { ringGeometry, unitQuad, unitSphere } from '../geometries';
import { QUALITY } from '../quality';
import { useSettings } from '../../stores/settingsStore';
import { flares, skyRef, surfaceMeshes } from '../registry';
import { mulberry32 } from '../../utils/random';

const DEG = Math.PI / 180;
export const DISK_INNER = 1.55;
export const DISK_OUTER = 7.5;
const tmpQ = new THREE.Quaternion();
const tmpN = new THREE.Vector3();

export function BlackHoleBody({ body }: { body: SimBody; version: number }) {
  const quality = useSettings((s) => s.quality);
  const reduced = useSettings((s) => s.reducedEffects);
  const profile = QUALITY[quality];
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const group = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const disk = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const lens = useRef<THREE.Mesh>(null);
  const particles = useRef<THREE.Points>(null);
  const spin = body.rotationPeriod < 0 ? -1 : 1;

  const mats = useMemo(() => {
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const diskMat = new THREE.ShaderMaterial({
      vertexShader: DISK_VERTEX,
      fragmentShader: DISK_FRAGMENT,
      uniforms: {
        uSpin: { value: spin },
        uInner: { value: DISK_INNER },
        uOuter: { value: DISK_OUTER },
        uHole: { value: 1 },
        uTime: { value: 0 },
        uIntensity: { value: 2.3 },
        uBeta: { value: 0.45 },
        uFlare: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      uniforms: {
        uSize: { value: 1 },
        uRatio: { value: 2.8 },
        uNormalView: { value: new THREE.Vector3(0, 1, 0) },
        uTime: { value: 0 },
        uIntensity: { value: 1.15 },
        uFlare: { value: 0 },
        uSpin: { value: spin },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowMat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      uniforms: {
        uSize: { value: 1 },
        uColor: { value: new THREE.Vector3(1.0, 0.42, 0.12) },
        uIntensity: { value: 0.16 },
        uFalloff: { value: 5.5 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lensMat = new THREE.ShaderMaterial({
      vertexShader: LENS_VERTEX,
      fragmentShader: LENS_FRAGMENT,
      uniforms: {
        uSize: { value: 1 },
        uSky: { value: null },
        uHoleRadius: { value: 1 },
        uStrength: { value: 1.35 },
      },
      transparent: true,
      depthWrite: false,
    });
    const infallMat = new THREE.ShaderMaterial({
      vertexShader: INFALL_VERTEX,
      fragmentShader: INFALL_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uHole: { value: 1 },
        uScale: { value: 1 },
        uSpin: { value: spin },
        uIntensity: { value: 0.8 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { shadowMat, diskMat, haloMat, glowMat, lensMat, infallMat };
  }, [spin]);

  const infallGeometry = useMemo(() => {
    const n = Math.round(profile.diskParticles * 0.4);
    const rng = mulberry32(body.appearance.seed + 3);
    const params = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      params[i * 4] = DISK_INNER + Math.pow(rng(), 0.7) * (DISK_OUTER - DISK_INNER) * 1.1;
      params[i * 4 + 1] = rng() * Math.PI * 2;
      params[i * 4 + 2] = 6 + rng() * 14;
      params[i * 4 + 3] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aParams', new THREE.BufferAttribute(params, 4));
    return g;
  }, [profile.diskParticles, body.appearance.seed]);

  useEffect(
    () => () => {
      Object.values(mats).forEach((m) => m.dispose());
    },
    [mats],
  );
  useEffect(() => () => infallGeometry.dispose(), [infallGeometry]);

  useEffect(() => {
    if (shadow.current) surfaceMeshes.set(body.id, shadow.current);
    return () => {
      surfaceMeshes.delete(body.id);
    };
  }, [body.id]);

  useFrame(() => {
    const pos = frame.positions.get(body.id);
    const r = frame.radii.get(body.id);
    if (!pos || r === undefined || !group.current || !tilt.current) return;
    group.current.position.copy(pos);
    tilt.current.rotation.set(body.axialTilt * DEG, 0, 0);
    const t = frame.time;
    const flare = Math.max(0, (flares.get(body.id) ?? 0) - frame.delta * 0.6);
    flares.set(body.id, flare);

    shadow.current?.scale.setScalar(r);
    if (disk.current) disk.current.scale.setScalar(r);
    const du = mats.diskMat.uniforms;
    du.uTime.value = t * 0.35;
    du.uFlare.value = flare;

    tilt.current.getWorldQuaternion(tmpQ);
    tmpN.set(0, 1, 0).applyQuaternion(tmpQ).transformDirection(camera.matrixWorldInverse);
    const hu = mats.haloMat.uniforms;
    hu.uSize.value = r * 2.8;
    hu.uNormalView.value.copy(tmpN);
    hu.uTime.value = t * 0.35;
    hu.uFlare.value = flare;

    const dist = camera.position.distanceTo(pos);
    const glowSize = Math.max(r * 16, dist * 0.04);
    mats.glowMat.uniforms.uSize.value = glowSize;
    mats.glowMat.uniforms.uIntensity.value = 0.16 + flare * 0.8;

    if (lens.current) {
      const sky = skyRef.texture;
      lens.current.visible = Boolean(sky) && profile.lensing && !reduced;
      mats.lensMat.uniforms.uSky.value = sky;
      mats.lensMat.uniforms.uSize.value = r * 9;
      mats.lensMat.uniforms.uHoleRadius.value = r;
    }

    const iu = mats.infallMat.uniforms;
    iu.uTime.value = t;
    iu.uHole.value = r;
    iu.uScale.value = size.height * dpr * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5] * 0.035;
    iu.uIntensity.value = 0.75 + flare * 2;
    if (particles.current) particles.current.visible = !reduced;
  });

  return (
    <group ref={group}>
      <mesh ref={lens} geometry={unitQuad()} material={mats.lensMat} renderOrder={-5} frustumCulled={false} />
      <mesh ref={shadow} geometry={unitSphere(64)} material={mats.shadowMat} />
      <group ref={tilt}>
        <mesh ref={disk} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeometry(DISK_INNER, DISK_OUTER, 256)} material={mats.diskMat} renderOrder={4} />
        <points ref={particles} geometry={infallGeometry} material={mats.infallMat} renderOrder={5} frustumCulled={false} />
      </group>
      <mesh ref={halo} geometry={unitQuad()} material={mats.haloMat} renderOrder={6} frustumCulled={false} />
      <mesh ref={glow} geometry={unitQuad()} material={mats.glowMat} renderOrder={6} frustumCulled={false} />
    </group>
  );
}
