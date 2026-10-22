/**
 * snake — browser glue: canvas rendering, input, HUD.
 * All game rules live in ./snake/logic.mjs (tested headlessly).
 */
import {
  createGame,
  tick,
  sampleBody,
  CONFIG,
} from './snake/logic.mjs';

const TAU = Math.PI * 2;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const timeEl = document.getElementById('time');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const finalEl = document.getElementById('final-time');
const cardBestEl = document.getElementById('card-best');

const BEST_KEY = 'cool.snake.best';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const C = {
  bg: '#fff7ea',
  snake: '#7cc65b',
  snakeStripe: '#93d573',
  snakeDark: '#4e9a3c',
  spot: '#5fae47',
  rock: '#c9d2d9',
  rockDark: '#9aa7b1',
  rockLight: '#e9eef2',
  cursor: '#ffb84d',
  cursorDark: '#e08f1f',
  ink: '#26221c',
  tongue: '#ff7b9c',
};

let W = 0;
let H = 0;
let game = null;
let cursor = { x: 0, y: 0, seen: false };
let best = Number(localStorage.getItem(BEST_KEY)) || 0;
let last = 0;
let lastTimeText = '';
let lastBestText = '';

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (game) {
    game.w = W;
    game.h = H;
    const m = CONFIG.wallMargin;
    game.head.x = Math.max(m, Math.min(W - m, game.head.x));
    game.head.y = Math.max(m, Math.min(H - m, game.head.y));
  }
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, '0')}`;
}

function newGame() {
  const target = cursor.seen
    ? { x: cursor.x, y: cursor.y }
    : { x: W / 2, y: H * 0.3 };
  game = createGame(W, H, { target });
  overlay.hidden = true;
  overlay.classList.remove('is-in');
}

function showOverlay() {
  const t = game.overAt;
  finalEl.textContent = fmt(t);
  const isBest = t > best;
  if (isBest) {
    best = t;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch {
      /* private mode etc. */
    }
  }
  cardBestEl.textContent = isBest ? '🎉 new best!' : `best ${fmt(best)}`;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('is-in'));
}

/* --- input ---------------------------------------------------------------- */

window.addEventListener('mousemove', (e) => {
  cursor.x = e.clientX;
  cursor.y = e.clientY;
  cursor.seen = true;
});

overlay.addEventListener('click', () => newGame());
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') newGame();
});

/* --- drawing --------------------------------------------------------------- */

function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function easeOutBack(k) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
}

function drawBackground() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.45,
    W / 2, H / 2, Math.max(W, H) * 0.78,
  );
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(90,60,20,0.06)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawRocks() {
  for (const ob of game.obstacles) {
    const k = Math.min(1, (game.time - ob.born) / 0.4);
    const r = ob.r * easeOutBack(k);
    if (r <= 1) continue;

    ctx.fillStyle = 'rgba(80,60,30,0.10)';
    ctx.beginPath();
    ctx.ellipse(ob.x + 4, ob.y + r * 0.5 + 6, r * 0.95, r * 0.45, 0, 0, TAU);
    ctx.fill();

    circle(ob.x, ob.y, r);
    ctx.fillStyle = C.rock;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.rockDark;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(ob.x - r * 0.25, ob.y - r * 0.35, r * 0.42, r * 0.26, -0.35, 0, TAU);
    ctx.fill();
  }
}

function drawSnake(wallT) {
  const pts = sampleBody(game);
  const n = pts.length;
  const headW = CONFIG.headRadius * 2;
  const tailW = 8;

  // A gentle slither: each body point is offset sideways by a travelling
  // sine (rendering only — collisions use the true path).
  const off = new Array(n);
  const phase = game.time * 10;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i === 0 || n === 1) {
      off[i] = p;
      continue;
    }
    const prev = pts[i - 1];
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const amp = reduceMotion ? 0 : 5.5 * (i / (n - 1));
    const w = Math.sin(phase - i * 0.55) * amp;
    off[i] = { x: p.x + nx * w, y: p.y + ny * w };
  }

  const widthAt = (i) => headW - (headW - tailW) * ((i - 1) / Math.max(1, n - 1));

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outline pass, then body pass — tail first so the neck overlaps the tail.
  for (let i = n - 1; i >= 1; i--) {
    ctx.strokeStyle = C.snakeDark;
    ctx.lineWidth = widthAt(i) + 5;
    ctx.beginPath();
    ctx.moveTo(off[i].x, off[i].y);
    ctx.lineTo(off[i - 1].x, off[i - 1].y);
    ctx.stroke();
  }
  for (let i = n - 1; i >= 1; i--) {
    ctx.strokeStyle = i % 6 < 3 ? C.snake : C.snakeStripe;
    ctx.lineWidth = widthAt(i);
    ctx.beginPath();
    ctx.moveTo(off[i].x, off[i].y);
    ctx.lineTo(off[i - 1].x, off[i - 1].y);
    ctx.stroke();
  }

  // Spots.
  ctx.fillStyle = C.spot;
  for (let i = 5; i < n - 1; i += 5) {
    circle(off[i].x, off[i].y, Math.max(1.5, widthAt(i) * 0.16));
    ctx.fill();
  }

  drawHead(wallT);
}

function drawHead(wallT) {
  const { x, y, angle: a } = game.head;
  const ex = Math.cos(a);
  const ey = Math.sin(a);
  const px = -ey;
  const py = ex;

  // Head: a slightly egg-shaped blob pointing where it's going.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.ellipse(2, 0, CONFIG.headRadius + 4.5, CONFIG.headRadius - 1, 0, 0, TAU);
  ctx.fillStyle = C.snake;
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = C.snakeDark;
  ctx.stroke();
  ctx.restore();

  // Eyes (pupils squint toward the cursor).
  for (const s of [-1, 1]) {
    const cx = x + ex * 4 + px * s * 8;
    const cy = y + ey * 4 + py * s * 8;
    if (game.over) {
      // ×_×
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
      ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4);
      ctx.stroke();
      continue;
    }
    const blink = !reduceMotion && wallT % 3.4 < 0.13;
    if (blink) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy);
      ctx.lineTo(cx + 4, cy);
      ctx.stroke();
      continue;
    }
    circle(cx, cy, 5.5);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(38,34,28,0.35)';
    ctx.stroke();
    circle(cx + ex * 2, cy + ey * 2, 2.9);
    ctx.fillStyle = C.ink;
    ctx.fill();
  }

  if (!game.over) {
    // Smile.
    ctx.strokeStyle = C.snakeDark;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x + ex * 12, y + ey * 12, 6, a - 0.65, a + 0.65);
    ctx.stroke();

    // Tongue flick.
    if (!reduceMotion && wallT % 2.7 < 0.35) {
      const bx = x + ex * 17;
      const by = y + ey * 17;
      ctx.strokeStyle = C.tongue;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      const tx = x + ex * 26;
      const ty = y + ey * 26;
      ctx.lineTo(tx, ty);
      for (const s of [-0.55, 0.55]) {
        const ca = Math.cos(a + s);
        const sa = Math.sin(a + s);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + ca * 5, ty + sa * 5);
      }
      ctx.stroke();
    }
  }
}

function drawCursor(wallT) {
  if (!cursor.seen) return;
  const { x, y } = cursor;
  const pulse = reduceMotion ? 0 : Math.sin(wallT * 4) * 2;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(224,143,31,0.45)';
  circle(x, y, 11 + pulse);
  ctx.stroke();
  circle(x, y, 6);
  ctx.fillStyle = C.cursor;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = C.cursorDark;
  ctx.stroke();
  circle(x - 1.5, y - 1.5, 2.2);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function draw(wallT) {
  drawBackground();
  if (!game) return;
  drawRocks();
  drawSnake(wallT);
  drawCursor(wallT);
}

/* --- HUD -------------------------------------------------------------------- */

function updateHud() {
  if (!game) return;
  const t = fmt(game.over ? game.overAt : game.time);
  if (t !== lastTimeText) {
    timeEl.textContent = t;
    lastTimeText = t;
  }
  const b = `best ${fmt(best)}`;
  if (b !== lastBestText) {
    bestEl.textContent = b;
    lastBestText = b;
  }
}

/* --- main loop ---------------------------------------------------------------- */

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;

  if (!document.hidden) {
    if (game && !game.over) {
      tick(game, dt, cursor.seen ? cursor : game.target);
      if (game.over) showOverlay();
    }
  }
  draw(now / 1000);
  updateHud();
}

/* --- boot ------------------------------------------------------------------------ */

resize();
window.addEventListener('resize', resize);
newGame();
requestAnimationFrame((now) => {
  last = now;
  requestAnimationFrame(frame);
});

// A tiny debug hook for the headless test.
window.__SNAKE__ = {
  get game() {
    return game;
  },
  newGame,
  forceCursor: (x, y) => {
    cursor.x = x;
    cursor.y = y;
    cursor.seen = true;
  },
};
