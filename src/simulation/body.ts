import type { Appearance, BodyData, BodyKind, SizeScale } from './types';

/**
 * Mutable runtime body. Kept as flat numeric fields so the integrator never
 * allocates inside its inner loops.
 */
export class SimBody {
  id: string;
  name: string;
  kind: BodyKind;
  type: string;
  mass: number;
  radius: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ax = 0;
  ay = 0;
  az = 0;
  /** Position at the start of the last fixed step (render extrapolation only). */
  px: number;
  py: number;
  pz: number;
  rotationPeriod: number;
  axialTilt: number;
  luminosity: number;
  appearance: Appearance;
  /** Visual-only: 0..1 molten glow after impacts, decays over time. */
  heat = 0;
  /** Simulation time before which collisions are ignored (freshly spawned fragments). */
  collisionGraceUntil = 0;
  alive = true;

  constructor(data: BodyData) {
    this.id = data.id;
    this.name = data.name;
    this.kind = data.kind;
    this.type = data.type;
    this.mass = data.mass;
    this.radius = data.radius;
    this.x = data.position.x;
    this.y = data.position.y;
    this.z = data.position.z;
    this.vx = data.velocity.x;
    this.vy = data.velocity.y;
    this.vz = data.velocity.z;
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.rotationPeriod = data.rotationPeriod;
    this.axialTilt = data.axialTilt;
    this.luminosity = data.luminosity;
    this.appearance = cloneAppearance(data.appearance);
  }

  toData(): BodyData {
    return {
      id: this.id,
      name: this.name,
      kind: this.kind,
      type: this.type,
      mass: this.mass,
      radius: this.radius,
      position: { x: this.x, y: this.y, z: this.z },
      velocity: { x: this.vx, y: this.vy, z: this.vz },
      rotationPeriod: this.rotationPeriod,
      axialTilt: this.axialTilt,
      luminosity: this.luminosity,
      appearance: cloneAppearance(this.appearance),
    };
  }
}

export function cloneAppearance(a: Appearance): Appearance {
  return {
    ...a,
    colors: [a.colors[0], a.colors[1], a.colors[2]],
    rings: a.rings ? { ...a.rings } : null,
  };
}

export function cloneBodyData(b: BodyData): BodyData {
  return {
    ...b,
    position: { ...b.position },
    velocity: { ...b.velocity },
    appearance: cloneAppearance(b.appearance),
  };
}

/** Size exaggeration factor for a body kind. Black-hole radii are already stylised. */
export function sizeFactor(kind: BodyKind, scale: SizeScale): number {
  if (kind === 'blackHole') return 1;
  if (kind === 'star') return scale.stars;
  return scale.bodies;
}

/** Radius used for both collisions and rendering (AU). */
export function effectiveRadius(body: { kind: BodyKind; radius: number }, scale: SizeScale): number {
  return body.radius * sizeFactor(body.kind, scale);
}
