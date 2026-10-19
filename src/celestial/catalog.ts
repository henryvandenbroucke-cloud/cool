import { AU_KM, EARTH_MASS_SUN, SUN_RADIUS_AU } from '../simulation/constants';
import type { Appearance, BodyData, BodyKind, SurfaceStyle } from '../simulation/types';
import { blackbodyHex, hslToHex, mixHex } from '../utils/color';
import { mulberry32, randomSeed } from '../utils/random';

export type CatalogGroup = 'rocky' | 'gas' | 'star' | 'other';

export interface CatalogEntry {
  key: string;
  label: string;
  group: CatalogGroup;
  kind: BodyKind;
  description: string;
  /** Mass in solar masses. */
  mass: number;
  /** Physical radius in km (converted to AU on creation). */
  radiusKm: number;
  rotationPeriod: number;
  axialTilt: number;
  luminosity: number;
  appearance: Omit<Appearance, 'seed'>;
  names: string[];
}

/** Black-hole absorption radius per solar mass (AU). Stylised — not the Schwarzschild radius. */
export const BLACK_HOLE_RADIUS_PER_MASS = 0.003;

const KM = 1 / AU_KM;

function look(style: SurfaceStyle, colors: [string, string, string], extra: Partial<Omit<Appearance, 'seed' | 'style' | 'colors'>> = {}): Omit<Appearance, 'seed'> {
  return {
    style,
    colors,
    atmosphereColor: null,
    atmosphereDensity: 0,
    clouds: 0,
    oceanLevel: 0,
    cityLights: false,
    rings: null,
    temperature: 0,
    ...extra,
  };
}

function star(temperature: number, extra: Partial<Omit<Appearance, 'seed' | 'style' | 'colors'>> = {}): Omit<Appearance, 'seed'> {
  const c = blackbodyHex(temperature);
  return look('star', [c, mixHex(c, '#ffffff', 0.55), mixHex(c, '#ff5a00', 0.35)], { temperature, ...extra });
}

