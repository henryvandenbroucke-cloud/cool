import { describe, expect, it } from 'vitest';
import { createBodyData } from '../celestial/catalog';
import { SimulationEngine } from '../simulation/engine';
import { circularOrbitVelocity, dominantBody, orbitalElements, predictTrajectory } from '../simulation/orbits';
import { getPreset } from '../presets';

describe('orbit analysis', () => {
  it('computes elements of a circular orbit', () => {
    const sun = { mass: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    const v = circularOrbitVelocity(sun, { x: 2, y: 0, z: 0 }, 0);
    const el = orbitalElements({ mass: 0, x: 2, y: 0, z: 0, vx: v.x, vy: v.y, vz: v.z }, sun);
    expect(el.bound).toBe(true);
    expect(el.eccentricity).toBeLessThan(1e-9);
    expect(el.semiMajorAxis).toBeCloseTo(2, 9);
    expect(el.period).toBeCloseTo(Math.sqrt(8), 9);
  });

  it('attributes points near a planet to that planet and others to the star', () => {
    const world = getPreset('solar').build();
    const engine = new SimulationEngine(world.settings);
    engine.load(world.bodies, world.settings);
    const earth = engine.getBody('earth')!;
    expect(dominantBody(engine.bodies, earth.x + 0.004, earth.y, earth.z)?.id).toBe('earth');
    expect(dominantBody(engine.bodies, earth.x + 0.2, earth.y, earth.z)?.id).toBe('sun');
    const jupiter = engine.getBody('jupiter')!;
    expect(dominantBody(engine.bodies, jupiter.x + 0.1, jupiter.y, jupiter.z)?.id).toBe('jupiter');
  });

  it('predicts a closed orbit and detects impacts', () => {
    const engine = new SimulationEngine({ collisionMode: 'merge' });
    const sun = engine.addBody(createBodyData('yellowStar', { seed: 1 }));
    const probe = { ...createBodyData('earth', { seed: 2 }), id: 'probe', x: 1, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    const v = circularOrbitVelocity(sun, { x: 1, y: 0, z: 0 }, probe.mass);
    Object.assign(probe, { vx: v.x, vy: v.y, vz: v.z });
    const res = predictTrajectory(engine.bodies, probe, -1, { steps: 400, duration: 1, softening: 1e-6, scale: engine.settings.sizeScale });
    expect(res.impactId).toBeNull();
    const last = res.count - 1;
    expect(Math.hypot(res.path[last * 3] - 1, res.path[last * 3 + 2])).toBeLessThan(0.02);

    const falling = { ...probe, vx: 0, vy: 0, vz: 0 };
    const hit = predictTrajectory(engine.bodies, falling, -1, { steps: 400, duration: 1, softening: 1e-6, scale: engine.settings.sizeScale });
    expect(hit.impactId).toBe(sun.id);
    expect(hit.count).toBeLessThan(400);
  });
});
