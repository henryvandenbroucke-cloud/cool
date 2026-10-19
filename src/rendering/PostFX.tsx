import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode, type BloomEffect } from 'postprocessing';
import { useSettings } from '../stores/settingsStore';
import { QUALITY } from './quality';
import { frame } from './frameState';

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

  useFrame(() => {
    if (bloom.current) bloom.current.intensity = baseIntensity + Math.min(2.2, frame.bloomBoost);
  });

  const useBloom = profile.bloom && !reduced;
  const samples = quality === 'low' ? 0 : quality === 'ultra' ? 8 : 4;
  const tail = [
    <ToneMapping key="tm" mode={ToneMappingMode.AGX} />,
    <Vignette key="vig" offset={0.28} darkness={0.62} eskil={false} />,
    <Noise key="grain" premultiply blendFunction={BlendFunction.SCREEN} opacity={0.035} />,
  ];
  // Separate composers (by key) rather than conditional children keeps the effect chain stable.
  return useBloom ? (
    <EffectComposer key={`bloom-${samples}-${profile.bloomLevels}`} multisampling={samples} enableNormalPass={false}>
      <Bloom ref={bloom} mipmapBlur levels={profile.bloomLevels} intensity={baseIntensity} luminanceThreshold={0.9} luminanceSmoothing={0.3} radius={0.62} />
      {tail[0]}
      {tail[1]}
      {tail[2]}
    </EffectComposer>
  ) : (
    <EffectComposer key={`plain-${samples}`} multisampling={samples} enableNormalPass={false}>
      {tail[0]}
      {tail[1]}
      {tail[2]}
    </EffectComposer>
  );
}