export const CATALOG: readonly CatalogEntry[] = [
  // ------------------------------------------------------------------ rocky
  {
    key: 'earth', label: 'Earth-like', group: 'rocky', kind: 'rocky',
    description: 'Oceans, continents, clouds and city lights.',
    mass: EARTH_MASS_SUN, radiusKm: 6371, rotationPeriod: 0.997, axialTilt: 23.4, luminosity: 0,
    appearance: look('terran', ['#0a2a5e', '#3b6a34', '#c8a46a'], { atmosphereColor: '#5ea8ff', atmosphereDensity: 0.85, clouds: 0.55, oceanLevel: 0.6, cityLights: true }),
    names: ['Terra Nova', 'Gaia', 'Eden', 'Verdance', 'Aurelia', 'Thalassa'],
  },
  {
    key: 'mars', label: 'Mars-like', group: 'rocky', kind: 'rocky',
    description: 'Rust-red deserts, canyons and polar caps.',
    mass: 3.227e-7, radiusKm: 3389.5, rotationPeriod: 1.026, axialTilt: 25.2, luminosity: 0,
    appearance: look('mars', ['#b4522e', '#6e2e1b', '#e2a47a'], { atmosphereColor: '#e7a173', atmosphereDensity: 0.3, clouds: 0.04 }),
    names: ['Ares', 'Rubra', 'Cinnabar', 'Ochre', 'Hesperia'],
  },
  {
    key: 'mercury', label: 'Mercury-like', group: 'rocky', kind: 'rocky',
    description: 'Airless, cratered grey rock.',
    mass: 1.66e-7, radiusKm: 2439.7, rotationPeriod: 58.6, axialTilt: 0.03, luminosity: 0,
    appearance: look('mercury', ['#8b847e', '#55504b', '#b9b1a8']),
    names: ['Hermes', 'Cinder', 'Ashen', 'Pallor'],
  },
  {
    key: 'venus', label: 'Venus-like', group: 'rocky', kind: 'rocky',
    description: 'Shrouded in thick golden clouds.',
    mass: 2.448e-6, radiusKm: 6051.8, rotationPeriod: -243, axialTilt: 177.4, luminosity: 0,
    appearance: look('venus', ['#e6c48a', '#b98b4a', '#f6e4ba'], { atmosphereColor: '#f6d49c', atmosphereDensity: 0.95, clouds: 1 }),
    names: ['Lucifera', 'Vesper', 'Aphra'],
  },
  {
    key: 'volcanic', label: 'Volcanic', group: 'rocky', kind: 'rocky',
    description: 'Black basalt crust split by rivers of lava.',
    mass: 1.6 * EARTH_MASS_SUN, radiusKm: 7100, rotationPeriod: 1.6, axialTilt: 8, luminosity: 0,
    appearance: look('volcanic', ['#2b1d18', '#0f0908', '#ff5a14'], { atmosphereColor: '#ff7536', atmosphereDensity: 0.4 }),
    names: ['Vulcan', 'Inferna', 'Pyra', 'Magmar', 'Ember'],
  },
  {
    key: 'ice', label: 'Ice planet', group: 'rocky', kind: 'rocky',
    description: 'Glaciers and frozen seas under a pale sky.',
    mass: 0.7 * EARTH_MASS_SUN, radiusKm: 5600, rotationPeriod: 1.3, axialTilt: 15, luminosity: 0,
    appearance: look('ice', ['#e4f1fb', '#9cc3e3', '#5a88b8'], { atmosphereColor: '#b8e2ff', atmosphereDensity: 0.45, clouds: 0.25 }),
    names: ['Glacia', 'Hoth', 'Niflheim', 'Boreas', 'Rime'],
  },
  {
    key: 'desert', label: 'Desert planet', group: 'rocky', kind: 'rocky',
    description: 'Endless dunes and salt flats.',
    mass: 0.9 * EARTH_MASS_SUN, radiusKm: 6000, rotationPeriod: 1.1, axialTilt: 12, luminosity: 0,
    appearance: look('desert', ['#d8ad74', '#a3713e', '#f1d7a3'], { atmosphereColor: '#f0bf86', atmosphereDensity: 0.35, clouds: 0.06 }),
    names: ['Arrakis', 'Sahra', 'Dune', 'Calidus', 'Tatoo'],
  },
  // -------------------------------------------------------------------- gas
  {
    key: 'jupiter', label: 'Jupiter-like', group: 'gas', kind: 'gasGiant',
    description: 'Banded giant with storms.',
    mass: 9.543e-4, radiusKm: 69911, rotationPeriod: 0.414, axialTilt: 3.1, luminosity: 0,
    appearance: look('jupiter', ['#d6b088', '#9c6440', '#f2e2c6'], { atmosphereColor: '#e8cfa8', atmosphereDensity: 0.45 }),
    names: ['Zeus', 'Titanis', 'Colossus', 'Atlas'],
  },
  {
    key: 'saturn', label: 'Saturn-like', group: 'gas', kind: 'gasGiant',
    description: 'Pale gold giant with a vast ring system.',
    mass: 2.857e-4, radiusKm: 58232, rotationPeriod: 0.444, axialTilt: 26.7, luminosity: 0,
    appearance: look('saturn', ['#e2cc98', '#b5945c', '#f6ead0'], {
      atmosphereColor: '#f2dcab', atmosphereDensity: 0.4,
      rings: { inner: 1.24, outer: 2.35, color: '#d9c6a0', opacity: 0.9 },
    }),
    names: ['Kronos', 'Annulus', 'Halo', 'Corona'],
  },
  {
    key: 'neptune', label: 'Neptune-like', group: 'gas', kind: 'gasGiant',
    description: 'Deep blue ice giant with high winds.',
    mass: 5.149e-5, radiusKm: 24622, rotationPeriod: 0.671, axialTilt: 28.3, luminosity: 0,
    appearance: look('neptune', ['#3356d6', '#1b2a86', '#86abff'], { atmosphereColor: '#6e98ff', atmosphereDensity: 0.65 }),
    names: ['Poseidon', 'Abyssus', 'Cerulea', 'Tethys'],
  },
  {
    key: 'gasCustom', label: 'Procedural giant', group: 'gas', kind: 'gasGiant',
    description: 'A randomly coloured gas giant.',
    mass: 4e-4, radiusKm: 62000, rotationPeriod: 0.5, axialTilt: 10, luminosity: 0,
    appearance: look('gas', ['#8a6fd6', '#3e2f7a', '#e3c6ff'], { atmosphereColor: '#b59cff', atmosphereDensity: 0.5 }),
    names: ['Nebulon', 'Chroma', 'Vortex', 'Aether', 'Spectra'],
  },
  // ------------------------------------------------------------------ stars
  {
    key: 'redDwarf', label: 'Red dwarf', group: 'star', kind: 'star',
    description: 'Small, cool and long-lived. 0.3 M☉.',
    mass: 0.3, radiusKm: 0.32 * 695700, rotationPeriod: 30, axialTilt: 0, luminosity: 0.012,
    appearance: star(3200),
    names: ['Proxima', 'Ross', 'Wolf', 'Gliese', 'Lacaille'],
  },
  {
    key: 'yellowStar', label: 'Yellow star', group: 'star', kind: 'star',
    description: 'A Sun-like main-sequence star. 1 M☉.',
    mass: 1, radiusKm: 695700, rotationPeriod: 25.4, axialTilt: 7.25, luminosity: 1,
    appearance: star(5778),
    names: ['Sol', 'Helios', 'Tau Ceti', 'Alpha Cen', 'Kepler'],
  },
  {
    key: 'blueWhite', label: 'Blue-white star', group: 'star', kind: 'star',
    description: 'Hot, massive and brilliant. 2.1 M☉.',
    mass: 2.1, radiusKm: 1.7 * 695700, rotationPeriod: 5, axialTilt: 0, luminosity: 25,
    appearance: star(9900),
    names: ['Sirius', 'Vega', 'Rigel', 'Altair', 'Spica'],
  },
  {
    key: 'redGiant', label: 'Red giant', group: 'star', kind: 'star',
    description: 'A swollen, dying star. 1.2 M☉, 12 R☉.',
    mass: 1.2, radiusKm: 12 * 695700, rotationPeriod: 300, axialTilt: 0, luminosity: 90,
    appearance: star(3900),
    names: ['Aldebaran', 'Arcturus', 'Mira', 'Pollux'],
  },
  // ------------------------------------------------------------------ other
  {
    key: 'moon', label: 'Moon', group: 'other', kind: 'moon',
    description: 'A grey, cratered natural satellite.',
    mass: 3.694e-8, radiusKm: 1737.4, rotationPeriod: 27.3, axialTilt: 6.7, luminosity: 0,
    appearance: look('moon', ['#9b968f', '#66625d', '#c6c1ba']),
    names: ['Luna', 'Selene', 'Io', 'Europa', 'Titania', 'Phoebe', 'Nyx'],
  },
  {
    key: 'asteroid', label: 'Asteroid', group: 'other', kind: 'asteroid',
    description: 'A lumpy rock left over from planet formation.',
    mass: 4.7e-10, radiusKm: 470, rotationPeriod: 0.38, axialTilt: 4, luminosity: 0,
    appearance: look('asteroid', ['#7c736a', '#4d4741', '#a59c92']),
    names: ['Ceres', 'Vesta', 'Pallas', 'Hygiea', 'Juno', 'Psyche'],
  },
  {
    key: 'comet', label: 'Comet', group: 'other', kind: 'comet',
    description: 'An icy nucleus that grows a tail near stars.',
    mass: 1.1e-16, radiusKm: 30, rotationPeriod: 2.2, axialTilt: 0, luminosity: 0,
    appearance: look('comet', ['#c7d5e0', '#6f7f8c', '#9fe9ff']),
    names: ['Halley', 'Hale-Bopp', 'Encke', 'Swift-Tuttle', 'Tempel'],
  },
  {
    key: 'blackHole', label: 'Black hole', group: 'other', kind: 'blackHole',
    description: '10 M☉ of collapsed matter. Stylised event horizon.',
    mass: 10, radiusKm: 10 * BLACK_HOLE_RADIUS_PER_MASS * AU_KM, rotationPeriod: 0.01, axialTilt: 0, luminosity: 0,
    appearance: look('blackHole', ['#000000', '#ff9a3c', '#ffd9a6'], { temperature: 4200 }),
    names: ['Gargantua', 'Abyss', 'Erebus', 'Maw', 'Sagittarius'],
  },
  {
    key: 'custom', label: 'Custom body', group: 'other', kind: 'rocky',
    description: 'Start from a blank rocky world and tune everything.',
    mass: EARTH_MASS_SUN, radiusKm: 6371, rotationPeriod: 1, axialTilt: 0, luminosity: 0,
    appearance: look('desert', ['#7da0c8', '#3b4f73', '#e9d7b0'], { atmosphereColor: '#9ec5ff', atmosphereDensity: 0.4, clouds: 0.2 }),
    names: ['Custom', 'Prototype', 'Genesis'],
  },
];

