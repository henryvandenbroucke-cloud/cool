export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Physical role of a body. Drives lighting, absorption and collision rules. */
export type BodyKind = 'star' | 'rocky' | 'gasGiant' | 'moon' | 'asteroid' | 'comet' | 'blackHole';

/** Procedural surface family used by the renderer. */
export type SurfaceStyle =
  | 'terran'
  | 'mars'
  | 'mercury'
  | 'venus'
  | 'volcanic'
  | 'ice'
  | 'desert'
  | 'moon'
  | 'jupiter'
  | 'saturn'
  | 'neptune'
  | 'gas'
  | 'asteroid'
  | 'comet'
  | 'star'
  | 'blackHole';

export interface RingSpec {
  /** Inner and outer radius in multiples of the body radius. */
  inner: number;
  outer: number;
  color: string;
  opacity: number;
}

export interface Appearance {
  style: SurfaceStyle;
  seed: number;
  /** Palette: primary, secondary, accent (hex strings). */
  colors: [string, string, string];
  atmosphereColor: string | null;
  /** 0..1 thickness of the atmospheric rim. */
  atmosphereDensity: number;
  /** 0..1 cloud coverage (rocky worlds). */
  clouds: number;
  /** 0..1 ocean coverage (terran worlds). */
  oceanLevel: number;
  cityLights: boolean;
  rings: RingSpec | null;
  /** Effective temperature (K) for stars; drives their colour. */
  temperature: number;
}

/** Serializable description of a body — used for presets, saves, undo and the UI. */
export interface BodyData {
  id: string;
  name: string;
  kind: BodyKind;
  /** Catalog entry the body was created from (e.g. "earth", "redDwarf"). */
  type: string;
  /** Mass in solar masses. */
  mass: number;
  /**
   * Physical radius in AU. The collision/display radius is this value multiplied
   * by the world's size exaggeration for the body kind (see `effectiveRadius`).
   * For black holes this is the stylised absorption radius.
   */
  radius: number;
  position: Vec3;
  velocity: Vec3;
  /** Sidereal rotation period in days (visual spin only). Negative = retrograde. */
  rotationPeriod: number;
  /** Axial tilt in degrees (visual only). */
  axialTilt: number;
  /** Luminosity relative to the Sun (stars only; drives lighting). */
  luminosity: number;
  appearance: Appearance;
}

export type CollisionMode = 'merge' | 'fragment' | 'off';

export interface SizeScale {
  /** Exaggeration applied to planets, moons, asteroids and comets. */
  bodies: number;
  /** Exaggeration applied to stars. */
  stars: number;
}

export interface WorldSettings {
  /** Fixed integration step in years. */
  baseDt: number;
  collisionMode: CollisionMode;
  sizeScale: SizeScale;
  /** Requested simulation speed in simulated years per real second. */
  timeScale: number;
}

export type SimEventType = 'merge' | 'fragment' | 'absorb' | 'shatter';

export interface SimEvent {
  type: SimEventType;
  /** Contact point (AU). */
  position: Vec3;
  /** Velocity of the resulting centre of mass (AU/yr). */
  velocity: Vec3;
  /** Body that survives (absorber / merged body / target), if any. */
  survivorId: string | null;
  victimId: string;
  victimName: string;
  survivorName: string | null;
  /** Colours involved, for VFX tinting. */
  colors: string[];
  /** Effective (display) radius of the larger participant, AU. */
  scale: number;
  /** Effective radius of the smaller participant, AU. */
  victimScale: number;
  /** Specific impact energy relative to the target's binding energy (0..∞). */
  intensity: number;
  /** Impact direction (unit vector from survivor toward victim). */
  normal: Vec3;
  /** IDs of fragments created by the event. */
  fragmentIds: string[];
}
