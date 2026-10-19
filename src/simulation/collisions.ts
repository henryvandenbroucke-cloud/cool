import { G } from './constants';
import { SimBody, effectiveRadius } from './body';
import type { BodyData, CollisionMode, SimEvent, SizeScale, Vec3 } from './types';

/**
 * Simplified collision model
 * --------------------------
 * - Black holes absorb anything that crosses their absorption radius; mass and
 *   linear momentum are conserved.
 * - "merge": every contact produces a single body. Mass and linear momentum are
 *   conserved exactly; volume is conserved for the radius.
 * - "fragment": the impact's specific energy Q is compared with a crude binding
 *   energy 0.6·G·M/R. The largest remnant keeps M·(1 − Q/2Q*_RD) with
 *   Q*_RD ≈ 1.9× that energy (Leinhardt & Stewart–style scaling); the rest becomes a handful of
 *   physical fragments. Low-energy contacts still merge. Momentum is conserved.
 * - "off": bodies pass through each other (black-hole absorption still applies).
 *
 * None of this models material deformation; it is a game-friendly
 * approximation that keeps the conserved quantities honest.
 */

export interface CollisionContext {
  mode: CollisionMode;
  scale: SizeScale;
  time: number;
  rng: () => number;
  /** How many more bodies the engine may hold. */
  spawnCapacity: () => number;
  spawn: (data: Omit<BodyData, 'id'>) => SimBody;
  remove: (body: SimBody) => void;
  emit: (event: SimEvent) => void;
}

/** Above this relative energy an impact fragments instead of merging (fragment mode). */
export const FRAGMENT_THRESHOLD = 0.08;

/**
 * Specific impact energy divided by the merged body's gravitational binding
 * energy per unit mass. Uses the *physical* radii: the display exaggeration
 * must not make planets more fragile.
 */
export function impactIntensity(a: SimBody, b: SimBody): number {
  const m = a.mass + b.mass;
  const mu = (a.mass * b.mass) / m;
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const dvz = a.vz - b.vz;
  const q = (0.5 * mu * (dvx * dvx + dvy * dvy + dvz * dvz)) / m;
  const r = Math.cbrt(a.radius ** 3 + b.radius ** 3);
  const qStar = (0.6 * G * m) / r;
  return q / qStar;
}

function normalBetween(from: SimBody, to: SimBody): Vec3 {
  let x = to.x - from.x;
  let y = to.y - from.y;
  let z = to.z - from.z;
  const l = Math.hypot(x, y, z);
  if (l < 1e-15) return { x: 0, y: 1, z: 0 };
  x /= l;
  y /= l;
  z /= l;
  return { x, y, z };
}

function mergeKinematics(survivor: SimBody, victim: SimBody): void {
  const m = survivor.mass + victim.mass;
  survivor.x = (survivor.x * survivor.mass + victim.x * victim.mass) / m;
  survivor.y = (survivor.y * survivor.mass + victim.y * victim.mass) / m;
  survivor.z = (survivor.z * survivor.mass + victim.z * victim.mass) / m;
  survivor.vx = (survivor.vx * survivor.mass + victim.vx * victim.mass) / m;
  survivor.vy = (survivor.vy * survivor.mass + victim.vy * victim.mass) / m;
  survivor.vz = (survivor.vz * survivor.mass + victim.vz * victim.mass) / m;
  survivor.mass = m;
}

function baseEvent(type: SimEvent['type'], survivor: SimBody, victim: SimBody, ctx: CollisionContext, intensity: number): SimEvent {
  const normal = normalBetween(survivor, victim);
  const rs = effectiveRadius(survivor, ctx.scale);
  return {
    type,
    position: { x: survivor.x + normal.x * rs, y: survivor.y + normal.y * rs, z: survivor.z + normal.z * rs },
    velocity: { x: 0, y: 0, z: 0 },
    survivorId: survivor.id,
    victimId: victim.id,
    victimName: victim.name,
    survivorName: survivor.name,
    colors: [victim.appearance.colors[0], victim.appearance.colors[1], survivor.appearance.colors[0]],
    scale: rs,
    victimScale: effectiveRadius(victim, ctx.scale),
    intensity,
    normal,
    fragmentIds: [],
  };
}

