/**
 * Snake tests: the whole game is verified headlessly, without a browser.
 *
 * Part 1 runs the pure logic (js/snake/logic.mjs) directly in Node:
 * chasing, killing, dodging, boulder blocking, walls, body, spawning.
 * Part 2 boots the real page in jsdom (skipped when jsdom is not installed)
 * and plays a full round: chase → death → overlay → click-to-restart.
 */
import {
  createGame,
  tick,
  sampleBody,
  bodyPointsFor,
  snakeSpeed,
  placeHeadAwayFrom,
  mulberry32,
  CONFIG,
} from '../js/snake/logic.mjs';

const results = [];
const check = (name, pass, extra = '') => results.push({ name, pass, extra });
const finite = (v) => Number.isFinite(v);

/* ============================== part 1: logic ============================= */

// 1. A stationary cursor gets eaten.
{
  const g = createGame(1440, 900, { rng: mulberry32(42) });
  for (let i = 0; i < 60 * 30; i++) tick(g, 1 / 60);
  check('stationary cursor is caught', g.over === true, `over=${g.over} t=${g.time.toFixed(1)}`);
  check('death arrives in reasonable time', g.overAt > 1 && g.overAt < 25, `overAt=${g.overAt.toFixed(1)}s`);
  check('head position is finite at death', finite(g.head.x) && finite(g.head.y), `(${g.head.x}, ${g.head.y})`);
}

// 2. A dodging cursor survives forever — moving is the "thing to do to not
//    die". Strategy: keep the cursor directly across the middle of the
//    screen from the snake's head. The head is then always at least R px
//    from the cursor (even after boulder push-outs), so death is provably
//    impossible — and the two-minute soak also exercises walls and boulders.
{
  const g = createGame(1440, 900, { rng: mulberry32(7) });
  const cx = 720;
  const cy = 450;
  const R = 200;
  let minGap = Infinity;
  let broke = false;
  for (let i = 0; i < 60 * 120; i++) {
    const dx = g.head.x - cx;
    const dy = g.head.y - cy;
    const d = Math.hypot(dx, dy);
    const target = d > 1e-6
      ? { x: cx - (dx / d) * R, y: cy - (dy / d) * R }
      : { x: cx + R, y: cy };
    tick(g, 1 / 60, target);
    if (!finite(g.head.x) || !finite(g.head.y)) {
      broke = true;
      break;
    }
    minGap = Math.min(minGap, Math.hypot(g.head.x - g.target.x, g.head.y - g.target.y));
  }
  check('a dodging cursor survives two minutes', g.over === false && !broke,
    g.over ? `caught at ${g.overAt.toFixed(1)}s` : `t=${g.time.toFixed(0)}s`);
  check('the dodger always keeps its distance', minGap > CONFIG.killDistance,
    `minGap=${minGap.toFixed(0)}px`);
}

// 3. A boulder is solid: the snake wraps around, never enters, and still
//    reaches a stationary target on the far side.
{
  const g = createGame(1440, 900, { rng: mulberry32(3) });
  g.obstacles.length = 0;
  g.nextObstacleAt = Infinity;
  const ob = { x: 720, y: 450, r: 80, born: 0 };
  g.obstacles.push(ob);
  g.head.x = 300;
  g.head.y = 450;
  g.head.angle = 0;
  g.trail.length = 0;
  g.trail.push({ x: 300, y: 450 });

  let minDist = Infinity;
  for (let i = 0; i < 60 * 30; i++) {
    tick(g, 1 / 60, { x: 1140, y: 450 });
    minDist = Math.min(minDist, Math.hypot(g.head.x - ob.x, g.head.y - ob.y));
  }
  check('snake never enters a boulder', minDist >= ob.r + CONFIG.headRadius - 1,
    `minDist=${minDist.toFixed(1)} (surface at ${(ob.r + CONFIG.headRadius).toFixed(1)})`);
  check('snake goes around and reaches the target', g.over || g.head.x > 900,
    `headX=${g.head.x.toFixed(0)}`);
}

// 4. The cursor is solid against boulders too — you can't camp inside one.
{
  const g = createGame(1440, 900, { rng: mulberry32(11) });
  g.obstacles.length = 0;
  g.nextObstacleAt = Infinity;
  g.obstacles.push({ x: 720, y: 450, r: 80, born: 0 });
  tick(g, 1 / 60, { x: 720, y: 450 });
  const d = Math.hypot(g.target.x - 720, g.target.y - 450);
  check('cursor is pushed out of boulders', Math.abs(d - (80 + CONFIG.cursorRadius)) < 1,
    `d=${d.toFixed(1)}`);
}

