import { SimBody, cloneBodyData, effectiveRadius } from './body';
import { resolveContact, shatterBody, type CollisionContext } from './collisions';
import {
  DEFAULT_BASE_DT,
  DEFAULT_PAIR_BUDGET,
  DEFAULT_SOFTENING,
  MAX_BODIES,
  MAX_SUBSTEPS,
} from './constants';
import { centerOfMass, computeAccelerations, drift, kick, kineticEnergy, potentialEnergy, substepsFor, totalMomentum } from './physics';
import type { BodyData, SimEvent, Vec3, WorldSettings } from './types';
import { mulberry32 } from '../utils/random';

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  baseDt: DEFAULT_BASE_DT,
  collisionMode: 'fragment',
  sizeScale: { bodies: 30, stars: 6 },
  timeScale: 0.08,
};

export interface AdvanceResult {
  steps: number;
  substeps: number;
  /** True if the work budget cut the frame short (simulation slower than requested). */
  limited: boolean;
  /** Simulated years actually integrated this call. */
  simulated: number;
}

export type BodyPatch = Partial<Omit<BodyData, 'id'>>;

/**
 * Deterministic N-body simulation.
 *
 * Time advances only in whole fixed steps of `settings.baseDt`. Each fixed step
 * is split into N equal leapfrog (kick-drift-kick) substeps, where N is derived
 * from the system state alone (closest dynamical/approach time), so the result
 * never depends on the rendering frame rate — only on how many fixed steps ran.
 */
export class SimulationEngine {
  bodies: SimBody[] = [];
  time = 0;
  settings: WorldSettings;
  softening = DEFAULT_SOFTENING;
  pairBudget = DEFAULT_PAIR_BUDGET;
  maxBodies = MAX_BODIES;
  maxSubsteps = MAX_SUBSTEPS;
  /** Pending events for VFX/audio/UI consumers. Drain with `drainEvents()`. */
  private events: SimEvent[] = [];
  /** Bumps whenever bodies are added or removed. */
  structureVersion = 0;
  /** Bumps whenever editable body properties change. */
  propertyVersion = 0;
  totalSteps = 0;
  lastAdvance: AdvanceResult = { steps: 0, substeps: 0, limited: false, simulated: 0 };
  /** Fraction of a fixed step accumulated but not yet simulated (0..1), for render interpolation. */
  alpha = 0;
  /** Optional observer called after every fixed step (e.g. dense trail sampling). */
  onStep: ((engine: SimulationEngine) => void) | null = null;

  private index = new Map<string, SimBody>();
  private accumulator = 0;
  private accDirty = true;
  private radii = new Float64Array(64);
  private contacts: number[] = [];
  private stats = { minDynamical: Infinity, minApproach: Infinity };
  private rng: () => number;
  private nextId = 1;
  private collisionCtx: CollisionContext;

  constructor(settings: Partial<WorldSettings> = {}, seed = 1337) {
    this.settings = { ...DEFAULT_WORLD_SETTINGS, ...settings, sizeScale: { ...DEFAULT_WORLD_SETTINGS.sizeScale, ...settings.sizeScale } };
    this.rng = mulberry32(seed);
    this.collisionCtx = {
      mode: this.settings.collisionMode,
      scale: this.settings.sizeScale,
      time: 0,
      rng: () => this.rng(),
      spawnCapacity: () => this.maxBodies - this.bodies.length,
      spawn: (data) => this.addBody(data),
      remove: (b) => this.detach(b),
      emit: (e) => this.events.push(e),
    };
  }

  // ---------------------------------------------------------------- bodies

  get count(): number {
    return this.bodies.length;
  }

  getBody(id: string | null | undefined): SimBody | undefined {
    return id ? this.index.get(id) : undefined;
  }

  generateId(): string {
    let id: string;
    do {
      id = `b${this.nextId++}`;
    } while (this.index.has(id));
    return id;
  }

  addBody(data: Omit<BodyData, 'id'> & { id?: string }): SimBody {
    if (this.bodies.length >= this.maxBodies) {
      throw new Error(`Body limit reached (${this.maxBodies}).`);
    }
    const id = data.id && !this.index.has(data.id) ? data.id : this.generateId();
    const body = new SimBody({ ...cloneBodyData({ ...data, id } as BodyData), id });
    this.bodies.push(body);
    this.index.set(id, body);
    this.ensureCapacity();
    this.accDirty = true;
    this.structureVersion++;
    return body;
  }