/** Resolves one contact. Returns true if the body list changed. */
export function resolveContact(a: SimBody, b: SimBody, ctx: CollisionContext): boolean {
  if (!a.alive || !b.alive) return false;

  // Black-hole absorption always applies.
  if (a.kind === 'blackHole' || b.kind === 'blackHole') {
    let absorber: SimBody;
    let victim: SimBody;
    if (a.kind === 'blackHole' && b.kind === 'blackHole') {
      absorber = a.mass >= b.mass ? a : b;
      victim = absorber === a ? b : a;
    } else {
      absorber = a.kind === 'blackHole' ? a : b;
      victim = absorber === a ? b : a;
    }
    const intensity = impactIntensity(absorber, victim);
    const event = baseEvent('absorb', absorber, victim, ctx, intensity);
    // Use the victim's own position as the visual contact point.
    event.position = { x: victim.x, y: victim.y, z: victim.z };
    const oldMass = absorber.mass;
    mergeKinematics(absorber, victim);
    // Absorption radius grows linearly with mass, like a Schwarzschild radius.
    absorber.radius *= absorber.mass / oldMass;
    event.velocity = { x: absorber.vx, y: absorber.vy, z: absorber.vz };
    ctx.remove(victim);
    ctx.emit(event);
    return true;
  }

  if (ctx.mode === 'off') return false;

  const survivor = a.mass >= b.mass ? a : b;
  const victim = survivor === a ? b : a;
  const intensity = impactIntensity(survivor, victim);

  // Stars never shatter, and debris re-accretes instead of cascading into ever smaller shards.
  const breakable = survivor.kind !== 'star' && victim.kind !== 'star' && survivor.type !== 'fragment';
  if (ctx.mode === 'fragment' && breakable && intensity > FRAGMENT_THRESHOLD && ctx.spawnCapacity() >= 3) {
    fragmentCollision(survivor, victim, intensity, ctx);
    return true;
  }

  const event = baseEvent('merge', survivor, victim, ctx, intensity);
  mergeKinematics(survivor, victim);
  survivor.radius = Math.cbrt(survivor.radius ** 3 + victim.radius ** 3);
  if (survivor.kind !== 'star') survivor.heat = Math.min(1, survivor.heat + 0.35 + Math.min(0.65, intensity * 4));
  event.velocity = { x: survivor.vx, y: survivor.vy, z: survivor.vz };
  ctx.remove(victim);
  ctx.emit(event);
  return true;
}

function randomUnit(rng: () => number): Vec3 {
  const u = rng() * 2 - 1;
  const t = rng() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return { x: s * Math.cos(t), y: u, z: s * Math.sin(t) };
}

/**
 * Breaks a body (or the pair) into a remnant plus fragments. Fragments are
 * real physics bodies; they can fall back and re-merge.
 */
function fragmentCollision(target: SimBody, projectile: SimBody, intensity: number, ctx: CollisionContext): void {
  const event = baseEvent('fragment', target, projectile, ctx, intensity);
  const totalMass = target.mass + projectile.mass;
  const vcx = (target.vx * target.mass + projectile.vx * projectile.mass) / totalMass;
  const vcy = (target.vy * target.mass + projectile.vy * projectile.mass) / totalMass;
  const vcz = (target.vz * target.mass + projectile.vz * projectile.mass) / totalMass;
  const relSpeed = Math.hypot(target.vx - projectile.vx, target.vy - projectile.vy, target.vz - projectile.vz);

  // Catastrophic-disruption threshold Q*_RD ≈ 1.9 × binding energy (rubble-pile scaling).
  const remnantFrac = Math.min(0.95, Math.max(0.1, 1 - (0.5 * intensity) / 1.9));
  const remnantMass = Math.max(target.mass * 0.25, totalMass * remnantFrac);
  const ejectaMass = totalMass - remnantMass;
  const nFrag = Math.min(ctx.spawnCapacity(), Math.max(3, Math.round(4 + 8 * Math.min(1, intensity))));

  // Remnant keeps the target's identity; its volume follows its mass at constant density.
  const density = (target.mass + projectile.mass) / (target.radius ** 3 + projectile.radius ** 3);
  const remnantRadius = Math.cbrt(remnantMass / density);
  const remnantEff = remnantRadius * (effectiveRadius(target, ctx.scale) / target.radius);
  const cx = (target.x * target.mass + projectile.x * projectile.mass) / totalMass;
  const cy = (target.y * target.mass + projectile.y * projectile.mass) / totalMass;
  const cz = (target.z * target.mass + projectile.z * projectile.mass) / totalMass;

  const vesc = Math.sqrt((2 * G * remnantMass) / Math.max(remnantEff, 1e-12));
  const n = event.normal;

  // Random mass split (sorted so the first fragment is largest).
  const weights: number[] = [];
  let wsum = 0;
  for (let i = 0; i < nFrag; i++) {
    const w = Math.pow(ctx.rng() + 0.15, 2.2);
    weights.push(w);
    wsum += w;
  }
  weights.sort((p, q) => q - p);

  let px = 0;
  let py = 0;
  let pz = 0;
  const fragments: SimBody[] = [];
  const scaleFactor = effectiveRadius(target, ctx.scale) / target.radius;
  for (let i = 0; i < nFrag; i++) {
    const m = (ejectaMass * weights[i]) / wsum;
    const r = Math.cbrt(m / density);
    const rnd = randomUnit(ctx.rng);
    let dx = n.x * 1.1 + rnd.x * 0.9;
    let dy = n.y * 1.1 + rnd.y * 0.9;
    let dz = n.z * 1.1 + rnd.z * 0.9;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl;
    dy /= dl;
    dz /= dl;
    const speed = vesc * (0.85 + ctx.rng() * 0.75) + relSpeed * 0.15 * ctx.rng();
    const offset = remnantEff * 1.15 + r * scaleFactor * 2.5;
    const vx = vcx + dx * speed;
    const vy = vcy + dy * speed;
    const vz = vcz + dz * speed;
    px += m * (vx - vcx);
    py += m * (vy - vcy);
    pz += m * (vz - vcz);
    const frag = ctx.spawn({
      name: `${target.name} debris`,
      kind: 'asteroid',
      type: 'fragment',
      mass: m,
      radius: r,
      position: { x: cx + dx * offset, y: cy + dy * offset, z: cz + dz * offset },
      velocity: { x: vx, y: vy, z: vz },
      rotationPeriod: 0.3 + ctx.rng() * 2,
      axialTilt: ctx.rng() * 180,
      luminosity: 0,
      appearance: {
        style: 'asteroid',
        seed: Math.floor(ctx.rng() * 1e6),
        colors: [target.appearance.colors[1], projectile.appearance.colors[0], '#ff7a2a'],
        atmosphereColor: null,
        atmosphereDensity: 0,
        clouds: 0,
        oceanLevel: 0,
        cityLights: false,
        rings: null,
        temperature: 0,
      },
    });
    frag.heat = 1;
    frag.collisionGraceUntil = ctx.time + (offset * 4) / Math.max(speed, 1e-9);
    fragments.push(frag);
  }

  // Remnant velocity restores total momentum exactly.
  target.mass = remnantMass;
  target.radius = remnantRadius;
  target.x = cx;
  target.y = cy;
  target.z = cz;
  target.vx = vcx - px / remnantMass;
  target.vy = vcy - py / remnantMass;
  target.vz = vcz - pz / remnantMass;
  target.heat = 1;
  target.collisionGraceUntil = Math.max(target.collisionGraceUntil, ...fragments.map((f) => f.collisionGraceUntil));

  event.velocity = { x: vcx, y: vcy, z: vcz };
  event.fragmentIds = fragments.map((f) => f.id);
  ctx.remove(projectile);
  ctx.emit(event);
}