const BY_KEY = new Map(CATALOG.map((e) => [e.key, e]));

export function getCatalogEntry(key: string): CatalogEntry {
  return BY_KEY.get(key) ?? BY_KEY.get('custom')!;
}

export interface CreateOptions {
  name?: string;
  seed?: number;
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  mass?: number;
  radiusKm?: number;
  appearance?: Partial<Appearance>;
}

/** Builds a body description from a catalog entry with sensible defaults. */
export function createBodyData(key: string, opts: CreateOptions = {}): Omit<BodyData, 'id'> {
  const e = getCatalogEntry(key);
  const seed = opts.seed ?? randomSeed();
  const rng = mulberry32(seed);
  let colors = [...e.appearance.colors] as [string, string, string];
  if (e.key === 'gasCustom' && !opts.appearance?.colors) {
    const h = rng();
    colors = [hslToHex(h, 0.55, 0.62), hslToHex((h + 0.08) % 1, 0.6, 0.32), hslToHex((h + 0.5) % 1, 0.5, 0.8)];
  }
  const appearance: Appearance = {
    ...e.appearance,
    colors,
    atmosphereColor: e.key === 'gasCustom' && !opts.appearance?.atmosphereColor ? mixHex(colors[0], '#ffffff', 0.3) : e.appearance.atmosphereColor,
    rings: e.appearance.rings ? { ...e.appearance.rings } : null,
    seed,
    ...opts.appearance,
  };
  const mass = opts.mass ?? e.mass;
  let radius = (opts.radiusKm ?? e.radiusKm) * KM;
  if (e.kind === 'blackHole' && opts.radiusKm === undefined) radius = mass * BLACK_HOLE_RADIUS_PER_MASS;
  return {
    name: opts.name ?? e.names[Math.floor(rng() * e.names.length)],
    kind: e.kind,
    type: e.key,
    mass,
    radius,
    position: opts.position ? { ...opts.position } : { x: 0, y: 0, z: 0 },
    velocity: opts.velocity ? { ...opts.velocity } : { x: 0, y: 0, z: 0 },
    rotationPeriod: e.rotationPeriod,
    axialTilt: e.axialTilt,
    luminosity: e.kind === 'star' ? starLuminosity(mass, e) : 0,
    appearance,
  };
}

/** Luminosity follows the catalog value, scaled with the main-sequence L ∝ M^3.5 if mass is edited. */
function starLuminosity(mass: number, e: CatalogEntry): number {
  return e.luminosity * Math.pow(mass / e.mass, 3.5);
}

export function solarRadii(radiusAu: number): number {
  return radiusAu / SUN_RADIUS_AU;
}

export const TOOL_GROUPS: Record<string, string[]> = {
  planet: ['earth', 'mars', 'mercury', 'venus', 'volcanic', 'ice', 'desert', 'jupiter', 'saturn', 'neptune', 'gasCustom'],
  star: ['yellowStar', 'redDwarf', 'blueWhite', 'redGiant'],
  moon: ['moon'],
  blackHole: ['blackHole'],
  asteroid: ['asteroid', 'comet'],
  custom: ['custom'],
};
