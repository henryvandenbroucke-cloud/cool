import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type BloomEffect } from 'postprocessing';
import { useSettings } from '../stores/settingsStore';
import { QUALITY } from './quality';
import { frame } from './frameState';
import { BlackHoleShadowEffect, MAX_OCCLUDERS, MAX_SHADOWS } from './BlackHoleShadowEffect';
import { DISK_INNER, DISK_OUTER } from './bodies/BlackHoleBody';
import { engine } from '../stores/worldStore';
import { overlay } from './overlay';

const DEG = Math.PI / 180;
const tmpC = new THREE.Vector3();

/**
 * HDR post chain: bloom on emissive highlights (stars, disks, impacts),
 * filmic tone mapping, a gentle vignette and fine grain (which also dithers
 * away banding in the dark sky gradients).
 */
export function PostFX() {
  const quality = useSettings((s) => s.quality);
  const reduced = useSettings((s) => s.reducedEffects);
  const profile = QUALITY[quality];
  const bloom = useRef<BloomEffect>(null);
  const baseIntensity = 0.8;

  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const shadow = useMemo(() => new BlackHoleShadowEffect(), []);

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = baseIntensity + Math.min(2.2, frame.bloomBoost);
    // Feed black-hole shadows (view space) and any bodies in front of them to the shadow effect.
    const u = shadow.uniforms;
    const holes = frame.blackHoles.slice(0, MAX_SHADOWS);
    u.get('uCount')!.value = holes.length;
    if (!holes.length) return;
    camera.updateMatrixWorld();
    (u.get('uProjInv')!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (u.get('uViewport')!.value as THREE.Vector2).set(size.width, size.height);
    const occ = u.get('uOcc')!.value as THREE.Vector4[];
    let nOcc = 0;
    holes.forEach((h, i) => {
      (u.get('uCenter')!.value as THREE.Vector3[])[i].copy(h.position).applyMatrix4(camera.matrixWorldInverse);
      (u.get('uRadius')!.value as number[])[i] = h.radius;
      const b = engine.getBody(h.id);
      const tilt = (b?.axialTilt ?? 0) * DEG;
      (u.get('uNormal')!.value as THREE.Vector3[])[i].set(0, Math.cos(tilt), Math.sin(tilt)).transformDirection(camera.matrixWorldInverse);
      (u.get('uDisk')!.value as THREE.Vector2[])[i].set(DISK_INNER, DISK_OUTER);
      const he = overlay.entries.get(h.id);
      const holeDist = camera.position.distanceTo(h.position);
      if (!he) return;
      for (const body of engine.bodies) {
        if (nOcc >= MAX_OCCLUDERS) break;
        if (body.kind === 'blackHole') continue;
        const e = overlay.entries.get(body.id);
        const p = frame.positions.get(body.id);
        if (!e || !e.visible || !p) continue;
        if (Math.hypot(e.x - he.x, e.y - he.y) > he.r + e.r + 2) continue;
        const d = tmpC.copy(p).distanceTo(camera.position) - (frame.radii.get(body.id) ?? 0);
        if (d >= holeDist) continue;
        occ[nOcc++].set(e.x, size.height - e.y, e.r + 1.5, d);
      }
    });
    u.get('uOccCount')!.value = nOcc;
  });

  const useBloom = profile.bloom && !reduced;
  const samples = quality === 'low' ? 0 : quality === 'ultra' ? 8 : 4;
  const tail = [
    <primitive key="bh-shadow" object={shadow} />,
    <ToneMapping key="tm" mode={ToneMappingMode.AGX} />,
    <Vignette key="vig" offset={0.28} darkness={0.62} eskil={false} />,
    <Noise key="grain" premultiply blendFunction={BlendFunction.SCREEN} opacity={0.035} />,
  ];
  // Separate composers (by key) rather than conditional children keeps the effect chain stable.
  return useBloom ? (
    <EffectComposer key={`bloom-${samples}-${profile.bloomLevels}`} multisampling={samples} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur levels={profile.bloomLevels} intensity={baseIntensity} luminanceThreshold={0.9} luminanceSmoothing={0.3} radius={0.62} />
      {tail}
    </EffectComposer>
  ) : (
    <EffectComposer key={`plain-${samples}`} multisampling={samples} enableNormalPass={false}>
      {tail}
    </EffectComposer>
  );
}
