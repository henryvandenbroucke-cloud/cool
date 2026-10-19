import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SimBody } from '../../simulation/body';
import { ATMOSPHERE_FRAGMENT, PLANET_FRAGMENT, PLANET_VERTEX, SIMPLE_VERTEX } from '../../shaders/planet';
import { RING_FRAGMENT, RING_VERTEX } from '../../shaders/star';
import { STYLE_CODE } from '../../shaders/planetBake';
import { lightUniforms } from '../lighting';
import { frame, updateSpin } from '../frameState';
import { getBaker, PlanetTextureBaker } from '../textureBaker';
import { ringGeometry, unitSphere } from '../geometries';
import { QUALITY } from '../quality';
import { useSettings } from '../../stores/settingsStore';
import { useWorld } from '../../stores/worldStore';
import { impactDirs, impactSizes, surfaceMeshes } from '../registry';
import { hexToLinear } from '../../utils/color';

const DEG = Math.PI / 180;
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export function PlanetBody({ body, version }: { body: SimBody; version: number }) {
  const gl = useThree((s) => s.gl);
  const quality = useSettings((s) => s.quality);
  const profile = QUALITY[quality];
  const outer = useRef<THREE.Group>(null);
  const tilt = useRef<THREE.Group>(null);
  const surface = useRef<THREE.Mesh>(null);
  const atmo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const bumpFactor = useRef(0);

  const a = body.appearance;
  const texSize = body.kind === 'moon' || body.kind === 'asteroid' ? Math.max(512, profile.planetTexture / 2) : profile.planetTexture;
  const key = PlanetTextureBaker.key(a, texSize);
  const baked = useMemo(() => getBaker(gl).acquire(body.appearance, texSize), [gl, key]);
  useEffect(() => {
    const app = { ...body.appearance };
    return () => getBaker(gl).release(app, texSize);
  }, [gl, key]);

  const isGas = body.kind === 'gasGiant';
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: PLANET_VERTEX,
        fragmentShader: PLANET_FRAGMENT,
        uniforms: {
          ...lightUniforms,
          uMapA: { value: null },
          uMapB: { value: null },
          uStyle: { value: 0 },
          uTime: { value: 0 },
          uFlow: { value: 0 },
          uCloudShift: { value: 0 },
          uAtmoColor: { value: new THREE.Vector3(0.4, 0.6, 1) },
          uAtmoDensity: { value: 0 },
          uCity: { value: 0 },
          uLava: { value: 0 },
          uHeat: { value: 0 },
          uImpactDir: { value: new THREE.Vector3(0, 1, 0) },
          uBump: { value: 0 },
          uDetail: { value: 1 },
          uImpactSize: { value: 0.6 },
          uHasRings: { value: 0 },
          uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
          uCenter: { value: new THREE.Vector3() },
          uRingRadii: { value: new THREE.Vector2(1, 2) },
          uRingOpacity: { value: 0 },
        },
      }),
    [],
  );
  const atmoMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SIMPLE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms: {
          ...lightUniforms,
          uAtmoColor: { value: new THREE.Vector3() },
          uAtmoDensity: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uInner: { value: 1 },
          uOuter: { value: 1.1 },
        },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const ringMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms: {
          ...lightUniforms,
          uColor: { value: new THREE.Vector3(1, 1, 1) },
          uOpacity: { value: 0.8 },
          uInner: { value: 1.2 },
          uOuter: { value: 2.3 },
          uSeed: { value: 0 },
          uCenter: { value: new THREE.Vector3() },
          uPlanetRadius: { value: 1 },
          uNormal: { value: new THREE.Vector3(0, 1, 0) },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  useEffect(
    () => () => {
      material.dispose();
      atmoMaterial.dispose();
      ringMaterial.dispose();
    },
    [material, atmoMaterial, ringMaterial],
  );

  // Sync appearance-driven uniforms when the body is edited.
  useEffect(() => {
    const u = material.uniforms;
    u.uMapA.value = baked.mapA;
    u.uMapB.value = baked.mapB;
    u.uStyle.value = STYLE_CODE[a.style] ?? 2;
    u.uFlow.value = isGas ? 0.0025 : 0;
    u.uAtmoColor.value.set(...hexToLinear(a.atmosphereColor ?? '#000000'));
    u.uAtmoDensity.value = a.atmosphereColor ? a.atmosphereDensity : 0;
    u.uCity.value = a.cityLights ? 1 : 0;
    u.uLava.value = a.style === 'volcanic' ? 1 : 0;
    // Bump height is relative to the body radius (applied per frame).
    bumpFactor.current = isGas || a.style === 'venus' ? 0 : a.style === 'terran' ? 0.006 : a.style === 'moon' || a.style === 'mercury' ? 0.009 : 0.008;
    const au = atmoMaterial.uniforms;
    au.uAtmoColor.value.set(...hexToLinear(a.atmosphereColor ?? '#000000'));
    au.uAtmoDensity.value = a.atmosphereColor ? a.atmosphereDensity : 0;
    if (a.rings) {
      const ru = ringMaterial.uniforms;
      ru.uColor.value.set(...hexToLinear(a.rings.color));
      ru.uOpacity.value = a.rings.opacity;
      ru.uInner.value = a.rings.inner;
      ru.uOuter.value = a.rings.outer;
      ru.uSeed.value = (a.seed % 97) * 1.37;
      u.uHasRings.value = 1;
      u.uRingOpacity.value = a.rings.opacity;
    } else {
      u.uHasRings.value = 0;
    }
  }, [version, baked, material, atmoMaterial, ringMaterial, a, isGas]);

  useEffect(() => {
    if (surface.current) surfaceMeshes.set(body.id, surface.current);
    return () => {
      surfaceMeshes.delete(body.id);
    };
  }, [body.id]);

  const atmoScale = a.atmosphereColor ? 1 + (isGas ? 0.024 : 0.016 + 0.032 * a.atmosphereDensity) : 0;

  useFrame(() => {
    const pos = frame.positions.get(body.id);
    const r = frame.radii.get(body.id);
    if (!pos || r === undefined || !outer.current || !tilt.current || !surface.current) return;
    outer.current.position.copy(pos);
    tilt.current.rotation.set(0, 0, body.axialTilt * DEG);
    const world = useWorld.getState();
    const spin = updateSpin(body, world.timeScale, frame.delta, world.paused);
    surface.current.rotation.y = spin;
    surface.current.scale.setScalar(r);
    const u = material.uniforms;
    u.uTime.value = frame.time;
    u.uCloudShift.value = (spin * 0.012) % 1;
    if (body.heat > 0) body.heat = Math.max(0, body.heat - frame.delta * 0.05);
    u.uHeat.value = body.heat;
    const dir = impactDirs.get(body.id);
    if (dir) u.uImpactDir.value.copy(dir);
    u.uImpactSize.value = impactSizes.get(body.id) ?? 0.6;
    u.uBump.value = bumpFactor.current * r;
    u.uCenter.value.copy(pos);
    u.uDetail.value = 1;
    if (atmo.current) {
      atmo.current.scale.setScalar(r * atmoScale);
      atmoMaterial.uniforms.uCenter.value.copy(pos);
      atmoMaterial.uniforms.uInner.value = r;
      atmoMaterial.uniforms.uOuter.value = r * atmoScale;
    }
    if (ring.current && a.rings) {
      ring.current.scale.setScalar(r);
      const ru = ringMaterial.uniforms;
      ru.uCenter.value.copy(pos);
      ru.uPlanetRadius.value = r;
      tilt.current.getWorldQuaternion(tmpQ);
      tmpV.set(0, 1, 0).applyQuaternion(tmpQ);
      ru.uNormal.value.copy(tmpV);
      u.uRingNormal.value.copy(tmpV);
      u.uRingRadii.value.set(a.rings.inner * r, a.rings.outer * r);
    }
  });

  return (
    <group ref={outer}>
      <group ref={tilt}>
        <mesh ref={surface} geometry={unitSphere(profile.sphereSegments)} material={material} />
        {a.rings && (
          <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeometry(a.rings.inner, a.rings.outer, 192)} material={ringMaterial} renderOrder={2} />
        )}
      </group>
      {a.atmosphereColor && <mesh ref={atmo} geometry={unitSphere(Math.max(48, profile.sphereSegments / 2))} material={atmoMaterial} renderOrder={1} />}
    </group>
  );
}
