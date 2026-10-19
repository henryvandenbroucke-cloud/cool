import { describe, expect, it } from 'vitest';
import { createBodyData } from '../celestial/catalog';
import { SimulationEngine } from '../simulation/engine';
import { G, DAY_YR } from '../simulation/constants';
import { circularOrbitVelocity, circularSpeed, escapeSpeed } from '../simulation/orbits';
import { keplerState } from '../presets/kepler';

function sunEarth(settings = {}) {
  const engine = new SimulationEngine({ baseDt: 0.1 * DAY_YR, collisionMode: 'merge', ...settings });
  const sun = engine.addBody(createBodyData('yellowStar', { name: 'Sun', seed: 1 }));
  const earthData = createBodyData('earth', { name: 'Earth', seed: 2, position: { x: 1, y: 0, z: 0 } });
  earthData.velocity = circularOrbitVelocity(sun, earthData.position, earthData.mass);
  const earth = engine.addBody(earthData);
  return { engine, sun, earth };
}

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('units and orbital helpers', () => {
  it('uses G = 4π² so a 1 AU orbit around 1 M☉ has a 1 yr period', () => {
    expect(G).toBeCloseTo(39.478, 3);
    expect(circularSpeed(1, 1)).toBeCloseTo(2 * Math.PI, 10);
    expect(escapeSpeed(1, 1)).toBeCloseTo(2 * Math.PI * Math.SQRT2, 10);
  });

  it('builds a prograde circular velocity perpendicular to the radius', () => {
    const parent = { mass: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    const v = circularOrbitVelocity(parent, { x: 1, y: 0, z: 0 }, 0);
    expect(v.x).toBeCloseTo(0, 12);
    expect(v.y).toBeCloseTo(0, 12);
    expect(v.z).toBeCloseTo(-2 * Math.PI, 10); // counter-clockwise seen from +Y
  });

  it('keplerState reproduces the vis-viva speed', () => {
    const s = keplerState({ mass: 1, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } }, 0, { a: 2, e: 0.5, anomaly: 0 });
    const r = Math.hypot(s.position.x, s.position.y, s.position.z);
    expect(r).toBeCloseTo(1, 10); // periapsis = a(1−e)
    const v = Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z);
    expect(v).toBeCloseTo(Math.sqrt(G * (2 / r - 1 / 2)), 10);
  });
});

