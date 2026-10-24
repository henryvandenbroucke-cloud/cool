// Tiny tween + easing kit. Every motion in the game goes through here so the
// "nothing linear" rule holds everywhere.

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  inCubic: (t) => t * t * t,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

const active = new Set();

/** tween({ duration, ease, update(k), done() }) → handle with .cancel() */
export function tween({ duration = 0.3, delay = 0, easing = ease.outCubic, update, done }) {
  const t = { elapsed: -delay, duration, easing, update, done, dead: false, cancel() { this.dead = true; active.delete(this); } };
  active.add(t);
  return t;
}

export function tickTweens(dt) {
  for (const t of active) {
    t.elapsed += dt;
    if (t.elapsed < 0) continue;
    const k = Math.min(1, t.elapsed / t.duration);
    t.update?.(t.easing(k), k);
    if (k >= 1) {
      active.delete(t);
      t.done?.();
    }
  }
}

/** Promise version for sequencing. */
export function tweenP(opts) {
  return new Promise((resolve) => tween({ ...opts, done: () => { opts.done?.(); resolve(); } }));
}

export const wait = (s) => tweenP({ duration: s, update() {} });

/** Frame-rate independent exponential damping. */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Squash-and-settle pop for a freshly placed object (scale-based, ~150ms). */
export function popIn(obj, { from = 0.6, duration = 0.32, squash = 0.08 } = {}) {
  const base = obj.scale.clone();
  obj.scale.multiplyScalar(from);
  return tween({
    duration,
    easing: ease.outBack,
    update: (k) => {
      const wobble = Math.sin(k * Math.PI) * squash;
      obj.scale.set(base.x * (from + (1 - from) * k) * (1 + wobble), base.y * (from + (1 - from) * k) * (1 - wobble), base.z * (from + (1 - from) * k) * (1 + wobble));
    },
    done: () => obj.scale.copy(base),
  });
}

/** Small seeded RNG (mulberry32) for repeatable village layout. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
