import { createBodyData, BLACK_HOLE_RADIUS_PER_MASS } from '../celestial/catalog';
import { DAY_YR } from '../simulation/constants';
import type { BodyData, WorldSettings } from '../simulation/types';
import { mulberry32 } from '../utils/random';
import { keplerState, type KeplerElements, type KeplerParent } from './kepler';

export interface CameraSpec {
  /** Body id to orbit around (null = world origin). */
  target: string | null;
  /** Camera distance in AU. */
  distance: number;
  /** Elevation above the XZ plane (deg). */
  elevation: number;
  /** Azimuth around +Y (deg). */
  azimuth: number;
}

export interface PresetWorld {
  bodies: BodyData[];
  settings: Partial<WorldSettings>;
  camera: CameraSpec;
  /** Optional decorative layers. */
  galaxy?: boolean;
}

export interface PresetDefinition {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Honest notes about simplifications (shown in the UI). */
  disclosure: string;
  accent: string;
  build: () => PresetWorld;
}

type Draft = Omit<BodyData, 'id'> & { id: string };

function body(id: string, key: string, opts: Parameters<typeof createBodyData>[1] = {}): Draft {
  return { ...createBodyData(key, opts), id };
}

function orbit(child: Draft, parent: KeplerParent, el: KeplerElements): Draft {
  const s = keplerState(parent, child.mass, el);
  child.position = s.position;
  child.velocity = s.velocity;
  return child;
}

// ---------------------------------------------------------------- Solar System

function solarSystem(): PresetWorld {
  const rng = mulberry32(2024);
  const phase = () => rng() * 360;
  const sun = body('sun', 'yellowStar', { name: 'Sun', seed: 11 });
  const mercury = orbit(body('mercury', 'mercury', { name: 'Mercury', seed: 21 }), sun, { a: 0.387, e: 0.2056, i: 7.0, node: 48.3, peri: 29.1, anomaly: phase() });
  const venus = orbit(body('venus', 'venus', { name: 'Venus', seed: 22 }), sun, { a: 0.723, e: 0.0068, i: 3.39, node: 76.7, peri: 54.9, anomaly: phase() });
  const earth = orbit(body('earth', 'earth', { name: 'Earth', seed: 23 }), sun, { a: 1.0, e: 0.0167, i: 0, node: -11.3, peri: 114.2, anomaly: 205 });
  const moon = orbit(body('moon', 'moon', { name: 'Moon', seed: 24 }), earth, { a: 0.00257, e: 0.0549, i: 5.1, anomaly: phase() });
  const mars = orbit(body('mars', 'mars', { name: 'Mars', seed: 25 }), sun, { a: 1.524, e: 0.0934, i: 1.85, node: 49.6, peri: 286.5, anomaly: 140 });
  const jupiter = orbit(body('jupiter', 'jupiter', { name: 'Jupiter', seed: 26 }), sun, { a: 5.203, e: 0.0489, i: 1.3, node: 100.5, peri: 273.9, anomaly: 160 });
  const galilean: Draft[] = [
    orbit(body('io', 'moon', { name: 'Io', seed: 31, mass: 4.48e-8, radiusKm: 1821, appearance: { colors: ['#e3c45a', '#a8652b', '#f4e7a1'] } }), jupiter, { a: 0.022, anomaly: phase() }),
    orbit(body('europa', 'moon', { name: 'Europa', seed: 32, mass: 2.41e-8, radiusKm: 1561, appearance: { style: 'ice', colors: ['#e9e2d4', '#a48a6b', '#c9b9a0'] } }), jupiter, { a: 0.03, anomaly: phase() }),
    orbit(body('ganymede', 'moon', { name: 'Ganymede', seed: 33, mass: 7.45e-8, radiusKm: 2634 }), jupiter, { a: 0.042, anomaly: phase() }),
    orbit(body('callisto', 'moon', { name: 'Callisto', seed: 34, mass: 5.42e-8, radiusKm: 2410, appearance: { colors: ['#6d6257', '#3e3731', '#a39585'] } }), jupiter, { a: 0.065, anomaly: phase() }),
  ];
  const saturn = orbit(body('saturn', 'saturn', { name: 'Saturn', seed: 27 }), sun, { a: 9.537, e: 0.0565, i: 2.49, node: 113.7, peri: 339.4, anomaly: 120 });
  const titan = orbit(body('titan', 'moon', { name: 'Titan', seed: 35, mass: 6.76e-8, radiusKm: 2575, appearance: { style: 'venus', colors: ['#d9a54e', '#9a6a2a', '#f0cd84'], atmosphereColor: '#e8b45c', atmosphereDensity: 0.7, clouds: 0.9 } }), saturn, { a: 0.045, anomaly: phase() });
  const uranus = orbit(
    body('uranus', 'neptune', {
      name: 'Uranus', seed: 28, mass: 4.365e-5, radiusKm: 25362,
      appearance: { colors: ['#9fe1e8', '#5fb3c4', '#d8f7f9'], atmosphereColor: '#a6eef6', rings: { inner: 1.6, outer: 2.0, color: '#9fb6bd', opacity: 0.35 } },
    }),
    sun,
    { a: 19.19, e: 0.0457, i: 0.77, node: 74, peri: 96.9, anomaly: phase() },
  );
  uranus.axialTilt = 97.8;
  uranus.rotationPeriod = -0.718;
  const neptune = orbit(body('neptune', 'neptune', { name: 'Neptune', seed: 29 }), sun, { a: 30.07, e: 0.0113, i: 1.77, node: 131.8, peri: 273.2, anomaly: phase() });

  const belt: Draft[] = [];
  for (let k = 0; k < 24; k++) {
    const a = 2.2 + rng() * 1.1;
    belt.push(
      orbit(body(`ast${k}`, 'asteroid', { name: ['Ceres', 'Vesta', 'Pallas', 'Hygiea'][k] ?? `Asteroid ${k + 1}`, seed: 100 + k, mass: 1e-11 + rng() * 4e-10, radiusKm: 60 + rng() * 420 }), sun, {
        a,
        e: rng() * 0.15,
        i: rng() * 12,
        node: rng() * 360,
        peri: rng() * 360,
        anomaly: rng() * 360,
      }),
    );
  }
  const halley = orbit(body('halley', 'comet', { name: "Halley's Comet", seed: 41 }), sun, { a: 17.8, e: 0.967, i: 162.3, node: 58.4, peri: 111.3, anomaly: -128 });

  return {
    bodies: [sun, mercury, venus, earth, moon, mars, jupiter, ...galilean, saturn, titan, uranus, neptune, ...belt, halley],
    settings: { baseDt: 0.1 * DAY_YR, timeScale: 0.08, collisionMode: 'fragment', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: 'sun', distance: 3.6, elevation: 24, azimuth: 30 },
  };
}