describe('N-body integration', () => {
  it('keeps a circular orbit circular and conserves energy', () => {
    const { engine, sun, earth } = sunEarth();
    const e0 = engine.energy();
    let minR = Infinity;
    let maxR = 0;
    const steps = Math.round(10 / engine.settings.baseDt);
    for (let i = 0; i < steps; i++) {
      engine.step();
      if (i % 50 === 0) {
        const r = Math.hypot(earth.x - sun.x, earth.y - sun.y, earth.z - sun.z);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
      }
    }
    expect(minR).toBeGreaterThan(0.995);
    expect(maxR).toBeLessThan(1.005);
    expect(Math.abs((engine.energy() - e0) / e0)).toBeLessThan(1e-6);
  });

  it('returns Earth to its starting point after one year', () => {
    const { engine, earth, sun } = sunEarth();
    const start = { x: earth.x - sun.x, y: earth.y - sun.y, z: earth.z - sun.z };
    const steps = Math.round(1 / engine.settings.baseDt);
    for (let i = 0; i < steps; i++) engine.step();
    const now = { x: earth.x - sun.x, y: earth.y - sun.y, z: earth.z - sun.z };
    expect(dist(start, now)).toBeLessThan(0.01);
  });

  it('conserves linear momentum', () => {
    const { engine } = sunEarth();
    engine.addBody(createBodyData('jupiter', { position: { x: 0, y: 0.1, z: 5 }, velocity: { x: 2.7, y: 0, z: 0 } }));
    const p0 = engine.momentum();
    engine.advance(3);
    for (let i = 0; i < 3000; i++) engine.step();
    const p1 = engine.momentum();
    expect(Math.abs(p1.x - p0.x)).toBeLessThan(1e-12);
    expect(Math.abs(p1.y - p0.y)).toBeLessThan(1e-12);
    expect(Math.abs(p1.z - p0.z)).toBeLessThan(1e-12);
  });

  it('is independent of the rendering frame rate', () => {
    const a = sunEarth().engine;
    const b = sunEarth().engine;
    // 2 simulated years delivered as 30 fps vs 144 fps frames.
    for (let i = 0; i < 60; i++) a.advance(2 / 60);
    for (let i = 0; i < 288; i++) b.advance(2 / 288);
    while (a.totalSteps < b.totalSteps) a.step();
    while (b.totalSteps < a.totalSteps) b.step();
    expect(a.totalSteps).toBeGreaterThan(7000);
    for (let i = 0; i < a.bodies.length; i++) {
      expect(a.bodies[i].x).toBe(b.bodies[i].x);
      expect(a.bodies[i].z).toBe(b.bodies[i].z);
      expect(a.bodies[i].vx).toBe(b.bodies[i].vx);
    }
  });

  it('pausing (zero requested time) does not advance the simulation', () => {
    const { engine, earth } = sunEarth();
    const x = earth.x;
    engine.advance(0);
    engine.advance(0);
    expect(engine.time).toBe(0);
    expect(earth.x).toBe(x);
  });

  it('fast-forward advances more simulated time per frame', () => {
    const slow = sunEarth().engine;
    const fast = sunEarth().engine;
    slow.advance(0.08 / 60);
    fast.advance((0.08 * 16) / 60);
    expect(fast.time).toBeGreaterThan(slow.time * 10);
  });

  it('caps work per frame and reports that the speed was limited', () => {
    const { engine } = sunEarth();
    engine.pairBudget = 50;
    const r = engine.advance(10);
    expect(r.limited).toBe(true);
    expect(r.simulated).toBeLessThan(10);
    expect(engine.time).toBeLessThan(10);
  });

  it('changing a mass changes the gravitational behaviour', () => {
    const ref = sunEarth();
    const heavy = sunEarth();
    heavy.engine.updateBody(heavy.sun.id, { mass: 2 });
    const steps = Math.round(0.5 / ref.engine.settings.baseDt);
    for (let i = 0; i < steps; i++) {
      ref.engine.step();
      heavy.engine.step();
    }
    const rRef = dist(ref.earth, ref.sun);
    const rHeavy = dist(heavy.earth, heavy.sun);
    expect(rRef).toBeGreaterThan(0.99);
    // With twice the central mass, Earth's old speed is sub-circular: it falls inward.
    expect(rHeavy).toBeLessThan(0.8);
  });

  it('lets objects above escape velocity leave the system', () => {
    const engine = new SimulationEngine({ collisionMode: 'merge' });
    const sun = engine.addBody(createBodyData('yellowStar', { seed: 1 }));
    const probe = engine.addBody(createBodyData('asteroid', { seed: 2, position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -escapeSpeed(1, 1) * 1.2 } }));
    for (let i = 0; i < Math.round(20 / engine.settings.baseDt); i++) engine.step();
    expect(dist(probe, sun)).toBeGreaterThan(20);
  });

  it('uses more substeps for close encounters but never more than the cap', () => {
    const engine = new SimulationEngine({ collisionMode: 'off' });
    engine.addBody(createBodyData('blackHole', { seed: 1, mass: 50 }));
    engine.addBody(createBodyData('asteroid', { seed: 2, position: { x: 0.2, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -40 } }));
    const n = engine.step();
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(engine.maxSubsteps);
  });

  it('adding a body perturbs existing orbits', () => {
    const ref = sunEarth();
    const pert = sunEarth();
    pert.engine.addBody(createBodyData('jupiter', { mass: 0.01, position: { x: 1.3, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: -5.5 } }));
    for (let i = 0; i < 2000; i++) {
      ref.engine.step();
      pert.engine.step();
    }
    expect(dist(ref.earth, pert.earth)).toBeGreaterThan(0.01);
  });
});