  removeBody(id: string): boolean {
    const b = this.index.get(id);
    if (!b) return false;
    this.detach(b);
    return true;
  }

  private detach(b: SimBody): void {
    const i = this.bodies.indexOf(b);
    if (i < 0) return;
    b.alive = false;
    this.bodies.splice(i, 1);
    this.index.delete(b.id);
    this.accDirty = true;
    this.structureVersion++;
  }

  updateBody(id: string, patch: BodyPatch): SimBody | undefined {
    const b = this.index.get(id);
    if (!b) return undefined;
    if (patch.name !== undefined) b.name = patch.name;
    if (patch.kind !== undefined) b.kind = patch.kind;
    if (patch.type !== undefined) b.type = patch.type;
    if (patch.mass !== undefined && patch.mass > 0 && Number.isFinite(patch.mass)) b.mass = patch.mass;
    if (patch.radius !== undefined && patch.radius > 0 && Number.isFinite(patch.radius)) b.radius = patch.radius;
    if (patch.position) {
      b.x = patch.position.x;
      b.y = patch.position.y;
      b.z = patch.position.z;
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
    }
    if (patch.velocity) {
      b.vx = patch.velocity.x;
      b.vy = patch.velocity.y;
      b.vz = patch.velocity.z;
    }
    if (patch.rotationPeriod !== undefined) b.rotationPeriod = patch.rotationPeriod;
    if (patch.axialTilt !== undefined) b.axialTilt = patch.axialTilt;
    if (patch.luminosity !== undefined) b.luminosity = patch.luminosity;
    if (patch.appearance) b.appearance = { ...b.appearance, ...patch.appearance };
    this.accDirty = true;
    this.propertyVersion++;
    return b;
  }

  clear(): void {
    for (const b of this.bodies) b.alive = false;
    this.bodies = [];
    this.index.clear();
    this.events = [];
    this.time = 0;
    this.accumulator = 0;
    this.alpha = 0;
    this.totalSteps = 0;
    this.nextId = 1;
    this.accDirty = true;
    this.structureVersion++;
  }

  /** Replaces the whole world. */
  load(bodies: readonly BodyData[], settings: Partial<WorldSettings> = {}, time = 0): void {
    this.clear();
    this.setSettings(settings);
    for (const b of bodies) this.addBody(b);
    this.time = time;
    // Make freshly generated ids never collide with loaded ones.
    for (const b of this.bodies) {
      const m = /^b(\d+)$/.exec(b.id);
      if (m) this.nextId = Math.max(this.nextId, Number(m[1]) + 1);
    }
  }

  setSettings(settings: Partial<WorldSettings>): void {
    this.settings = {
      ...this.settings,
      ...settings,
      sizeScale: { ...this.settings.sizeScale, ...settings.sizeScale },
    };
    if (!(this.settings.baseDt > 0)) this.settings.baseDt = DEFAULT_BASE_DT;
    this.collisionCtx.mode = this.settings.collisionMode;
    this.collisionCtx.scale = this.settings.sizeScale;
    this.accDirty = true;
    this.propertyVersion++;
  }

  snapshot(): BodyData[] {
    return this.bodies.map((b) => b.toData());
  }

  effectiveRadius(b: SimBody): number {
    return effectiveRadius(b, this.settings.sizeScale);
  }

