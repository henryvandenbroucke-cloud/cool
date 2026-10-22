/**
 * Snake — pure game logic. No DOM, no canvas: runs in the browser and in Node
 * (see test/snake.test.mjs).
 *
 * The snake's head chases the cursor. If the head touches the cursor, you
 * lose. Boulders block the snake (and the cursor), so the player hides in a
 * boulder's shadow — the snake has to go all the way around.
 */

export const CONFIG = {
  headRadius: 15,
  cursorRadius: 6,
  killDistance: 20,

  // The snake gets a little faster the longer you survive.
  baseSpeed: 125,
  speedRamp: 5.5,
  maxSpeed: 330,

  // ...but it can't turn instantly. That is the whole game: circle it.
  turnRate: 3.4,

  // Body: a trail of points the head leaves behind, sampled at this spacing.
  bodySpacing: 9,
  baseBodyPoints: 12,
  bodyGrowthPerSec: 0.5,
  maxBodyPoints: 55,

  wallMargin: 10,

  startObstacles: 3,
  maxObstacles: 8,
  obstacleInterval: 9,
  obstacleMinRadius: 38,
  obstacleMaxRadius: 85,
  obstacleSpawnMargin: 70, // never spawn closer to the cursor than this
  obstacleSpawnRetry: 40,
};

const TAU = Math.PI * 2;

/** Small deterministic PRNG so tests can seed the boulder layout. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest signed angle from `from` to `to`, in (-π, π]. */
export function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function snakeSpeed(time) {
  return Math.min(CONFIG.maxSpeed, CONFIG.baseSpeed + time * CONFIG.speedRamp);
}

export function bodyPointsFor(time) {
  return Math.min(
    CONFIG.maxBodyPoints,
    CONFIG.baseBodyPoints + Math.floor(time * CONFIG.bodyGrowthPerSec),
  );
}

/**
 * Where the snake starts: the candidate spot farthest from the cursor
 * (centre, corners, edge midpoints).
 */
export function placeHeadAwayFrom(w, h, x, y) {
  const candidates = [
    [w / 2, h / 2],
    [w * 0.15, h * 0.2],
    [w * 0.85, h * 0.2],
    [w * 0.15, h * 0.8],
    [w * 0.85, h * 0.8],
    [w / 2, h * 0.12],
    [w / 2, h * 0.88],
    [w * 0.12, h / 2],
    [w * 0.88, h / 2],
  ];
  let best = candidates[0];
  let bestD = -1;
  for (const [cx, cy] of candidates) {
    const d = Math.hypot(cx - x, cy - y);
    if (d > bestD) {
      bestD = d;
      best = [cx, cy];
    }
  }
  return { x: best[0], y: best[1] };
}

/**
 * Try to place a new boulder somewhere fair: away from the cursor, the head
 * and the whole body, and away from other boulders. Returns true on success.
 */
