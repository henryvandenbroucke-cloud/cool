import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimBody } from '../../simulation/body';
import { SIMPLE_VERTEX } from '../../shaders/planet';
import { BILLBOARD_VERTEX, CORONA_FRAGMENT, GLOW_FRAGMENT, STAR_FRAGMENT } from '../../shaders/star';
import { frame, updateSpin } from '../frameState';
import { unitQuad, unitSphere } from '../geometries';
import { QUALITY } from '../quality';
import { useSettings } from '../../stores/settingsStore';
import { useWorld } from '../../stores/worldStore';
import { blackbodyRGB } from '../../utils/color';
import { surfaceMeshes } from '../registry';

export function StarBody({ body, version }: { body: SimBody; version: number }) {
  const quality = useSettings((s) => s.quality);
  const profile = QUALITY[quality];
  const camera = useThree((s) => s.camera);
  const group = useRef<THREE.Group>(null);
  const sphere = useRef<THREE.Mesh>(null);
  const corona = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);

  const mats = useMemo(() => {
    const surface = new THREE.ShaderMaterial({
      vertexShader: SIMPLE_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        uColor: { value: new THREE.Vector3() },
        uHot: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uIntensity: { value: 4 },
        uSeed: { value: 0 },
      },
    });
    const coronaMat = new THREE.ShaderMaterial({
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: CORONA_FRAGMENT,
      uniforms: {
        uSize: { value: 1 },
        uColor: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uIntensity: { value: 2 },
        uRatio: { value: 6 },
        uSeed: { value: 0 },
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
        uColor: { value: new THREE.Vector3() },
        uIntensity: { value: 0.5 },
        uFalloff: { value: 6 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });
    return { surface, coronaMat, glowMat };
  }, []);

  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  useEffect(() => {
    const t = body.appearance.temperature || 5778;
    const c = blackbodyRGB(t);
    const lin = c.map((v) => Math.pow(v, 2.2)) as [number, number, number];
    const max = Math.max(...lin);
    const color = lin.map((v) => v / max) as [number, number, number];
    const hot = blackbodyRGB(t * 1.35).map((v) => Math.pow(v, 2.2)) as [number, number, number];
    const hmax = Math.max(...hot);
    mats.surface.uniforms.uColor.value.set(...color);
    mats.surface.uniforms.uHot.value.set(hot[0] / hmax, hot[1] / hmax, hot[2] / hmax);
    mats.surface.uniforms.uSeed.value = (body.appearance.seed % 100) * 0.37;
    // HDR so bloom picks stars up; hotter / more luminous stars burn brighter.
    const lum = Math.max(body.luminosity, 0.005);
    mats.surface.uniforms.uIntensity.value = 2.4 + Math.min(4, Math.pow(lum, 0.25) * 1.8);
    mats.coronaMat.uniforms.uColor.value.set(...color);
    mats.coronaMat.uniforms.uIntensity.value = 0.9 + Math.min(1.5, Math.pow(lum, 0.2) * 0.6);
    mats.coronaMat.uniforms.uSeed.value = (body.appearance.seed % 50) * 0.71;
    mats.glowMat.uniforms.uColor.value.set(...color);
  }, [version, body, mats]);

  useEffect(() => {
    if (sphere.current) surfaceMeshes.set(body.id, sphere.current);
    return () => {
      surfaceMeshes.delete(body.id);
    };
  }, [body.id]);

  useFrame(() => {
    const pos = frame.positions.get(body.id);
    const r = frame.radii.get(body.id);
    if (!pos || r === undefined || !group.current || !sphere.current) return;
    group.current.position.copy(pos);
    const world = useWorld.getState();
    sphere.current.rotation.y = updateSpin(body, world.timeScale, frame.delta, world.paused);
    sphere.current.scale.setScalar(r);
    mats.surface.uniforms.uTime.value = frame.time;
    const giant = r > 0 && body.radius > 0.03;
    const ratio = giant ? 3.2 : 6.5;
    mats.coronaMat.uniforms.uSize.value = r * ratio;
    mats.coronaMat.uniforms.uRatio.value = ratio;
    mats.coronaMat.uniforms.uTime.value = frame.time;
    // A far glow that never shrinks below a few pixels, so distant stars still read as stars.
    const dist = camera.position.distanceTo(pos);
    const minSize = dist * 0.035;
    const size = Math.max(r * 26, minSize);
    mats.glowMat.uniforms.uSize.value = size;
    const lum = Math.max(body.luminosity, 0.005);
    mats.glowMat.uniforms.uIntensity.value = (0.35 + Math.min(0.6, Math.pow(lum, 0.2) * 0.25)) * (size === minSize ? 1.4 : 1);
    mats.glowMat.uniforms.uFalloff.value = size === minSize ? 9 : 7;
  });

  return (
    <group ref={group}>
      <mesh ref={sphere} geometry={unitSphere(Math.max(48, profile.sphereSegments))} material={mats.surface} />
      <mesh ref={corona} geometry={unitQuad()} material={mats.coronaMat} renderOrder={3} frustumCulled={false} />
      <mesh ref={glow} geometry={unitQuad()} material={mats.glowMat} renderOrder={3} frustumCulled={false} />
    </group>
  );
}