  /** Shifts the world into the centre-of-momentum frame (barycentre at origin, zero net momentum). */
  toBarycentricFrame(): void {
    const com = centerOfMass(this.bodies);
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      b.x -= com.position.x;
      b.y -= com.position.y;
      b.z -= com.position.z;
      b.vx -= com.velocity.x;
      b.vy -= com.velocity.y;
      b.vz -= com.velocity.z;
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
    }
    this.accDirty = true;
  }

  /** Creative destruction effect (see `shatterBody`). Returns fragment ids. */
  shatter(id: string, pieces = 14): string[] {
    const b = this.index.get(id);
    if (!b) return [];
    this.collisionCtx.time = this.time;
    const frags = shatterBody(b, this.collisionCtx, pieces);
    this.accDirty = true;
    return frags.map((f) => f.id);
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  // ------------------------------------------------------------- stepping

  /**
   * Accumulates `simYears` of requested time and runs as many fixed steps as
   * fit, bounded by the per-call work budget.
   */
  advance(simYears: number): AdvanceResult {
    const res = this.lastAdvance;
    res.steps = 0;
    res.substeps = 0;
    res.limited = false;
    res.simulated = 0;
    if (!(simYears > 0)) {
      this.alpha = this.accumulator / this.settings.baseDt;
      return res;
    }
    const dt = this.settings.baseDt;
    this.accumulator += simYears;
    let work = 0;
    while (this.accumulator >= dt) {
      const n = this.bodies.length;
      const pairs = Math.max(1, (n * (n - 1)) / 2);
      const predicted = this.peekSubsteps() * pairs;
      if (res.steps > 0 && work + predicted > this.pairBudget) {
        res.limited = true;
        // Drop the unsimulated remainder: time runs slower instead of becoming inaccurate.
        this.accumulator = Math.min(this.accumulator, dt * 0.999);
        break;
      }
      const sub = this.step();
      res.steps++;
      res.substeps += sub;
      res.simulated += dt;
      work += sub * pairs;
      this.accumulator -= dt;
    }
    this.alpha = Math.min(1, Math.max(0, this.accumulator / dt));
    return res;
  }

  private peekSubsteps(): number {
    if (this.accDirty) this.refreshForces();
    return substepsFor(this.settings.baseDt, this.stats, this.maxSubsteps);
  }

  private ensureCapacity(): void {
    const n = this.bodies.length;
    if (this.radii.length < n) this.radii = new Float64Array(Math.max(n, this.radii.length * 2));
  }

  private refreshRadii(): void {
    this.ensureCapacity();
    const s = this.settings.sizeScale;
    for (let i = 0; i < this.bodies.length; i++) this.radii[i] = effectiveRadius(this.bodies[i], s);
  }

  private refreshForces(): void {
    this.refreshRadii();
    const st = computeAccelerations(this.bodies, this.softening, null, null);
    this.stats.minDynamical = st.minDynamical;
    this.stats.minApproach = st.minApproach;
    this.accDirty = false;
  }

  /** Runs exactly one fixed step. Returns the number of substeps used. */
  step(): number {
    const dt = this.settings.baseDt;
    if (this.accDirty) this.refreshForces();
    const n = substepsFor(dt, this.stats, this.maxSubsteps);
    const h = dt / n;
    for (const b of this.bodies) {
      b.px = b.x;
      b.py = b.y;
      b.pz = b.z;
    }
    for (let s = 0; s < n; s++) {
      if (this.accDirty) this.refreshForces();
      const bodies = this.bodies;
      kick(bodies, h * 0.5);
      drift(bodies, h);
      this.time += h;
      this.refreshRadii();
      const st = computeAccelerations(bodies, this.softening, this.radii, this.contacts, this.time);
      this.stats.minDynamical = st.minDynamical;
      this.stats.minApproach = st.minApproach;
      kick(bodies, h * 0.5);
      if (this.contacts.length > 0) this.resolveContacts();
    }
    this.totalSteps++;
    this.onStep?.(this);
    return n;
  }

  private resolveContacts(): void {
    const pairs = this.contacts.slice();
    const list = this.bodies.slice();
    this.collisionCtx.time = this.time;
    let changed = false;
    for (let k = 0; k < pairs.length; k += 2) {
      const a = list[pairs[k]];
      const b = list[pairs[k + 1]];
      if (resolveContact(a, b, this.collisionCtx)) changed = true;
    }
    if (changed) {
      this.accDirty = true;
      this.propertyVersion++;
    }
  }

  // ----------------------------------------------------------- read-outs

  /**
   * Smooth render position: linearly extrapolates the last fixed step by the
   * fraction of a step still waiting in the accumulator, so slow-motion playback
   * doesn't stutter between fixed steps. Physics state itself is untouched.
   */
  renderPosition(b: SimBody, out: Vec3): Vec3 {
    const a = this.alpha;
    out.x = b.x + (b.x - b.px) * a;
    out.y = b.y + (b.y - b.py) * a;
    out.z = b.z + (b.z - b.pz) * a;
    return out;
  }

  indexOf(id: string): number {
    const b = this.index.get(id);
    return b ? this.bodies.indexOf(b) : -1;
  }

  energy(): number {
    return kineticEnergy(this.bodies) + potentialEnergy(this.bodies, this.softening);
  }

  momentum(): Vec3 {
    return totalMomentum(this.bodies);
  }

  /** Requested simulation speed is reachable at the current body count? (rough estimate) */
  maxSustainableTimeScale(fps = 60): number {
    const n = this.bodies.length;
    const pairs = Math.max(1, (n * (n - 1)) / 2);
    const sub = this.peekSubsteps();
    const stepsPerFrame = this.pairBudget / (pairs * sub);
    return stepsPerFrame * this.settings.baseDt * fps;
  }
}