// 5. The body is a trail behind the head at even spacing, and it grows.
{
  const g = createGame(1200, 800, { rng: mulberry32(5) });
  g.obstacles.length = 0;
  g.nextObstacleAt = Infinity;
  let t = 0;
  for (let i = 0; i < 600; i++) {
    t += 1 / 60;
    tick(g, 1 / 60, { x: 600 + Math.cos(t * 2.5) * 220, y: 400 + Math.sin(t * 2.5) * 200 });
  }
  const pts = sampleBody(g); // head + one point per body segment
  check('body has the expected point count', pts.length === bodyPointsFor(g.time) + 1,
    `n=${pts.length}, expected ${bodyPointsFor(g.time) + 1}`);
  const gaps = [];
  for (let i = 1; i < pts.length; i++) {
    gaps.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  check('body spacing is even', avg > CONFIG.bodySpacing * 0.9 && avg < CONFIG.bodySpacing * 1.1,
    `avg=${avg.toFixed(2)}px`);
  check('snake grows over time', bodyPointsFor(60) > bodyPointsFor(0),
    `${bodyPointsFor(0)} → ${bodyPointsFor(60)} points`);
  check('snake speeds up, then caps', snakeSpeed(60) > snakeSpeed(0) && snakeSpeed(9999) === CONFIG.maxSpeed);
}

// 6. Boulders always spawn in fair places — never on the cursor, the head,
//    the body or another boulder.
{
  const g = createGame(1440, 900, { rng: mulberry32(99) });
  // Give the snake a long body first.
  let t = 0;
  for (let i = 0; i < 60 * 8; i++) {
    t += 1 / 60;
    tick(g, 1 / 60, { x: 720 + Math.sin(t * 1.9) * 420, y: 450 + Math.sin(t * 2.7) * 260 });
  }
  let violation = '';
  let spawned = 0;
  for (let i = 0; i < 40 && !violation; i++) {
    g.nextObstacleAt = 0;
    const before = g.obstacles.length;
    tick(g, 1 / 60, { x: 200 + ((i * 53) % 900), y: 200 + ((i * 97) % 500) });
    for (let k = before; k < g.obstacles.length; k++) {
      const ob = g.obstacles[k];
      if (Math.hypot(ob.x - g.target.x, ob.y - g.target.y) < ob.r + CONFIG.obstacleSpawnMargin - 1) {
        violation = 'cursor';
        break;
      }
      if (Math.hypot(ob.x - g.head.x, ob.y - g.head.y) < ob.r + CONFIG.headRadius + 30 - 1) {
        violation = 'head';
        break;
      }
      for (const p of g.trail) {
        if (Math.hypot(ob.x - p.x, ob.y - p.y) < ob.r + 25) {
          violation = 'body';
          break;
        }
      }
      if (violation) break;
      for (const other of g.obstacles) {
        if (other === ob) continue;
        if (Math.hypot(ob.x - other.x, ob.y - other.y) < ob.r + other.r + 25) {
          violation = 'overlap';
          break;
        }
      }
      if (violation) break;
      spawned++;
    }
  }
  check('boulders spawn clear of cursor, head, body and each other',
    !violation && spawned >= 3, violation ? `violation: ${violation}` : `spawned=${spawned}`);
}

// 7. The snake can never leave the screen, even while pinning a wall.
{
  const g = createGame(800, 500, { rng: mulberry32(1) });
  g.obstacles.length = 0;
  g.nextObstacleAt = Infinity;
  let inside = true;
  for (let i = 0; i < 1800; i++) {
    tick(g, 1 / 60, { x: 6, y: 250 });
    const m = CONFIG.wallMargin - 0.5;
    if (g.head.x < m - 0.5 || g.head.x > 800 - m + 0.5 ||
        g.head.y < m - 0.5 || g.head.y > 500 - m + 0.5) {
      inside = false;
      break;
    }
  }
  check('snake stays inside the walls', inside,
    `head=(${g.head.x.toFixed(1)}, ${g.head.y.toFixed(1)})`);
}

// 8. Seeded games are reproducible, and the snake starts far from the cursor.
{
  const a = createGame(1440, 900, { rng: mulberry32(1234) });
  const b = createGame(1440, 900, { rng: mulberry32(1234) });
  const same = a.obstacles.length === b.obstacles.length &&
    a.obstacles.every((o, i) => o.x === b.obstacles[i].x && o.y === b.obstacles[i].y && o.r === b.obstacles[i].r);
  check('seeded games spawn identical boulders', same);
  const p = placeHeadAwayFrom(1440, 900, 70, 50);
  check('head starts far from the cursor', Math.hypot(p.x - 70, p.y - 50) > 400,
    `d=${Math.hypot(p.x - 70, p.y - 50).toFixed(0)}px`);
}

// 9. After death the game is inert — no further ticks, no movement.
{
  const g = createGame(1440, 900, { rng: mulberry32(42) });
  for (let i = 0; i < 60 * 30 && !g.over; i++) tick(g, 1 / 60);
  const x = g.head.x;
  const y = g.head.y;
  const t0 = g.time;
  for (let i = 0; i < 60; i++) tick(g, 1 / 60);
  check('dead game freezes', g.over && g.head.x === x && g.head.y === y && g.time === t0);
}

/* =========================== part 2: jsdom boot ============================ */

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

if (JSDOM) {
  const fs = await import('node:fs');
  import('node:path');
  const { pathToFileURL } = await import('node:url');

  const noop = () => {};
  class MockCtx {
    constructor() {
      this.globalAlpha = 1;
      this.globalCompositeOperation = 'source-over';
      this.fillStyle = '#000';
      this.strokeStyle = '#000';
      this.lineWidth = 1;
      this.lineCap = 'butt';
      this.lineJoin = 'miter';
    }
    setTransform() {} clearRect() {} fillRect() {} beginPath() {} closePath() {}
    arc() {} moveTo() {} lineTo() {} ellipse() {} fill() {} stroke() {}
    save() {} restore() {} translate() {} rotate() {} scale() {}
    createRadialGradient() { return { addColorStop: noop }; }
    createLinearGradient() { return { addColorStop: noop }; }
  }

  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:4173/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const doc = window.document;

  globalThis.window = window;
  globalThis.document = doc;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Event = window.Event;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.localStorage = window.localStorage;
  globalThis.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener: noop,
    removeEventListener: noop,
  });

  window.HTMLCanvasElement.prototype.getContext = function (type) {
    return type === '2d' ? new MockCtx() : null;
  };

  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  process.on('uncaughtException', (e) => errors.push(`uncaught: ${e.stack || e.message}`));
  process.on('unhandledRejection', (e) => errors.push(`rejected: ${(e && e.stack) || e}`));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    await import(pathToFileURL(new URL('../js/snake.js', import.meta.url).pathname).href);
  } catch (error) {
    errors.push(`import failed: ${error.stack || error.message}`);
  }

  await sleep(700);
  const snake = window.__SNAKE__;
  check('page boots and exposes its debug hook', Boolean(snake));
  const g0 = snake?.game;
  check('a game is running on load', Boolean(g0) && !g0.over,
    g0 ? `head=(${g0.head.x.toFixed(0)}, ${g0.head.y.toFixed(0)})` : 'no game');
  check('canvas is sized to the viewport', doc.getElementById('game').width > 0 &&
    doc.getElementById('game').height > 0,
    `${doc.getElementById('game').width}×${doc.getElementById('game').height}`);
  check('HUD shows time and best',
    doc.getElementById('time').textContent === '0:00' && doc.getElementById('best').textContent === 'best 0:00',
    `${doc.getElementById('time').textContent} / ${doc.getElementById('best').textContent}`);

  // Let it run a bit, steering with the real mouse event.
  window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 700, clientY: 300, bubbles: true }));
  await sleep(800);
  const g1 = snake?.game;
  check('game runs and the clock ticks', g1 && g1.time > 0.4, `t=${g1 ? g1.time.toFixed(2) : '–'}s`);

  // Send the cursor straight onto the head → death → overlay.
  if (g1) snake.forceCursor(g1.head.x, g1.head.y);
  await sleep(700);
  check('touching the cursor ends the game', g1.over === true, `overAt=${g1.overAt.toFixed(1)}s`);
  const overlayEl = doc.getElementById('overlay');
  check('game-over card appears', overlayEl.hidden === false, `hidden=${overlayEl.hidden}`);
  check('best time is stored', (Number(window.localStorage.getItem('cool.snake.best')) || 0) >= g1.overAt - 0.01);

  // Click the card → fresh game.
  overlayEl.click();
  await sleep(120);
  const g2 = snake?.game;
  check('click restarts a new game', Boolean(g2) && g2 !== g1 && !g2.over && g2.time < 1);
  check('no uncaught errors during the whole round', errors.length === 0, errors.slice(0, 2).join(' | '));
} else {
  console.log('SKIP  dom smoke test — run `npm install` to install jsdom.');
}

/* ================================ summary ================================= */

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra && !r.pass ? `  → ${r.extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
