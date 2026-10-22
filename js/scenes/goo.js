/**
 * 02 Fluid — luminous colour fields. Soft bodies with springs, mutual repulsion
 * and a wake that follows the pointer; the canvas is additively blended and
 * gently blurred so overlapping colour melts together like ink in water.
 */
import { CanvasScene } from './base.js';
import { rand, clamp, TAU, mixRgb } from '../core/utils.js';

export class GooScene extends CanvasScene {
  constructor(canvas, section) {
    super(canvas, section, { maxPixels: 1_200_000, maxDpr: 1.4 });
    if (this.disabled) return;
    this.build();
  }

  build() {
    const count = this.w < 720 ? 7 : 10;
    const beads = this.w < 720 ? 14 : 24;
    this.blobs = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      this.blobs.push({
        x: this.w * 0.5 + Math.cos(a) * this.w * 0.16,
        y: this.h * 0.5 + Math.sin(a) * this.h * 0.16,
        vx: 0, vy: 0,
        r: rand(0.11, 0.2) * Math.min(this.w, this.h) * 1.15,
        phase: rand(0, TAU),
        speed: rand(0.16, 0.34),
        orbitX: rand(0.14, 0.34),
        orbitY: rand(0.12, 0.3),
        tint: i % 3,
      });
    }
    this.beads = [];
    for (let i = 0; i < beads; i++) {
      this.beads.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        r: rand(4, 14),
        vx: rand(-14, 14),
        vy: rand(-14, 14),
        tint: i % 3,
        phase: rand(0, TAU),
      });
    }
    this.stir = [];
    this.staticDrawn = false;
  }

  onResize() {
    if (this.blobs) this.build();
  }

  tintColor(index, alpha) {
    const p = this.palette;
    let rgb;
    if (index === 0) rgb = mixRgb(p.accent, [255, 255, 255], 0.18);
    else if (index === 1) rgb = p.accent2;
    else rgb = mixRgb(p.glow, [255, 255, 255], 0.35);
    return `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${alpha})`;
  }

  update(dt, time) {
    if (this.disabled) return;
    const { ctx, w, h, pointer } = this;
    this.time = time;
    const t = time;
    const step = this.reduced ? 0 : Math.min(dt, 1 / 30);

    const cx = w * 0.54;
    const cy = h * 0.5;

    if (step > 0) {
      for (const b of this.blobs) {
        const ax = cx + Math.cos(t * b.speed + b.phase) * w * b.orbitX;
        const ay = cy + Math.sin(t * b.speed * 1.27 + b.phase * 1.7) * h * b.orbitY;
        b.vx += (ax - b.x) * 2.4 * step;
        b.vy += (ay - b.y) * 2.4 * step;

        const dx = b.x - pointer.x;
        const dy = b.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const R = 300;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) + 0.001;
          const fall = 1 - d / R;
          const swirl = 1.1;
          b.vx += ((dx / d) * 1.5 + (-dy / d) * swirl) * fall * 900 * step;
          b.vy += ((dy / d) * 1.5 + (dx / d) * swirl) * fall * 900 * step;
        }

        const damp = Math.pow(0.06, step);
        b.vx *= damp;
        b.vy *= damp;
        b.x += b.vx * step;
        b.y += b.vy * step;
      }

      // Keep the cores from collapsing into one another.
      for (let i = 0; i < this.blobs.length; i++) {
        for (let j = i + 1; j < this.blobs.length; j++) {
          const a = this.blobs[i];
          const b = this.blobs[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) + 0.001;
          const min = (a.r + b.r) * 0.72;
          if (dist < min) {
            const push = ((min - dist) / min) * 420;
            const nx = dx / dist;
            const ny = dy / dist;
            a.vx -= nx * push * step;
            a.vy -= ny * push * step;
            b.vx += nx * push * step;
            b.vy += ny * push * step;
          }
        }
      }

      for (const bead of this.beads) {
        const dx = bead.x - pointer.x;
        const dy = bead.y - pointer.y;
        const d = Math.hypot(dx, dy) + 0.001;
        if (d < 220) {
          const fall = 1 - d / 220;
          bead.vx += (-dy / d) * fall * 420 * step;
          bead.vy += (dx / d) * fall * 420 * step;
        }
        bead.vx += Math.sin(t * 0.7 + bead.phase) * 18 * step;
        bead.vy += Math.cos(t * 0.62 + bead.phase) * 18 * step;
        bead.vx *= Math.pow(0.35, step);
        bead.vy *= Math.pow(0.35, step);
        bead.x += bead.vx * step;
        bead.y += bead.vy * step;
        if (bead.x < -20) bead.x = w + 20;
        if (bead.x > w + 20) bead.x = -20;
        if (bead.y < -20) bead.y = h + 20;
        if (bead.y > h + 20) bead.y = -20;
      }

      // The pointer leaves a wake of goo behind it.
      if (pointer.inside && (Math.abs(pointer.vx) > 1.2 || Math.abs(pointer.vy) > 1.2)) {
        this.stir.push({ x: pointer.x, y: pointer.y, life: 1, r: rand(22, 46), tint: Math.random() < 0.5 ? 0 : 2 });
        if (this.stir.length > 18) this.stir.shift();
      }
      for (const s of this.stir) {
        s.life -= step * 0.75;
        s.r += step * 10;
      }
      this.stir = this.stir.filter((s) => s.life > 0);
    }

    this.clear();
    ctx.globalCompositeOperation = 'lighter';

    // Wake first, so the main bodies sit on top.
    for (const s of this.stir) {
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, this.tintColor(s.tint, 0.5 * s.life));
      g.addColorStop(1, this.tintColor(s.tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }

    const breathe = this.reduced ? 1 : 1 + Math.sin(t * 0.8) * 0.04;
    for (const b of this.blobs) {
      const r = b.r * breathe;
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, this.tintColor(b.tint, 1));
      g.addColorStop(0.45, this.tintColor(b.tint, 0.66));
      g.addColorStop(0.8, this.tintColor(b.tint, 0.22));
      g.addColorStop(1, this.tintColor(b.tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, TAU);
      ctx.fill();
    }

    for (const bead of this.beads) {
      const g = ctx.createRadialGradient(bead.x, bead.y, 0, bead.x, bead.y, bead.r);
      g.addColorStop(0, this.tintColor(bead.tint, 0.85));
      g.addColorStop(1, this.tintColor(bead.tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bead.x, bead.y, bead.r, 0, TAU);
      ctx.fill();
    }

    if (pointer.inside && !this.reduced) {
      const halo = pointer.inside ? clamp(1, 0, 1) : 0;
      const g = ctx.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, 130);
      g.addColorStop(0, this.tintColor(0, 0.14 * halo));
      g.addColorStop(1, this.tintColor(0, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 130, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
