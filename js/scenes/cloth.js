/**
 * 03 Gravity — a spring lattice. You are a mass passing through it:
 * it deforms around your cursor, then remembers, a little late.
 */
import { CanvasScene } from './base.js';
import { clamp, TAU } from '../core/utils.js';

const STIFFNESS = 15;
const DAMPING = 2.4;
const COUPLING = 26;
const MOUSE_FORCE = 5200;

export class ClothScene extends CanvasScene {
  constructor(canvas, section) {
    super(canvas, section, { maxPixels: 2_100_000, maxDpr: 1.6 });
    if (this.disabled) return;
    this.build();
  }

  build() {
    const spacing = this.w < 720 ? 52 : 60;
    this.spacing = spacing;
    this.cols = Math.ceil(this.w / spacing) + 2;
    this.rows = Math.ceil(this.h / spacing) + 2;
    const n = this.cols * this.rows;
    this.n = n;

    this.hx = new Float32Array(n);
    this.hy = new Float32Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.fx = new Float32Array(n);
    this.fy = new Float32Array(n);

    const ox = (this.w - (this.cols - 1) * spacing) / 2;
    const oy = (this.h - (this.rows - 1) * spacing) / 2;

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        this.hx[i] = ox + c * spacing;
        this.hy[i] = oy + r * spacing;
        this.x[i] = this.hx[i];
        this.y[i] = this.hy[i];
      }
    }
  }

  onResize() {
    if (this.hx) this.build();
  }

  update(dt, time) {
    if (this.disabled) return;
    const { ctx, w, h, pointer } = this;
    this.time = time;
    const t = time;

    if (!this.reduced && dt > 0) {
      const sub = 2;
      const step = Math.min(dt, 1 / 30) / sub;
      const cols = this.cols;
      const rows = this.rows;
      const mx = pointer.x;
      const my = pointer.y;
      const radius = clamp(Math.min(w, h) * 0.42, 180, 460);
      const invR = 1 / radius;

      for (let s = 0; s < sub; s++) {
        this.fx.fill(0);
        this.fy.fill(0);

        for (let i = 0; i < this.n; i++) {
          const c = i % cols;
          const r = (i / cols) | 0;

          // Rest shape breathes very slightly.
          const breathe = Math.sin(t * 0.55 + c * 0.42 + r * 0.31) * 2.2;
          let ax = (this.hx[i] - this.x[i]) * STIFFNESS;
          let ay = (this.hy[i] - this.y[i]) * STIFFNESS + breathe;

          // Pull towards the cursor.
          const dx = mx - this.x[i];
          const dy = my - this.y[i];
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
          if (dist < radius) {
            const fall = 1 - dist / radius;
            const f = fall * fall * MOUSE_FORCE;
            ax += (dx / dist) * f;
            ay += (dy / dist) * f;
          }

          // Coupling: neighbours share their *displacement*, not their absolute
          // position — otherwise the lattice would want to collapse to a point.
          const dux = this.x[i] - this.hx[i];
          const duy = this.y[i] - this.hy[i];
          const couple = (j) => {
            ax += ((this.x[j] - this.hx[j]) - dux) * COUPLING;
            ay += ((this.y[j] - this.hy[j]) - duy) * COUPLING;
          };
          if (c + 1 < cols) couple(i + 1);
          if (r + 1 < rows) couple(i + cols);
          if (c > 0) couple(i - 1);
          if (r > 0) couple(i - cols);

          this.fx[i] = ax;
          this.fy[i] = ay;
        }

        const damp = Math.exp(-DAMPING * step);
        for (let i = 0; i < this.n; i++) {
          this.vx[i] = (this.vx[i] + this.fx[i] * step) * damp;
          this.vy[i] = (this.vy[i] + this.fy[i] * step) * damp;
          this.x[i] += this.vx[i] * step;
          this.y[i] += this.vy[i] * step;
          if (!Number.isFinite(this.x[i])) {
            this.x[i] = this.hx[i];
            this.y[i] = this.hy[i];
            this.vx[i] = 0;
            this.vy[i] = 0;
          }
        }
      }
    }

    this.draw();
  }

  draw() {
    const { ctx, cols, rows } = this;
    this.clear();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const paths = [new Path2D(), new Path2D(), new Path2D()];
    const strain = (i) => {
      const dx = this.x[i] - this.hx[i];
      const dy = this.y[i] - this.hy[i];
      return Math.sqrt(dx * dx + dy * dy);
    };

    const addEdge = (a, b) => {
      const s = Math.max(strain(a), strain(b));
      const bucket = s > 16 ? 2 : s > 4 ? 1 : 0;
      paths[bucket].moveTo(this.x[a], this.y[a]);
      paths[bucket].lineTo(this.x[b], this.y[b]);
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c + 1 < cols) addEdge(i, i + 1);
        if (r + 1 < rows) addEdge(i, i + cols);
      }
    }

    const p = this.palette;
    const rgb = (v, a) => `rgba(${v[0] | 0}, ${v[1] | 0}, ${v[2] | 0}, ${a})`;
    const styles = [
      { color: rgb(p.accent2, 0.16), width: 0.55 },
      { color: rgb(p.accent, 0.4), width: 0.8 },
      { color: rgb(p.glow, 0.85), width: 1.25 },
    ];
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = styles[i].color;
      ctx.lineWidth = styles[i].width;
      ctx.stroke(paths[i]);
    }

    // Bright points where the lattice is under real strain.
    const hot = new Path2D();
    for (let i = 0; i < this.n; i++) {
      const s = strain(i);
      if (s > 14) {
        const size = Math.min(1.1 + s * 0.04, 3.4);
        hot.moveTo(this.x[i] + size, this.y[i]);
        hot.arc(this.x[i], this.y[i], size, 0, TAU);
      }
    }
    ctx.fillStyle = rgb(p.glow, 0.8);
    ctx.fill(hot);

    // The mass itself.
    if (this.pointer.inside) {
      const { x, y } = this.pointer;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 120);
      g.addColorStop(0, rgb(p.glow, 0.09));
      g.addColorStop(0.6, rgb(p.accent, 0.05));
      g.addColorStop(1, rgb(p.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 120, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
