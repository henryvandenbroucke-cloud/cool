import { MAX_BODIES } from './constants';
import { DEFAULT_WORLD_SETTINGS } from './engine';
import type { Appearance, BodyData, BodyKind, CollisionMode, SurfaceStyle, WorldSettings } from './types';

export const WORLD_FORMAT = 'godmode-world';
export const WORLD_VERSION = 1;

export interface WorldFile {
  format: typeof WORLD_FORMAT;
  version: number;
  name: string;
  savedAt: string;
  presetId: string | null;
  simTime: number;
  settings: WorldSettings;
  bodies: BodyData[];
}

export type ParseResult = { ok: true; world: WorldFile } | { ok: false; error: string };

const KINDS: readonly BodyKind[] = ['star', 'rocky', 'gasGiant', 'moon', 'asteroid', 'comet', 'blackHole'];
const STYLES: readonly SurfaceStyle[] = [
  'terran', 'mars', 'mercury', 'venus', 'volcanic', 'ice', 'desert', 'moon', 'jupiter', 'saturn', 'neptune', 'gas', 'asteroid', 'comet', 'star', 'blackHole',
];
const MODES: readonly CollisionMode[] = ['merge', 'fragment', 'off'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function createWorldFile(name: string, bodies: BodyData[], settings: WorldSettings, simTime: number, presetId: string | null): WorldFile {
  return {
    format: WORLD_FORMAT,
    version: WORLD_VERSION,
    name,
    savedAt: new Date().toISOString(),
    presetId,
    simTime,
    settings: { ...settings, sizeScale: { ...settings.sizeScale } },
    bodies,
  };
}

class ValidationError extends Error {}

function fail(msg: string): never {
  throw new ValidationError(msg);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string, opts: { min?: number; max?: number; positive?: boolean } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path} must be a finite number`);
  if (opts.positive && v <= 0) fail(`${path} must be greater than 0`);
  if (opts.min !== undefined && v < opts.min) fail(`${path} must be ≥ ${opts.min}`);
  if (opts.max !== undefined && v > opts.max) fail(`${path} must be ≤ ${opts.max}`);
  return v;
}

function str(v: unknown, path: string, max = 80): string {
  if (typeof v !== 'string') fail(`${path} must be a string`);
  if (v.length > max) fail(`${path} is too long`);
  return v;
}

function color(v: unknown, path: string): string {
  const s = str(v, path, 7);
  if (!HEX.test(s)) fail(`${path} must be a #rrggbb colour`);
  return s.toLowerCase();
}

function vec(v: unknown, path: string, limit: number) {
  if (!isObj(v)) fail(`${path} must be an object`);
  return {
    x: num(v.x, `${path}.x`, { min: -limit, max: limit }),
    y: num(v.y, `${path}.y`, { min: -limit, max: limit }),
    z: num(v.z, `${path}.z`, { min: -limit, max: limit }),
  };
}

function appearance(v: unknown, path: string): Appearance {
  if (!isObj(v)) fail(`${path} must be an object`);
  const style = str(v.style, `${path}.style`) as SurfaceStyle;
  if (!STYLES.includes(style)) fail(`${path}.style "${style}" is not supported`);
  if (!Array.isArray(v.colors) || v.colors.length !== 3) fail(`${path}.colors must have 3 entries`);
  let rings: Appearance['rings'] = null;
  if (v.rings !== null && v.rings !== undefined) {
    if (!isObj(v.rings)) fail(`${path}.rings must be an object or null`);
    rings = {
      inner: num(v.rings.inner, `${path}.rings.inner`, { min: 1, max: 10 }),
      outer: num(v.rings.outer, `${path}.rings.outer`, { min: 1, max: 12 }),
      color: color(v.rings.color, `${path}.rings.color`),
      opacity: num(v.rings.opacity, `${path}.rings.opacity`, { min: 0, max: 1 }),
    };
    if (rings.outer <= rings.inner) fail(`${path}.rings.outer must exceed inner`);
  }
  return {
    style,
    seed: Math.floor(num(v.seed, `${path}.seed`, { min: 0, max: 2 ** 32 })),
    colors: [color(v.colors[0], `${path}.colors[0]`), color(v.colors[1], `${path}.colors[1]`), color(v.colors[2], `${path}.colors[2]`)],
    atmosphereColor: v.atmosphereColor === null || v.atmosphereColor === undefined ? null : color(v.atmosphereColor, `${path}.atmosphereColor`),
    atmosphereDensity: num(v.atmosphereDensity ?? 0, `${path}.atmosphereDensity`, { min: 0, max: 1 }),
    clouds: num(v.clouds ?? 0, `${path}.clouds`, { min: 0, max: 1 }),
    oceanLevel: num(v.oceanLevel ?? 0, `${path}.oceanLevel`, { min: 0, max: 1 }),
    cityLights: Boolean(v.cityLights),
    rings,
    temperature: num(v.temperature ?? 0, `${path}.temperature`, { min: 0, max: 100000 }),
  };
}

