/**
 * Shared plumbing for the four canvas rooms: DPR-aware sizing,
 * palette handoff, pointer state, visibility and static fallbacks.
 */
import { clampPixelRatio, prefersReducedMotion } from '../core/utils.js';

export class CanvasScene {
  constructor(canvas, section, options = {}) {
    this.canvas = canvas;
    this.section = section;
    this.maxPixels = options.maxPixels || 1_800_000;
    this.maxDpr = options.maxDpr || 1.75;

    this.ctx = null;
    try {
      this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    } catch {
      this.ctx = null;
    }
    if (!this.ctx && !options.optional) {
      this.disabled = true;
    }

    this.reduced = prefersReducedMotion();
    this.visible = false;
    this.staticPending = true;
    this.time = 0;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;

    this.palette = {
      bg: [5, 6, 10],
      ink: [244, 246, 251],
      accent: [124, 247, 212],
      accent2: [109, 124, 255],
      glow: [182, 255, 240],
    };

    this.pointer = {
      x: -9999, y: -9999, px: -9999, py: -9999,
      vx: 0, vy: 0, active: false, inside: false,
    };

    this.resize();
  }

  resize() {
    if (this.disabled) return;
    const w = Math.max(this.section.clientWidth || 1, 1);
    const h = Math.max(this.section.clientHeight || 1, 1);
    const dpr = clampPixelRatio(w, h, this.maxPixels, this.maxDpr);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.staticPending = true;
    this.onResize();
  }

  setPalette(palette) {
    this.palette = palette;
    this.staticPending = true;
  }

  /** Local CSS-pixel pointer coordinates within the section. */
  setPointer(x, y) {
    const p = this.pointer;
    p.px = p.x;
    p.py = p.y;
    if (p.x === -9999) { p.px = x; p.py = y; }
    p.x = x;
    p.y = y;
    p.vx = x - p.px;
    p.vy = y - p.py;
    p.inside = x >= 0 && y >= 0 && x <= this.w && y <= this.h;
    p.active = p.inside;
    this.staticPending = true;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  stop() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  onResize() {}
}
