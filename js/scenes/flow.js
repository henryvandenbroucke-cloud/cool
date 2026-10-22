/**
 * 01 Refraction — two thousand particles tracing an invisible field.
 * Your cursor adds a second field: a vortex with a little lift.
 */
import { CanvasScene } from './base.js';
import { rand, clamp, TAU } from '../core/utils.js';

const TINTS = 3;
const WIDTHS = 2;

export class FlowScene extends CanvasScene {
  constructor(canvas, section) {
    super(canvas, section, { maxPixels: 1_700_000, maxDpr: 1.6 });
    if (this.disabled) return;
    this.particles = [];
    this.build();
  }

  build() {
    const area = this.w * this.h;
    const count = Math.round(clamp(area / 6200, 420, 1900));
    this.particles = new Array(count);
    for (let i = 0; i < count; i++) {
      this.particles[i] = this.spawn({}, true);
    }
  }

  spawn(p, initial = false) {
    p.x = rand(-20, this.w + 20);
    p.y = rand(-20, this.h + 20);
    p.px = p.x;
    p.py = p.y;
    p.speed = rand(26, 92);
    p.life = initial ? rand(0, 1) : 0;
    p.max = rand(0.6, 2.4);
    p.tint = Math.floor(rand(0, TINTS));
    p.width = Math.floor(rand(0, WIDTHS));
    p.wobble = rand(0, TAU);
    return p;
  }

  onResize() {
    if (this.particles && this.particles.length) {
      this.build();
      this.staticDrawn = false;
    }
  }

  colors() {
    const { accent, accent2, glow } = this.palette;
    const c = (rgb, a) => `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`;
    return [
      [c(accent, 0.34), c(accent, 0.2)],
      [c(accent2, 0.3), c(accent2, 0.18)],
      [c(glow, 0.4), c(glow, 0.24)],
    ];
  }

  update(dt, time) {
    if (this.disabled) return;
    const { ctx, w, h, pointer } = this;
    this.time = time;

    if (this.reduced) {
      this.drawStill();
      return;
    }

    // Trail decay without ever painting over the WebGL sky behind us.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${clamp(dt * 2.4, 0.02, 0.16)})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';

    const paths = [];
    for (let i = 0; i < TINTS * WIDTHS; i++) paths.push(new Path2D());

    const mx = pointer.x;
    const my = pointer.y;
    const influenceRadius = 250;
    const invR2 = 1 / (influenceRadius * influenceRadius);
    const t = time;
    const dtClamped = Math.min(dt, 1 / 30);

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += dt / p.max;
      if (p.life >= 1) this.spawn(p);

      const angle =
        Math.sin(p.x * 0.0027 + t * 0.14 + p.wobble) * 1.6 +
        Math.cos(p.y * 0.0022 - t * 0.11) * 1.6 +
        Math.sin((p.x + p.y) * 0.0013 + t * 0.05) * 0.9;

      let vx = Math.cos(angle);
      let vy = Math.sin(angle);

      const dx = p.x - mx;
      const dy = p.y - my;
      const d2 = dx * dx + dy * dy;
      if (d2 < influenceRadius * influenceRadius) {
        const fall = 1 - d2 * invR2;
        const d = Math.sqrt(d2) + 0.001;
        // tangential swirl + a gentle outward push
        vx += (-dy / d) * fall * 2.4 + (dx / d) * fall * 0.8;
        vy += (dx / d) * fall * 2.4 + (dy / d) * fall * 0.8;
      }

      p.px = p.x;
      p.py = p.y;
      p.x += vx * p.speed * dtClamped;
      p.y += vy * p.speed * dtClamped;

      if (p.x < -60 || p.x > w + 60 || p.y < -60 || p.y > h + 60) {
        this.spawn(p);
        continue;
      }

      const bucket = p.tint * WIDTHS + p.width;
      paths[bucket].moveTo(p.px, p.py);
      paths[bucket].lineTo(p.x, p.y);
    }

    const pal = this.colors();
    ctx.globalAlpha = 0.9;
    for (let tint = 0; tint < TINTS; tint++) {
      for (let wd = 0; wd < WIDTHS; wd++) {
        ctx.strokeStyle = pal[tint][wd];
        ctx.lineWidth = wd === 0 ? 0.55 : 1.15;
        ctx.stroke(paths[tint * WIDTHS + wd]);
      }
    }

    // Dust caught in the cursor's light.
    if (pointer.inside) {
      const dust = new Path2D();
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const r = Math.pow(Math.random(), 0.65) * 120;
        const x = mx + Math.cos(a) * r;
        const y = my + Math.sin(a) * r * 0.8;
        const size = Math.random() * 1.6 + 0.3;
        dust.moveTo(x + size, y);
        dust.arc(x, y, size, 0, TAU);
      }
      ctx.fillStyle = pal[2][0];
      ctx.globalAlpha = 0.55;
      ctx.fill(dust);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Motion-free version: a still field of dust, no trails. */
  drawStill() {
    const { ctx } = this;
    if (!this.staticDrawn) {
      this.clear();
      const pal = this.colors();
      ctx.globalCompositeOperation = 'lighter';
      for (let tint = 0; tint < TINTS; tint++) {
        const dots = new Path2D();
        for (let i = tint; i < this.particles.length; i += TINTS) {
          const p = this.particles[i];
          dots.moveTo(p.x, p.y);
          dots.arc(p.x, p.y, 1.1, 0, TAU);
        }
        ctx.fillStyle = pal[tint][0];
        ctx.fill(dots);
      }
      ctx.globalCompositeOperation = 'source-over';
      this.staticDrawn = true;
    }
  }
}