function body(v: unknown, i: number): BodyData {
  const path = `bodies[${i}]`;
  if (!isObj(v)) fail(`${path} must be an object`);
  const kind = str(v.kind, `${path}.kind`) as BodyKind;
  if (!KINDS.includes(kind)) fail(`${path}.kind "${kind}" is not supported`);
  return {
    id: str(v.id, `${path}.id`, 40),
    name: str(v.name, `${path}.name`, 64),
    kind,
    type: str(v.type, `${path}.type`, 40),
    mass: num(v.mass, `${path}.mass`, { positive: true, max: 1e12 }),
    radius: num(v.radius, `${path}.radius`, { positive: true, max: 1e4 }),
    position: vec(v.position, `${path}.position`, 1e7),
    velocity: vec(v.velocity, `${path}.velocity`, 1e8),
    rotationPeriod: num(v.rotationPeriod ?? 1, `${path}.rotationPeriod`, { min: -1e6, max: 1e6 }),
    axialTilt: num(v.axialTilt ?? 0, `${path}.axialTilt`, { min: -180, max: 180 }),
    luminosity: num(v.luminosity ?? 0, `${path}.luminosity`, { min: 0, max: 1e9 }),
    appearance: appearance(v.appearance, `${path}.appearance`),
  };
}

function settings(v: unknown): WorldSettings {
  if (v === undefined) return { ...DEFAULT_WORLD_SETTINGS, sizeScale: { ...DEFAULT_WORLD_SETTINGS.sizeScale } };
  if (!isObj(v)) fail('settings must be an object');
  const mode = (v.collisionMode ?? DEFAULT_WORLD_SETTINGS.collisionMode) as CollisionMode;
  if (!MODES.includes(mode)) fail(`settings.collisionMode "${String(mode)}" is not supported`);
  const ss = isObj(v.sizeScale) ? v.sizeScale : {};
  return {
    baseDt: num(v.baseDt ?? DEFAULT_WORLD_SETTINGS.baseDt, 'settings.baseDt', { positive: true, max: 1 }),
    collisionMode: mode,
    sizeScale: {
      bodies: num(ss.bodies ?? DEFAULT_WORLD_SETTINGS.sizeScale.bodies, 'settings.sizeScale.bodies', { min: 1, max: 1000 }),
      stars: num(ss.stars ?? DEFAULT_WORLD_SETTINGS.sizeScale.stars, 'settings.sizeScale.stars', { min: 1, max: 1000 }),
    },
    timeScale: num(v.timeScale ?? DEFAULT_WORLD_SETTINGS.timeScale, 'settings.timeScale', { min: 0, max: 1e4 }),
  };
}

/** Validates untrusted JSON (from a file or local storage) into a WorldFile. */
export function parseWorld(input: unknown): ParseResult {
  try {
    let data = input;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        fail('File is not valid JSON');
      }
    }
    if (!isObj(data)) fail('World must be a JSON object');
    if (data.format !== WORLD_FORMAT) fail('Not a GOD MODE world file (missing format marker)');
    const version = num(data.version, 'version');
    if (version > WORLD_VERSION) fail(`World version ${version} is newer than this app supports`);
    if (!Array.isArray(data.bodies)) fail('bodies must be an array');
    if (data.bodies.length > MAX_BODIES) fail(`Too many bodies (max ${MAX_BODIES})`);
    const bodies = data.bodies.map(body);
    const ids = new Set<string>();
    for (const b of bodies) {
      if (ids.has(b.id)) fail(`Duplicate body id "${b.id}"`);
      ids.add(b.id);
    }
    return {
      ok: true,
      world: {
        format: WORLD_FORMAT,
        version,
        name: data.name === undefined ? 'Untitled universe' : str(data.name, 'name', 80),
        savedAt: typeof data.savedAt === 'string' ? data.savedAt.slice(0, 40) : new Date().toISOString(),
        presetId: typeof data.presetId === 'string' ? data.presetId.slice(0, 40) : null,
        simTime: num(data.simTime ?? 0, 'simTime', { min: 0, max: 1e12 }),
        settings: settings(data.settings),
        bodies,
      },
    };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    return { ok: false, error: 'Unexpected error while reading the world file' };
  }
}
