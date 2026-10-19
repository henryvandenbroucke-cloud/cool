import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset } from '../presets';
import { SimulationEngine } from '../simulation/engine';
import { effectiveRadius } from '../simulation/body';
import { orbitalElements } from '../simulation/orbits';
import { createWorldFile, parseWorld } from '../simulation/serialization';
import { DEFAULT_WORLD_SETTINGS } from '../simulation/engine';

function load(id: string) {
  const world = getPreset(id).build();
  const engine = new SimulationEngine(world.settings);
  engine.load(world.bodies, world.settings);
  return { engine, world };
}

function simulate(engine: SimulationEngine, years: number) {
  const steps = Math.round(years / engine.settings.baseDt);
  const events = [];
  for (let i = 0; i < steps; i++) {
    engine.step();
    events.push(...engine.drainEvents());
  }
  return events;
}

describe('presets', () => {
  it('provides at least five presets', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(5);
    expect(PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['solar', 'blackhole', 'binary', 'collision', 'empty']));
  });

  for (const preset of PRESETS) {
    it(`${preset.name}: builds a valid world with no initial overlaps`, () => {
      const world = preset.build();
      const settings = { ...DEFAULT_WORLD_SETTINGS, ...world.settings };
      const file = createWorldFile(preset.name, world.bodies, settings, 0, preset.id);
      const parsed = parseWorld(JSON.parse(JSON.stringify(file)));
      expect(parsed.ok).toBe(true);
      const b = world.bodies;
      for (let i = 0; i < b.length; i++) {
        for (let j = i + 1; j < b.length; j++) {
          const d = Math.hypot(b[i].position.x - b[j].position.x, b[i].position.y - b[j].position.y, b[i].position.z - b[j].position.z);
          const rs = effectiveRadius(b[i], settings.sizeScale) + effectiveRadius(b[j], settings.sizeScale);
          expect(d, `${b[i].name} overlaps ${b[j].name}`).toBeGreaterThan(rs);
        }
      }
    });
  }

  it('Solar System: the eight planets keep their orbits for 12 years', () => {
    const { engine } = load('solar');
    const events = simulate(engine, 12);
    const names = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
    const sun = engine.getBody('sun')!;
    const expected: Record<string, number> = { mercury: 0.387, venus: 0.723, earth: 1, mars: 1.524, jupiter: 5.203, saturn: 9.537, uranus: 19.19, neptune: 30.07 };
    for (const id of names) {
      const p = engine.getBody(id);
      expect(p, `${id} survived`).toBeDefined();
      const el = orbitalElements(p!, sun);
      expect(el.bound).toBe(true);
      expect(Math.abs(el.semiMajorAxis - expected[id]) / expected[id]).toBeLessThan(0.02);
    }
    expect(events.filter((e) => ['earth', 'moon', 'jupiter', 'io', 'europa', 'ganymede', 'callisto'].includes(e.victimId))).toHaveLength(0);
  });

  it('Solar System: moons stay bound to their planets', () => {
    const { engine } = load('solar');
    simulate(engine, 3);
    const pairs: [string, string][] = [
      ['moon', 'earth'],
      ['io', 'jupiter'],
      ['europa', 'jupiter'],
      ['ganymede', 'jupiter'],
      ['callisto', 'jupiter'],
      ['titan', 'saturn'],
    ];
    for (const [m, p] of pairs) {
      const moon = engine.getBody(m)!;
      const planet = engine.getBody(p)!;
      expect(moon, m).toBeDefined();
      const el = orbitalElements(moon, planet);
      expect(el.bound, `${m} bound to ${p}`).toBe(true);
      expect(el.eccentricity).toBeLessThan(0.35);
    }
  });

  it('Binary Stars: the stars orbit their barycentre and the planets survive', () => {
    const { engine } = load('binary');
    const a = engine.getBody('helios-a')!;
    const b = engine.getBody('helios-b')!;
    simulate(engine, 15);
    const sep = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    expect(sep).toBeGreaterThan(0.55);
    expect(sep).toBeLessThan(0.65);
    for (const id of ['tatooine', 'verdant', 'colossus', 'frost']) {
      const p = engine.getBody(id);
      expect(p, id).toBeDefined();
      expect(Math.hypot(p!.x, p!.y, p!.z)).toBeLessThan(12);
    }
  });

  it('Planet Collision: Theia hits Gaia within the opening seconds', () => {
    const { engine } = load('collision');
    const events = simulate(engine, 0.05);
    const hit = events.find((e) => (e.type === 'fragment' || e.type === 'merge') && [e.victimId, e.survivorId].includes('theia'));
    expect(hit).toBeDefined();
    expect(hit!.survivorId).toBe('gaia');
  });

  it('Black Hole: the black hole swallows something and gets heavier', () => {
    const { engine } = load('blackhole');
    const bh = engine.getBody('gargantua')!;
    const m0 = bh.mass;
    const events = simulate(engine, 1.5);
    expect(events.some((e) => e.type === 'absorb')).toBe(true);
    expect(bh.mass).toBeGreaterThan(m0);
    for (const id of ['miller', 'mann', 'edmunds', 'endurance']) expect(engine.getBody(id), id).toBeDefined();
  });
});
