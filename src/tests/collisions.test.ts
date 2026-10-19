import { describe, expect, it } from 'vitest';
import { createBodyData } from '../celestial/catalog';
import { SimulationEngine } from '../simulation/engine';
import { totalMass } from '../simulation/physics';
import type { CollisionMode } from '../simulation/types';

function headOn(mode: CollisionMode, speed = 0.5) {
  const engine = new SimulationEngine({ collisionMode: mode, baseDt: 0.001 / 365.25 });
  const a = engine.addBody(createBodyData('earth', { seed: 1, position: { x: -0.004, y: 0, z: 0 }, velocity: { x: speed, y: 0, z: 0.1 } }));
  const b = engine.addBody(createBodyData('mars', { seed: 2, position: { x: 0.004, y: 0.0003, z: 0 }, velocity: { x: -speed, y: 0, z: 0 } }));
  return { engine, a, b };
}

function runUntilEvent(engine: SimulationEngine, maxSteps = 200000) {
  for (let i = 0; i < maxSteps; i++) {
    engine.step();
    const ev = engine.drainEvents();
    if (ev.length) return ev;
  }
  return [];
}

describe('collisions', () => {
  it('merges bodies while conserving mass and momentum', () => {
    const { engine, a, b } = headOn('merge');
    const m0 = a.mass + b.mass;
    const p0 = engine.momentum();
    const events = runUntilEvent(engine);
    expect(events[0]?.type).toBe('merge');
    expect(engine.count).toBe(1);
    const survivor = engine.bodies[0];
    expect(survivor.id).toBe(a.id); // heavier body survives
    expect(survivor.mass).toBeCloseTo(m0, 18);
    const p1 = engine.momentum();
    expect(p1.x).toBeCloseTo(p0.x, 14);
    expect(p1.z).toBeCloseTo(p0.z, 14);
    expect(survivor.heat).toBeGreaterThan(0);
  });

  it('fragments energetic impacts, conserving mass and momentum', () => {
    const { engine } = headOn('fragment', 6);
    const m0 = totalMass(engine.bodies);
    const p0 = engine.momentum();
    const events = runUntilEvent(engine);
    expect(events[0]?.type).toBe('fragment');
    expect(events[0].fragmentIds.length).toBeGreaterThanOrEqual(3);
    expect(engine.count).toBeGreaterThan(3);
    expect(totalMass(engine.bodies) / m0).toBeCloseTo(1, 12);
    const p1 = engine.momentum();
    const scale = Math.abs(p0.z) + 1e-12;
    expect(Math.abs(p1.x - p0.x) / scale).toBeLessThan(1e-9);
    expect(Math.abs(p1.z - p0.z) / scale).toBeLessThan(1e-9);
  });

  it('passes through when collisions are off', () => {
    const { engine } = headOn('off');
    for (let i = 0; i < 20000; i++) engine.step();
    expect(engine.count).toBe(2);
    expect(engine.drainEvents()).toHaveLength(0);
  });

  it('black holes absorb bodies, gain their mass and grow', () => {
    const engine = new SimulationEngine({ collisionMode: 'off' });
    const bh = engine.addBody(createBodyData('blackHole', { seed: 1, mass: 10 }));
    const r0 = bh.radius;
    const victim = engine.addBody(createBodyData('jupiter', { seed: 2, position: { x: 0.5, y: 0, z: 0 } }));
    const mv = victim.mass;
    const p0 = engine.momentum();
    const events = runUntilEvent(engine);
    expect(events[0]?.type).toBe('absorb');
    expect(events[0].survivorId).toBe(bh.id);
    expect(engine.count).toBe(1);
    expect(bh.mass).toBeCloseTo(10 + mv, 12);
    expect(bh.radius).toBeGreaterThan(r0);
    const p1 = engine.momentum();
    expect(p1.x).toBeCloseTo(p0.x, 12);
  });

  it('a black hole attracts nearby objects', () => {
    const engine = new SimulationEngine({ collisionMode: 'merge' });
    engine.addBody(createBodyData('blackHole', { seed: 1 }));
    const rock = engine.addBody(createBodyData('asteroid', { seed: 2, position: { x: 3, y: 0, z: 0 } }));
    engine.step();
    expect(rock.vx).toBeLessThan(0);
    for (let i = 0; i < 100; i++) engine.step();
    expect(rock.x).toBeLessThan(3);
  });

  it('shatter (creative effect) conserves mass and momentum', () => {
    const engine = new SimulationEngine({});
    engine.addBody(createBodyData('yellowStar', { seed: 1 }));
    const p = engine.addBody(createBodyData('earth', { seed: 2, position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -6.28 } }));
    const m0 = totalMass(engine.bodies);
    const p0 = engine.momentum();
    const ids = engine.shatter(p.id, 12);
    expect(ids).toHaveLength(12);
    expect(engine.getBody(p.id)).toBeUndefined();
    expect(totalMass(engine.bodies) / m0).toBeCloseTo(1, 12);
    const p1 = engine.momentum();
    expect(p1.z).toBeCloseTo(p0.z, 10);
    expect(engine.drainEvents()[0].type).toBe('shatter');
  });
});