/**
 * Creative effect: breaks a body into fragments flying outward. Mass and
 * momentum are conserved, but the energy is invented — it is not a model of a
 * real planetary explosion.
 */
export function shatterBody(body: SimBody, ctx: CollisionContext, pieces = 14): SimBody[] {
  const capacity = ctx.spawnCapacity();
  const n = Math.min(pieces, capacity);
  if (n < 2 || body.kind === 'blackHole') return [];
  const eff = effectiveRadius(body, ctx.scale);
  const density = body.mass / body.radius ** 3;
  const vesc = Math.sqrt((2 * G * body.mass) / Math.max(eff, 1e-12));
  const weights: number[] = [];
  let wsum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.pow(ctx.rng() + 0.2, 2);
    weights.push(w);
    wsum += w;
  }
  const fragments: SimBody[] = [];
  let px = 0;
  let py = 0;
  let pz = 0;
  const vels: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const m = (body.mass * weights[i]) / wsum;
    const r = Math.cbrt(m / density);
    const d = randomUnit(ctx.rng);
    const speed = vesc * (1.25 + ctx.rng() * 0.9);
    const v = { x: d.x * speed, y: d.y * speed, z: d.z * speed };
    px += m * v.x;
    py += m * v.y;
    pz += m * v.z;
    vels.push(v);
    const offset = eff * (0.35 + 0.6 * ctx.rng());
    const frag = ctx.spawn({
      name: `${body.name} shard`,
      kind: 'asteroid',
      type: 'fragment',
      mass: m,
      radius: r,
      position: { x: body.x + d.x * offset, y: body.y + d.y * offset, z: body.z + d.z * offset },
      velocity: { x: 0, y: 0, z: 0 },
      rotationPeriod: 0.2 + ctx.rng(),
      axialTilt: ctx.rng() * 180,
      luminosity: 0,
      appearance: {
        style: 'asteroid',
        seed: Math.floor(ctx.rng() * 1e6),
        colors: [body.appearance.colors[0], body.appearance.colors[1], '#ff6a1a'],
        atmosphereColor: null,
        atmosphereDensity: 0,
        clouds: 0,
        oceanLevel: 0,
        cityLights: false,
        rings: null,
        temperature: 0,
      },
    });
    frag.heat = 1;
    fragments.push(frag);
  }
  // Remove net momentum of the ejecta so the system's momentum is unchanged.
  for (let i = 0; i < n; i++) {
    const f = fragments[i];
    f.vx = body.vx + vels[i].x - px / body.mass;
    f.vy = body.vy + vels[i].y - py / body.mass;
    f.vz = body.vz + vels[i].z - pz / body.mass;
    f.collisionGraceUntil = ctx.time + (eff * 6) / Math.max(vesc, 1e-9);
  }
  ctx.emit({
    type: 'shatter',
    position: { x: body.x, y: body.y, z: body.z },
    velocity: { x: body.vx, y: body.vy, z: body.vz },
    survivorId: null,
    victimId: body.id,
    victimName: body.name,
    survivorName: null,
    colors: [body.appearance.colors[0], body.appearance.colors[1], body.appearance.colors[2]],
    scale: eff,
    victimScale: eff,
    intensity: 2,
    normal: { x: 0, y: 1, z: 0 },
    fragmentIds: fragments.map((f) => f.id),
  });
  ctx.remove(body);
  return fragments;
}