function trySpawnObstacle(game, rng) {
  const { w, h } = game;
  for (let i = 0; i < CONFIG.obstacleSpawnRetry; i++) {
    const r = CONFIG.obstacleMinRadius + rng() * (CONFIG.obstacleMaxRadius - CONFIG.obstacleMinRadius);
    const m = r + 30;
    const x = m + rng() * (w - 2 * m);
    const y = m + rng() * (h - 2 * m);

    if (Math.hypot(x - game.target.x, y - game.target.y) < r + CONFIG.obstacleSpawnMargin) continue;
    if (Math.hypot(x - game.head.x, y - game.head.y) < r + CONFIG.headRadius + 40) continue;

    let clear = true;
    for (const p of game.trail) {
      if (Math.hypot(x - p.x, y - p.y) < r + 26) {
        clear = false;
        break;
      }
    }
    if (clear) {
      for (const ob of game.obstacles) {
        if (Math.hypot(x - ob.x, y - ob.y) < r + ob.r + 26) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) continue;

    game.obstacles.push({ x, y, r, born: game.time });
    return true;
  }
  return false;
}

/**
 * Create a fresh game.
 *
 * @param {number} w viewport width
 * @param {number} h viewport height
 * @param {object} [opts]
 * @param {() => number} [opts.rng] PRNG (Math.random by default)
 * @param {{x: number, y: number}} [opts.target] where the cursor starts
 */
export function createGame(w, h, opts = {}) {
  const rng = opts.rng || Math.random;
  const game = {
    w,
    h,
    rng,
    time: 0,
    over: false,
    overAt: 0,
    head: { x: w / 2, y: h * 0.85, angle: -Math.PI / 2 },
    target: { x: w / 2, y: h * 0.3 },
    trail: [],
    obstacles: [],
    nextObstacleAt: CONFIG.obstacleInterval,
  };
  if (opts.target) {
    game.target.x = opts.target.x;
    game.target.y = opts.target.y;
  }

  // Start as far from the cursor as the layout allows.
  const spot = placeHeadAwayFrom(w, h, game.target.x, game.target.y);
  game.head.x = spot.x;
  game.head.y = spot.y;

  // Pre-fill the trail straight behind the head so the snake is fully
  // formed from frame one (it only grows from here on).
  for (let i = 1; i <= CONFIG.baseBodyPoints; i++) {
    game.trail.push({
      x: game.head.x - Math.cos(game.head.angle) * i * CONFIG.bodySpacing,
      y: game.head.y - Math.sin(game.head.angle) * i * CONFIG.bodySpacing,
    });
  }

  for (let i = 0; i < CONFIG.startObstacles; i++) trySpawnObstacle(game, rng);
  return game;
}

/**
 * Advance the game by `dt` seconds.
 *
 * @param {object} game from createGame
 * @param {number} dt seconds (clamped to 50ms internally)
 * @param {{x, y}} [target] new cursor position
 */
export function tick(game, dt, target) {
  if (game.over) return;
  dt = Math.min(dt, 0.05);

  if (target) {
    game.target.x = target.x;
    game.target.y = target.y;
  }
  const t = game.target;

  // The cursor can't be inside a boulder either — boulders are solid for
  // everyone. Hiding *in* one would be too easy.
  for (const ob of game.obstacles) {
    const dx = t.x - ob.x;
    const dy = t.y - ob.y;
    const d = Math.hypot(dx, dy);
    const min = ob.r + CONFIG.cursorRadius;
    if (d < min) {
      if (d > 1e-6) {
        t.x = ob.x + (dx / d) * min;
        t.y = ob.y + (dy / d) * min;
      } else {
        t.x = ob.x + min;
      }
    }
  }

  game.time += dt;

  // New boulders pop in over time.
  if (game.obstacles.length < CONFIG.maxObstacles && game.time >= game.nextObstacleAt) {
    if (trySpawnObstacle(game, game.rng)) {
      game.nextObstacleAt = game.time + CONFIG.obstacleInterval;
    } else {
      game.nextObstacleAt = game.time + 2; // no fair spot; retry soon
    }
  }

  const head = game.head;
  const speed = snakeSpeed(game.time);

  // Steer toward the cursor, limited by the turn rate.
  const desired = Math.atan2(t.y - head.y, t.x - head.x);
  const diff = angleDiff(head.angle, desired);
  const maxTurn = CONFIG.turnRate * dt;
  head.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

  let nx = head.x + Math.cos(head.angle) * speed * dt;
  let ny = head.y + Math.sin(head.angle) * speed * dt;

  // Walls: slide along them instead of bouncing.
  const m = CONFIG.wallMargin;
  let slid = false;
  if (nx < m || nx > game.w - m) {
    nx = Math.max(m, Math.min(game.w - m, nx));
    const sy = Math.sign(Math.sin(head.angle)) || (ny < game.h / 2 ? -1 : 1);
    head.angle = sy > 0 ? Math.PI / 2 : -Math.PI / 2;
    slid = true;
  }
  if (!slid && (ny < m || ny > game.h - m)) {
    ny = Math.max(m, Math.min(game.h - m, ny));
    const sx = Math.sign(Math.cos(head.angle)) || (nx < game.w / 2 ? -1 : 1);
    head.angle = sx > 0 ? 0 : Math.PI;
  }

  // Boulders: push the head out, then slide along the rim. Sliding (not
  // bouncing) is what makes "hiding behind a boulder" work — the snake goes
  // around the whole thing.
  for (const ob of game.obstacles) {
    const dx = nx - ob.x;
    const dy = ny - ob.y;
    const d = Math.hypot(dx, dy);
    const min = ob.r + CONFIG.headRadius;
    if (d < min && d > 1e-6) {
      const ux = dx / d;
      const uy = dy / d;
      nx = ob.x + ux * min;
      ny = ob.y + uy * min;

      const vx = Math.cos(head.angle);
      const vy = Math.sin(head.angle);
      const dot = vx * ux + vy * uy;
      if (dot < 0) {
        // Steer strongly toward the rim tangent that matches the way we
        // came in, so the snake wraps the boulder instead of poking it.
        const tx = -uy;
        const ty = ux;
        const s = vx * tx + vy * ty >= 0 ? 1 : -1;
        const tangent = Math.atan2(s * ty, s * tx);
        head.angle += angleDiff(head.angle, tangent) * Math.min(1, 18 * dt);
      }
    }
  }

  head.x = nx;
  head.y = ny;

  // Record the head's path — the body walks this trail backwards.
  const trail = game.trail;
  const last = trail[trail.length - 1];
  if (!last || Math.hypot(head.x - last.x, head.y - last.y) > 2) {
    trail.push({ x: head.x, y: head.y });
  }
  const keep = bodyPointsFor(game.time) * CONFIG.bodySpacing + CONFIG.bodySpacing;
  let acc = 0;
  for (let i = trail.length - 1; i > 0; i--) {
    acc += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
    if (acc > keep) {
      if (i - 1 > 0) trail.splice(0, i - 1);
      break;
    }
  }

  // Did we get you?
  if (Math.hypot(head.x - t.x, head.y - t.y) <= CONFIG.killDistance) {
    game.over = true;
    game.overAt = game.time;
  }
}

/**
 * The body points (head first), each exactly `spacing` px of trail arc from
 * the previous. Used for rendering and by the tests.
 */
export function sampleBody(game, spacing = CONFIG.bodySpacing) {
  const n = bodyPointsFor(game.time);
  const pts = [{ x: game.head.x, y: game.head.y }];
  const trail = game.trail;

  let i = trail.length - 1;
  let px = game.head.x;
  let py = game.head.y;
  let rem = spacing;

  for (let k = 0; k < n; k++) {
    while (i >= 0) {
      const tx = trail[i].x;
      const ty = trail[i].y;
      const segLen = Math.hypot(tx - px, ty - py);
      if (segLen <= rem) {
        px = tx;
        py = ty;
        rem -= segLen;
        i--;
      } else {
        const f = rem / segLen;
        px += (tx - px) * f;
        py += (ty - py) * f;
        break;
      }
    }
    pts.push({ x: px, y: py });
    rem = spacing;
  }
  return pts;
}
