/**
 * Full boot simulation in jsdom: mounts the real document, stubs canvas/WebGL,
 * and walks all six rooms watching the palette, rail, loader and errors.
 *
 * WebGL is deliberately unavailable here — the test also proves the graceful
 * fallback path (CSS sky) never blocks the boot.
 */
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('SKIP  boot test — run `npm install` to install jsdom.');
  process.exit(0);
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:4173/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const { window } = dom;
const doc = window.document;

// --- browser globals ------------------------------------------------------
globalThis.window = window;
globalThis.document = doc;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.MouseEvent = window.MouseEvent;
globalThis.history = window.history;
globalThis.location = window.location;
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const noop = () => {};
class MockCtx {
  constructor() {
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
  }
  setTransform() {} clearRect() {} fillRect() {} beginPath() {} closePath() {}
  arc() {} moveTo() {} lineTo() {} ellipse() {} fill() {} stroke() {}
  save() {} restore() {} translate() {} rotate() {} scale() {}
  createRadialGradient() { return { addColorStop: noop }; }
  createLinearGradient() { return { addColorStop: noop }; }
}
globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} };

window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type === '2d') return new MockCtx();
  return null; // no WebGL: the sky must degrade to CSS
};

window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: noop,
  removeEventListener: noop,
  addListener: noop,
  removeListener: noop,
  dispatchEvent: () => false,
});

let scrollY = 0;
Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
Object.defineProperty(window, 'pageYOffset', { get: () => scrollY, configurable: true });
window.scrollTo = (x, y) => {
  if (typeof x === 'object' && x) scrollY = x.top || 0;
  else scrollY = y || 0;
  window.dispatchEvent(new window.Event('scroll'));
};

globalThis.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
  unobserve() {}
  disconnect() {}
};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

// jsdom has no layout engine: give the rooms believable geometry.
const sections = [...doc.querySelectorAll('.scene')];
sections.forEach((el, i) => {
  const top = i * 900;
  for (const [prop, value] of [['clientHeight', 900], ['clientWidth', 1440], ['offsetHeight', 900]]) {
    Object.defineProperty(el, prop, { get: () => value });
  }
  el.getBoundingClientRect = () => ({
    top: top - scrollY, left: 0, width: 1440, height: 900,
    bottom: top - scrollY + 900, right: 1440, x: 0, y: top - scrollY,
  });
});
Object.defineProperty(doc.documentElement, 'scrollHeight', {
  get: () => 900 * sections.length,
  configurable: true,
});

// --- capture errors instead of drowning the output ------------------------
const warnings = [];
const errors = [];
const realWarn = console.warn;
const realError = console.error;
const capture = (bucket) => (...args) => {
  const message = args.map(String).join(' ');
  bucket.push(message);
  if (!/WebGL unavailable/.test(message)) realWarn.call(console, `captured: ${message}`);
};
console.warn = capture(warnings);
console.error = capture(errors);
process.on('uncaughtException', (error) => errors.push(`uncaught: ${error.stack || error.message}`));
process.on('unhandledRejection', (error) => errors.push(`rejected: ${(error && error.stack) || error}`));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
const check = (name, pass, extra = '') => results.push({ name, pass, extra });

// --- boot -----------------------------------------------------------------
doc.documentElement.classList.remove('no-js');
doc.documentElement.classList.add('js');
try {
  await import(pathToFileURL(`${ROOT}/js/main.js`).href);
} catch (error) {
  errors.push(`import failed: ${error.stack || error.message}`);
}

await sleep(500);
const api = window.__PRISM__;
check('boots and exposes its debug API', Boolean(api));
check('six rooms found', api?.state.sections === 6, String(api?.state.sections));
check('four canvas engines mounted', api?.state.scenes === 4, String(api?.state.scenes));

// Pointer + wheel
window.dispatchEvent(new window.MouseEvent('pointermove', { clientX: 700, clientY: 400, bubbles: true }));
await sleep(120);
const wheel = new window.Event('wheel', { bubbles: true, cancelable: true });
Object.defineProperty(wheel, 'deltaY', { value: 600 });
Object.defineProperty(wheel, 'deltaMode', { value: 0 });
check('smooth scroll captures the wheel', !window.dispatchEvent(wheel));
await sleep(900);
check('scroll advances', window.scrollY > 20, `scrollY=${window.scrollY}`);

// Walk the six rooms
const rooms = [];
for (let i = 0; i < 6; i++) {
  window.scrollTo(0, i * 900);
  await sleep(1250);
  rooms.push({
    scene: doc.body.dataset.scene,
    day: doc.body.dataset.day,
    rail: [...doc.querySelectorAll('.rail__list a')].map((a) => a.getAttribute('aria-current')),
  });
}
const expected = ['aperture', 'refraction', 'fluid', 'gravity', 'rhythm', 'spectrum'];
check('palette follows every room', rooms.every((r, i) => r.scene === expected[i]),
  rooms.map((r, i) => `${i}:${r.scene}`).join(' '));
check('rail marks exactly the active chapter',
  rooms.every((r, i) => r.rail.filter(Boolean).length === 1 && r.rail[i] === 'true'));
check('daylight room flips to paper and back', rooms[4].day === 'true' && rooms[5].day === 'false');

// Controls
doc.getElementById('scramble')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
doc.getElementById('sound-2')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
doc.getElementById('replay')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(300);

await sleep(1800);
check('loader dismisses', doc.getElementById('loader')?.classList.contains('is-done') === true);
check('page marked ready', doc.body.classList.contains('is-ready'));
check('palette applied to CSS', doc.documentElement.style.getPropertyValue('--accent').startsWith('rgb'));
check('no uncaught errors', errors.length === 0, errors.slice(0, 2).join(' | '));

console.warn = realWarn;
console.error = realError;

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  → ${r.extra}` : ''}`);
}
if (warnings.length) console.log(`\nwarnings: ${[...new Set(warnings)].join(' | ')}`);
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
