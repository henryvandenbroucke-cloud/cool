import * as THREE from 'three';

/** Object3D handles for bodies (the spinning surface mesh), used by VFX to map impacts into body space. */
export const surfaceMeshes = new Map<string, THREE.Object3D>();

/** Impact direction per body in its local (surface) frame, for the molten-crust glow. */
export const impactDirs = new Map<string, THREE.Vector3>();

/** Temporary photon-ring flare per black hole (0..1), decays in the black-hole visual. */
export const flares = new Map<string, number>();

/** The baked sky cubemap, once available (used by the lensing billboard). */
export const skyRef: { texture: THREE.CubeTexture | THREE.Texture | null } = { texture: null };
