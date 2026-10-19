import { describe, expect, it } from 'vitest';
import { createBodyData } from '../celestial/catalog';
import { SimulationEngine } from '../simulation/engine';
import { createWorldFile, parseWorld } from '../simulation/serialization';
import { getPreset } from '../presets';

describe('world serialization', () => {
  it('round-trips a universe through JSON exactly', () => {
    const world = getPreset('solar').build();
    const engine = new SimulationEngine(world.settings);
    engine.load(world.bodies, world.settings);
    for (let i = 0; i < 500; i++) engine.step();
    const file = createWorldFile('Test', engine.snapshot(), engine.settings, engine.time, 'solar');
    const parsed = parseWorld(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const restored = new SimulationEngine();
    restored.load(parsed.world.bodies, parsed.world.settings, parsed.world.simTime);
    expect(restored.count).toBe(engine.count);
    expect(restored.time).toBe(engine.time);
    for (let i = 0; i < engine.count; i++) {
      expect(restored.bodies[i].id).toBe(engine.bodies[i].id);
      expect(restored.bodies[i].x).toBe(engine.bodies[i].x);
      expect(restored.bodies[i].vz).toBe(engine.bodies[i].vz);
      expect(restored.bodies[i].mass).toBe(engine.bodies[i].mass);
    }
    // Continuing both produces identical futures.
    for (let i = 0; i < 200; i++) {
      engine.step();
      restored.step();
    }
    expect(restored.bodies[3].x).toBe(engine.bodies[3].x);
  });

  const valid = () => createWorldFile('X', [{ ...createBodyData('earth', { seed: 1 }), id: 'a' }], new SimulationEngine().settings, 0, null);

  it.each([
    ['not JSON', '{nope'],
    ['missing marker', JSON.stringify({ bodies: [] })],
    ['negative mass', () => { const w = valid(); w.bodies[0].mass = -1; return w; }],
    ['NaN position', () => { const w = valid() as unknown as { bodies: { position: { x: unknown } }[] }; w.bodies[0].position.x = 'abc'; return w; }],
    ['bad kind', () => { const w = valid() as unknown as { bodies: { kind: string }[] }; w.bodies[0].kind = 'dragon'; return w; }],
    ['bad colour', () => { const w = valid(); w.bodies[0].appearance.colors[0] = 'red'; return w; }],
    ['duplicate ids', () => { const w = valid(); w.bodies.push({ ...w.bodies[0] }); return w; }],
    ['too many bodies', () => { const w = valid(); w.bodies = Array.from({ length: 500 }, (_, i) => ({ ...w.bodies[0], id: `b${i}` })); return w; }],
  ])('rejects invalid input: %s', (_label, input) => {
    const data = typeof input === 'function' ? input() : input;
    const res = parseWorld(data);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(3);
  });
});