// ------------------------------------------------------------------ Black hole

function blackHole(): PresetWorld {
  const rng = mulberry32(77);
  const mass = 40;
  const bh = body('gargantua', 'blackHole', { name: 'Gargantua', seed: 5, mass });
  bh.radius = mass * BLACK_HOLE_RADIUS_PER_MASS;
  const planets: Draft[] = [
    orbit(body('miller', 'ice', { name: 'Miller', seed: 51 }), bh, { a: 2.4, e: 0.05, i: 3, anomaly: 40 }),
    orbit(body('mann', 'volcanic', { name: 'Mann', seed: 52 }), bh, { a: 3.6, e: 0.08, i: -4, anomaly: 170 }),
    orbit(body('edmunds', 'desert', { name: 'Edmunds', seed: 53 }), bh, { a: 7.8, e: 0.03, i: 6, anomaly: 260 }),
    orbit(body('endurance', 'saturn', { name: 'Endurance', seed: 54 }), bh, { a: 5.2, e: 0.02, i: 2, anomaly: 310 }),
  ];
  const star = orbit(body('pantagruel', 'blueWhite', { name: 'Pantagruel', seed: 55 }), bh, { a: 14, e: 0.1, i: 9, anomaly: 210 });
  const swarm: Draft[] = [];
  for (let k = 0; k < 22; k++) {
    swarm.push(
      orbit(body(`rock${k}`, 'asteroid', { name: `Debris ${k + 1}`, seed: 300 + k, mass: 1e-11, radiusKm: 120 + rng() * 300 }), bh, {
        a: 1.2 + rng() * 0.9,
        e: rng() * 0.12,
        i: (rng() - 0.5) * 8,
        node: rng() * 360,
        anomaly: rng() * 360,
      }),
    );
  }
  // Doomed bodies on plunging orbits: absorbed within the first minute.
  const doomed = [
    orbit(body('wanderer', 'mars', { name: 'Wanderer', seed: 56 }), bh, { a: 2.6, e: 0.965, i: 4, peri: 200, anomaly: 160 }),
    orbit(body('icarus', 'comet', { name: 'Icarus', seed: 57 }), bh, { a: 4.5, e: 0.985, i: -7, peri: 40, anomaly: 172 }),
  ];
  return {
    bodies: [bh, ...planets, star, ...swarm, ...doomed],
    settings: { baseDt: 0.05 * DAY_YR, timeScale: 0.05, collisionMode: 'fragment', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: 'gargantua', distance: 2.4, elevation: 9, azimuth: -20 },
  };
}

