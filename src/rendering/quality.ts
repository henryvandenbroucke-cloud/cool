export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  label: string;
  /** Upper bound for the renderer's device-pixel-ratio. */
  maxPixelRatio: number;
  /** Equirectangular planet texture width (height = width / 2). */
  planetTexture: number;
  sphereSegments: number;
  skyFace: number;
  skyStars: number;
  brightStars: number;
  dust: number;
  debrisParticles: number;
  diskParticles: number;
  galaxyParticles: number;
  bloom: boolean;
  bloomLevels: number;
  smaa: boolean;
  lensing: boolean;
  trailPoints: number;
}

export const QUALITY: Record<GraphicsQuality, QualityProfile> = {
  low: {
    label: 'Low',
    maxPixelRatio: 1,
    planetTexture: 1024,
    sphereSegments: 40,
    skyFace: 512,
    skyStars: 10000,
    brightStars: 900,
    dust: 0,
    debrisParticles: 4000,
    diskParticles: 1500,
    galaxyParticles: 30000,
    bloom: false,
    bloomLevels: 4,
    smaa: false,
    lensing: false,
    trailPoints: 160,
  },
  medium: {
    label: 'Medium',
    maxPixelRatio: 1.25,
    planetTexture: 1024,
    sphereSegments: 64,
    skyFace: 1024,
    skyStars: 20000,
    brightStars: 1200,
    dust: 500,
    debrisParticles: 9000,
    diskParticles: 4000,
    galaxyParticles: 60000,
    bloom: true,
    bloomLevels: 5,
    smaa: false,
    lensing: true,
    trailPoints: 240,
  },
  high: {
    label: 'High',
    maxPixelRatio: 1.75,
    planetTexture: 2048,
    sphereSegments: 96,
    skyFace: 1536,
    skyStars: 32000,
    brightStars: 2200,
    dust: 1000,
    debrisParticles: 16000,
    diskParticles: 8000,
    galaxyParticles: 100000,
    bloom: true,
    bloomLevels: 7,
    smaa: true,
    lensing: true,
    trailPoints: 320,
  },
  ultra: {
    label: 'Ultra',
    maxPixelRatio: 2,
    planetTexture: 2048,
    sphereSegments: 128,
    skyFace: 2048,
    skyStars: 48000,
    brightStars: 3500,
    dust: 1600,
    debrisParticles: 26000,
    diskParticles: 14000,
    galaxyParticles: 160000,
    bloom: true,
    bloomLevels: 8,
    smaa: true,
    lensing: true,
    trailPoints: 480,
  },
};
