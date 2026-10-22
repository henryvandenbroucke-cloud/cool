/**
 * 05 Spectrum — a particle sphere that scatters around your cursor
 * and gathers itself back together when you leave it alone.
 */
import { CanvasScene } from './base.js';
import { rand, clamp, damp, TAU, mixRgb } from '../core/utils.js';

export class OrbScene extends CanvasScene {
  constructor(canvas, section) {
    super(canvas, section, { maxPixels: 1_900_000, maxDpr: 1.6 });
    if (this.disabled) return;
    this.energy = 0;
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.build();
  }

  build() {
    const count = this.w < 720 ? 900 : 1600;
    this.count = count;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.tint = new Uint8Array(count);
    this.ox = new Float32Array(count);
    this.oy = new Float32Array(count);
    this.ovx = new Float32Array(count);
    this.ovy = new Float32Array(count);

    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      this.px[i] = Math.cos(theta) * r;
      this.py[i] = y;
      this.pz[i] = Math.sin(theta) * r;
      this.tint[i] = Math.random() < 0.22 ? 2 : Math.random() < 0.5 ? 0 : 1;
    }
  }

  onResize() {
    if (this.px) this.build();
  }

  setEnergy(value) {
    this.energy = clamp(value, 0, 1);
  }

  update(dt, time) {
    if (this.disabled) return;
    const { ctx, w, h, pointer } = this;
    this.time = time;
    const t = time;

    const step = this.reduced ? 0 : Math.min(dt, 1 / 30);
    const nx = (pointer.x / w - 0.5) * 2;
    const ny = (pointer.y / h - 0.5) * 2;
    this.tilt.tx = clamp(nx, -1, 1) * 0.5;
    this.tilt.ty = clamp(ny, -1, 1) * 0.32;
    this.tilt.x = damp(this.tilt.x, this.tilt.tx, 4, Math.max(step, 0.0001));
    this.tilt.y = damp(this.tilt.y, this.tilt.ty, 4, Math.max(step, 0.0001));

    const rotY = t * 0.17 + this.tilt.x;
    const rotX = -0.16 + this.tilt.y;
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const sinX = Math.sin(rotX);
    const cosX = Math.cos(rotX);

    const cx = w / 2;
    const cy = h * 0.5;
    const baseR = Math.min(w, h) * 0.315 * (1 + this.energy * 0.035);
    const fov = 3.0;

    const buckets = [[], [], [], []];
    const mx = pointer.x;
    const my = pointer.y;
    const scatterR = 165;

    for (let i = 0; i < this.count; i++) {
      const x0 = this.px[i];
      const y0 = this.py[i];
      const z0 = this.pz[i];

      const x1 = x0 * cosY + z0 * sinY;
      const z1 = -x0 * sinY + z0 * cosY;
      const y2 = y0 * cosX - z1 * sinX;
      const z2 = y0 * sinX + z1 * cosX;

      const persp = fov / (fov - z2);
      let sx = cx + x1 * baseR * persp;
      let sy = cy + y2 * baseR * persp;

      if (step > 0) {
        const dx = sx + this.ox[i] - mx;
        const dy = sy + this.oy[i] - my;
        const d = Math.hypot(dx, dy) + 0.001;
        if (d < scatterR) {
          const fall = 1 - d / scatterR;
          const push = fall * fall * 1500 * step;
          this.ovx[i] += (dx / d) * push;
          this.ovy[i] += (dy / d) * push;
        }
        // spring home + damping
        this.ovx[i] += -this.ox[i] * 9 * step;
        this.ovy[i] += -this.oy[i] * 9 * step;
        const dampF = Math.exp(-3.2 * step);
        this.ovx[i] *= dampF;
        this.ovy[i] *= dampF;
        this.ox[i] += this.ovx[i] * step;
        this.oy[i] += this.ovy[i] * step;
      }

      sx += this.ox[i];
      sy += this.oy[i];

      // depth → bucket (0 = far, 3 = near)
      const depth = clamp((persp - fov / (fov + 1)) / (fov / (fov - 1) - fov / (fov + 1)), 0, 1);
      const b = Math.min(3, Math.floor(depth * 4));
      buckets[b].push(sx, sy, this.tint[i], persp);
    }

    this.draw(buckets, cx, cy, baseR);
  }

  draw(buckets, cx, cy, baseR) {
    const { ctx } = this;
    const p = this.palette;
    this.clear();
    ctx.globalCompositeOperation = 'lighter';

    // Core glow.
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.5);
    core.addColorStop(0, `rgba(${p.accent2[0] | 0}, ${p.accent2[1] | 0}, ${p.accent2[2] | 0}, 0.14)`);
    core.addColorStop(0.55, `rgba(${p.accent2[0] | 0}, ${p.accent2[1] | 0}, ${p.accent2[2] | 0}, 0.05)`);
    core.addColorStop(1, `rgba(${p.accent2[0] | 0}, ${p.accent2[1] | 0}, ${p.accent2[2] | 0}, 0)`);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 1.5, 0, TAU);
    ctx.fill();

    // Orbit rings.
    const t = this.time;
    const rings = [
      { rx: baseR * 1.42, ry: baseR * 0.32, rot: -0.32 + Math.sin(t * 0.2) * 0.06, a: 0.1 },
      { rx: baseR * 1.2, ry: baseR * 0.5, rot: 0.55 + Math.cos(t * 0.17) * 0.05, a: 0.07 },
      { rx: baseR * 1.62, ry: baseR * 0.22, rot: 0.08, a: 0.055 },
    ];
    for (const ring of rings) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ring.rot);
      ctx.strokeStyle = `rgba(${p.accent[0] | 0}, ${p.accent[1] | 0}, ${p.accent[2] | 0}, ${ring.a})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(0, 0, ring.rx, ring.ry, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // Particles, grouped by depth.
    const far = mixRgb(p.accent2, p.ink, 0.15);
    const near = mixRgb(p.glow, p.ink, 0.25);
    const tints = [p.accent, p.accent2, p.glow];

    for (let b = 0; b < 4; b++) {
      const arr = buckets[b];
      if (!arr.length) continue;
      const k = b / 3;
      const color = mixRgb(far, near, k);
      const size = 0.5 + k * 1.35;

      // Three tint passes keeps the sphere from flattening into one hue.
      for (let tint = 0; tint < 3; tint++) {
        const path = new Path2D();
        let used = false;
        for (let i = 0; i < arr.length; i += 4) {
          if (arr[i + 2] !== tint) continue;
          const s = size * (0.75 + arr[i + 3] * 0.25);
          path.moveTo(arr[i] + s, arr[i + 1]);
          path.arc(arr[i], arr[i + 1], s, 0, TAU);
          used = true;
        }
        if (!used) continue;
        const mixed = mixRgb(color, tints[tint], 0.4);
        const alpha = 0.1 + k * 0.5;
        ctx.fillStyle = `rgba(${mixed[0] | 0}, ${mixed[1] | 0}, ${mixed[2] | 0}, ${alpha})`;
        ctx.fill(path);
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