// ---------------------------------------------------------------- Binary stars

function binary(): PresetWorld {
  const m1 = 1.0;
  const m2 = 0.7;
  const sep = 0.6;
  const a = body('helios-a', 'yellowStar', { name: 'Helios A', seed: 61, mass: m1 });
  const b = body('helios-b', 'redDwarf', { name: 'Helios B', seed: 62, mass: m2, radiusKm: 0.68 * 695700, appearance: { temperature: 4300, colors: ['#ffb46b', '#ffe0bd', '#ff7a3a'] } });
  b.luminosity = 0.2;
  // Two-body circular orbit about the barycentre at the origin.
  const bary = { mass: m1 + m2, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } };
  const rel = keplerState({ mass: m1, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }, m2, { a: sep, anomaly: 0 });
  const f1 = m2 / (m1 + m2);
  const f2 = m1 / (m1 + m2);
  a.position = { x: -rel.position.x * f1, y: -rel.position.y * f1, z: -rel.position.z * f1 };
  a.velocity = { x: -rel.velocity.x * f1, y: -rel.velocity.y * f1, z: -rel.velocity.z * f1 };
  b.position = { x: rel.position.x * f2, y: rel.position.y * f2, z: rel.position.z * f2 };
  b.velocity = { x: rel.velocity.x * f2, y: rel.velocity.y * f2, z: rel.velocity.z * f2 };

  const tatooine = orbit(body('tatooine', 'desert', { name: 'Tatooine', seed: 63 }), bary, { a: 2.1, e: 0.02, anomaly: 90 });
  const verdant = orbit(body('verdant', 'earth', { name: 'Verdant', seed: 64 }), bary, { a: 3.3, e: 0.01, i: 1.5, anomaly: 230 });
  const giant = orbit(body('colossus', 'gasCustom', { name: 'Colossus', seed: 65 }), bary, { a: 5.4, e: 0.03, i: -2, anomaly: 10 });
  const moon = orbit(body('colossus-i', 'moon', { name: 'Colossus I', seed: 66 }), giant, { a: 0.035, anomaly: 45 });
  const ice = orbit(body('frost', 'ice', { name: 'Frost', seed: 67 }), bary, { a: 8.2, e: 0.04, i: 3, anomaly: 300 });
  return {
    bodies: [a, b, tatooine, verdant, giant, moon, ice],
    settings: { baseDt: 0.1 * DAY_YR, timeScale: 0.06, collisionMode: 'fragment', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: null, distance: 4.2, elevation: 30, azimuth: 15 },
  };
}

// ----------------------------------------------------------- Planet collision

function collision(): PresetWorld {
  const sun = body('sol', 'yellowStar', { name: 'Sol', seed: 71 });
  sun.position = { x: -1, y: 0, z: 0 };
  const gaia = orbit(body('gaia', 'earth', { name: 'Gaia', seed: 72 }), sun, { a: 1, anomaly: 0 });
  const luna = orbit(body('selene', 'moon', { name: 'Selene', seed: 73 }), gaia, { a: 0.0042, anomaly: 210 });
  // Theia approaches on a slightly off-centre path; ~15 km/s relative speed.
  const theia = body('theia', 'volcanic', { name: 'Theia', seed: 74, mass: 0.45 * 3.003e-6, radiusKm: 5200 });
  const rel = { x: -0.95, y: 0.12, z: 0.3 };
  const rl = Math.hypot(rel.x, rel.y, rel.z);
  const speed = 3.2; // AU/yr ≈ 15 km/s
  const travel = 0.024; // years before closest approach (ignoring focusing)
  const offset = 0.0011; // impact parameter (AU) — an oblique hit
  theia.position = {
    x: gaia.position.x - (rel.x / rl) * speed * travel,
    y: gaia.position.y - (rel.y / rl) * speed * travel + offset,
    z: gaia.position.z - (rel.z / rl) * speed * travel,
  };
  theia.velocity = {
    x: gaia.velocity.x + (rel.x / rl) * speed,
    y: gaia.velocity.y + (rel.y / rl) * speed,
    z: gaia.velocity.z + (rel.z / rl) * speed,
  };
  return {
    bodies: [sun, gaia, luna, theia],
    settings: { baseDt: 0.01 * DAY_YR, timeScale: 0.0035, collisionMode: 'fragment', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: 'gaia', distance: 0.016, elevation: 12, azimuth: 205 },
  };
}

