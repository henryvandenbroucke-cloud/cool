/** Deterministic PRNG so every save, match and season replays identically. */

export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(typeof seed === 'string' ? hashSeed(seed) : seed >>> 0);
  return {
    next,
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    /** Float in [min, max). */
    float(min, max) {
      return min + next() * (max - min);
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** Weighted pick from [{ value, weight }] or [[value, weight]]. */
    weighted(entries) {
      const rows = entries.map((e) => (Array.isArray(e) ? { value: e[0], weight: e[1] } : e));
      const total = rows.reduce((sum, r) => sum + r.weight, 0);
      let roll = next() * total;
      for (const row of rows) {
        roll -= row.weight;
        if (roll <= 0) return row.value;
      }
      return rows[rows.length - 1].value;
    },
    chance(p) {
      return next() < p;
    },
    shuffle(list) {
      const out = list.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** Crude Poisson sampler (Knuth) — fine for the small lambdas we use. */
    poisson(lambda) {
      const limit = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k += 1;
        p *= next();
      } while (p > limit);
      return k - 1;
    },
    /** Box–Muller normal. */
    normal(mean = 0, sd = 1) {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
