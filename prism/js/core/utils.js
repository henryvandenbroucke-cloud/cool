/* Small math + DOM helpers shared by every module. */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a || 1e-6), 0, 1);

/** Frame-rate independent exponential smoothing. */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * Math.max(dt, 0)));

export const smoothstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const smootherstep = (t) => {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToCss = (rgb, alpha = 1) =>
  alpha >= 1
    ? `rgb(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])})`
    : `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${alpha.toFixed(3)})`;

export const mixRgb = (a, b, t) => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export const luminance = (rgb) =>
  (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Touch-primary devices only. Duck-typing `ontouchstart` misfires on hybrid
 * laptops (and in headless environments), and killing smooth scroll there
 * would be a shame — coarse pointers are the honest signal.
 */
export const isTouch = () =>
  window.matchMedia('(hover: none) and (pointer: coarse)').matches;

export const clampPixelRatio = (width, height, maxPixels, maxDpr = 2) => {
  const area = Math.max(width * height, 1);
  const budget = Math.sqrt(maxPixels / area);
  const dpr = window.devicePixelRatio || 1;
  return clamp(Math.min(dpr, maxDpr, Math.max(budget, 1)), 1, maxDpr);
};

/** Cheap, deterministic 1D value noise — used for organic drift. */
export const noise1 = (x) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = Math.sin(i * 127.1) * 43758.5453;
  const b = Math.sin((i + 1) * 127.1) * 43758.5453;
  const an = a - Math.floor(a);
  const bn = b - Math.floor(b);
  return lerp(an, bn, u) * 2 - 1;
};
