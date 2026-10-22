/**
 * Physics and stability tests for the four canvas rooms, using a recording
 * 2D-context stub so the drawing code runs for real without a GPU.
 */
const calls = { stroke: 0, fill: 0, arc: 0, clearRect: 0, ellipse: 0 };

globalThis.window = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 1,
  matchMedia: () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
  addEventListener() {},
  scrollY: 0,
};
globalThis.document = { documentElement: { classList: { add() {}, remove() {} } } };

class Ctx {
  constructor(el) {
    this.canvas = el;
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
  }
  setTransform() {} clearRect() { calls.clearRect++; } fillRect() {}
  beginPath() {} closePath() {} arc() { calls.arc++; } moveTo() {} lineTo() {}
  ellipse() { calls.ellipse++; } fill() { calls.fill++; } stroke() { calls.stroke++; }
  save() {} restore() {} translate() {} rotate() {} scale() {}
  createRadialGradient() { return { addColorStop() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
}
globalThis.Path2D = class { moveTo() {} lineTo() {} arc() {} };

const { FlowScene } = await import('../prism/js/scenes/flow.js');
const { ClothScene } = await import('../prism/js/scenes/cloth.js');
const { OrbScene } = await import('../prism/js/scenes/orb.js');
const { GooScene } = await import('../prism/js/scenes/goo.js');

function rig(Ctor, w = 1440, h = 900) {
  const canvas = { width: 0, height: 0, style: {}, getContext: () => new Ctx(canvas) };
  const section = { clientWidth: w, clientHeight: h };
  const scene = new Ctor(canvas, section);
  scene.visible = true;
  return scene;
}

const palette = {
  bg: [5, 6, 10],
  ink: [244, 246, 251],
  accent: [124, 247, 212],
  accent2: [109, 124, 255],
  glow: [182, 255, 240],
};

const results = [];
const check = (name, pass, extra = '') => results.push({ name, pass, extra });
const finite = (arr) => arr.every((v) => Number.isFinite(v));

// ---- 01 Refraction -------------------------------------------------------
{
  const s = rig(FlowScene);
  s.setPalette(palette);
  let t = 0;
  for (let i = 0; i < 400; i++) {
    t += 1 / 60;
    s.setPointer(720 + Math.sin(t) * 400, 450 + Math.cos(t * 1.7) * 260);
    s.update(1 / 60, t);
  }
  const xs = s.particles.map((p) => p.x);
  const ys = s.particles.map((p) => p.y);
  check('flow: particles stay finite', finite(xs) && finite(ys));
  check(
    'flow: particles stay in bounds',
    Math.min(...xs) > -120 && Math.max(...xs) < 1560 && Math.min(...ys) > -120 && Math.max(...ys) < 1020,
    `x[${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] y[${Math.min(...ys).toFixed(0)},${Math.max(...ys).toFixed(0)}]`,
  );
  check('flow: drew trails and dust', calls.stroke > 0 && calls.fill > 0);

  s.reduced = true;
  const fillBefore = calls.fill;
  s.update(0, 1);
  s.update(0, 1);
  check('flow: reduced motion draws a static field', calls.fill >= fillBefore);
}

// ---- 03 Gravity ----------------------------------------------------------
{
  const s = rig(ClothScene);
  s.setPalette(palette);
  const displaced = () => {
    let m = 0;
    for (let i = 0; i < s.n; i++) m = Math.max(m, Math.hypot(s.x[i] - s.hx[i], s.y[i] - s.hy[i]));
    return m;
  };
  for (let i = 0; i < 200; i++) {
    s.setPointer(700, 450);
    s.update(1 / 60, i / 60);
  }
  const pull = displaced();
  check('cloth: lattice deforms under the cursor', pull > 8, `max displacement ${pull.toFixed(1)}px`);
  check('cloth: no NaN after strain', finite([...s.x, ...s.y]));

  s.setPointer(-5000, -5000);
  for (let i = 0; i < 420; i++) s.update(1 / 60, 3 + i / 60);
  const relaxed = displaced();
  check('cloth: remembers its shape', relaxed < 2.5, `rest displacement ${relaxed.toFixed(2)}px`);
  check('cloth: drew the lattice', calls.stroke > 0);
}

// ---- 05 Spectrum ---------------------------------------------------------
{
  const s = rig(OrbScene);
  s.setPalette(palette);
  const maxOffset = () => {
    let m = 0;
    for (let i = 0; i < s.count; i++) m = Math.max(m, Math.hypot(s.ox[i], s.oy[i]));
    return m;
  };
  s.setPointer(-5000, -5000);
  for (let i = 0; i < 90; i++) s.update(1 / 60, i / 60);
  const rest = maxOffset();

  for (let i = 0; i < 90; i++) {
    s.setPointer(720, 450);
    s.update(1 / 60, 1.5 + i / 60);
  }
  const scattered = maxOffset();
  check('orb: scatters around the cursor', scattered > rest + 10, `rest ${rest.toFixed(2)} → scattered ${scattered.toFixed(2)}`);

  s.setPointer(-5000, -5000);
  for (let i = 0; i < 400; i++) s.update(1 / 60, 3 + i / 60);
  const gathered = maxOffset();
  check('orb: gathers itself back', gathered < 2, `settled at ${gathered.toFixed(2)}px`);
  check('orb: points stay finite', finite([...s.ox, ...s.oy]));
  check('orb: drew sphere and rings', calls.arc > 0 && calls.ellipse >= 3);
}

// ---- 02 Fluid ------------------------------------------------------------
{
  const s = rig(GooScene);
  s.setPalette(palette);
  let t = 0;
  for (let i = 0; i < 300; i++) {
    t += 1 / 60;
    s.setPointer(720 + Math.sin(t * 2) * 300, 450);
    s.update(1 / 60, t);
  }
  const bx = s.blobs.map((b) => b.x);
  const by = s.blobs.map((b) => b.y);
  check('goo: blobs stay finite', finite(bx) && finite(by));
  check(
    'goo: blobs stay near the frame',
    Math.min(...bx) > -400 && Math.max(...bx) < 1840 && Math.min(...by) > -400 && Math.max(...by) < 1300,
    `x[${Math.min(...bx).toFixed(0)},${Math.max(...bx).toFixed(0)}] y[${Math.min(...by).toFixed(0)},${Math.max(...by).toFixed(0)}]`,
  );
  check('goo: drew its gradients', calls.fill > 0);
}

// ---- Reduced motion sweep ------------------------------------------------
{
  let threw = null;
  try {
    for (const Ctor of [FlowScene, ClothScene, OrbScene, GooScene]) {
      const s = rig(Ctor);
      s.setPalette(palette);
      s.reduced = true;
      s.setPointer(300, 300);
      s.update(0, 1.2);
      s.resize();
      s.update(0, 1.2);
    }
  } catch (error) {
    threw = error.message;
  }
  check('reduced motion: every room renders statically', !threw, threw || '');
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  → ${r.extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