// --------------------------------------------------------------------- Empty

function empty(): PresetWorld {
  return {
    bodies: [],
    settings: { baseDt: 0.1 * DAY_YR, timeScale: 0.08, collisionMode: 'fragment', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: null, distance: 4, elevation: 28, azimuth: 0 },
  };
}

// -------------------------------------------------------------------- Galaxy

function galaxy(): PresetWorld {
  const core = body('sagittarius', 'blackHole', { name: 'Sagittarius', seed: 81, mass: 400 });
  core.radius = 0.6;
  const rng = mulberry32(99);
  const stars: Draft[] = [];
  const kinds = ['yellowStar', 'blueWhite', 'redDwarf', 'redGiant', 'yellowStar', 'blueWhite'];
  for (let k = 0; k < 6; k++) {
    stars.push(
      orbit(body(`star${k}`, kinds[k], { seed: 400 + k }), core, {
        a: 14 + k * 7 + rng() * 3,
        e: rng() * 0.15,
        i: (rng() - 0.5) * 10,
        anomaly: rng() * 360,
      }),
    );
  }
  return {
    bodies: [core, ...stars],
    settings: { baseDt: 0.5 * DAY_YR, timeScale: 0.6, collisionMode: 'merge', sizeScale: { bodies: 30, stars: 6 } },
    camera: { target: 'sagittarius', distance: 120, elevation: 38, azimuth: 0 },
    galaxy: true,
  };
}

export const PRESETS: readonly PresetDefinition[] = [
  {
    id: 'solar',
    name: 'Our Solar System',
    tagline: 'The Sun, eight planets and their major moons',
    description: 'Real masses, orbital distances, eccentricities and inclinations, plus an asteroid belt and Halley’s Comet.',
    disclosure: 'Planet and moon radii ×30 and the Sun ×6 for readability (collisions use the enlarged radii). Jupiter’s and Saturn’s moons orbit farther out than in reality so they clear the enlarged planets.',
    accent: '#ffd27a',
    build: solarSystem,
  },
  {
    id: 'blackhole',
    name: 'Black Hole',
    tagline: 'Gargantua — 40 solar masses of darkness',
    description: 'A black hole with a blazing accretion disk, orbiting worlds, a debris swarm and two bodies on doomed plunging orbits.',
    disclosure: 'Newtonian gravity with stylised black-hole visuals. The absorption radius is enlarged far beyond the real event horizon; lensing is an approximate screen-space effect, not general relativity.',
    accent: '#ff9a3c',
    build: blackHole,
  },
  {
    id: 'binary',
    name: 'Binary Stars',
    tagline: 'Two suns waltzing around their barycentre',
    description: 'A yellow and an orange star in a 0.6 AU orbit with circumbinary planets beyond the unstable zone.',
    disclosure: 'Planets are placed outside ~3.5× the binary separation, where circumbinary orbits are typically stable.',
    accent: '#ffb46b',
    build: binary,
  },
  {
    id: 'collision',
    name: 'Planet Collision',
    tagline: 'Theia meets Gaia',
    description: 'A Mars-sized world on an oblique collision course with an Earth-like planet. Press play and watch.',
    disclosure: 'Simplified collision model: merging or fragmentation based on impact energy, conserving mass and momentum. No material deformation is simulated.',
    accent: '#ff6a3d',
    build: collision,
  },
  {
    id: 'empty',
    name: 'Empty Universe',
    tagline: 'A blank canvas of deep space',
    description: 'Nothing but stars and nebulae. Create everything from scratch.',
    disclosure: '',
    accent: '#41d9ff',
    build: empty,
  },
  {
    id: 'galaxy',
    name: 'Galaxy Playground',
    tagline: 'A procedural spiral galaxy',
    description: 'A supermassive black hole with orbiting stars inside a glowing spiral galaxy of 100,000 particles.',
    disclosure: 'The galaxy’s particles follow a simplified rotation curve and are decorative — only the black hole and the named stars are simulated with N-body gravity.',
    accent: '#9065ff',
    build: galaxy,
  },
];

export function getPreset(id: string): PresetDefinition {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
