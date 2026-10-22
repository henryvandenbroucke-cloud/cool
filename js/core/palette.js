/**
 * The six states of light.
 * Every scene owns a palette; the page animates between them while you scroll.
 * Colours are stored as RGB triples so they can be handed straight to WebGL.
 */
import {
  hexToRgb, mixRgb, luminance, smootherstep, clamp, rgbToCss,
} from './utils.js';

export const STATES = [
  {
    id: 'aperture',
    name: 'Aperture',
    bg: hexToRgb('#05060a'),
    ink: hexToRgb('#f4f6fb'),
    accent: hexToRgb('#7cf7d4'),
    accent2: hexToRgb('#6d7cff'),
    glow: hexToRgb('#b6fff0'),
    shaderScene: 0,
    root: 220, // audio root (Hz)
  },
  {
    id: 'refraction',
    name: 'Refraction',
    bg: hexToRgb('#04070c'),
    ink: hexToRgb('#e9f7ff'),
    accent: hexToRgb('#7cf7d4'),
    accent2: hexToRgb('#57d8ff'),
    glow: hexToRgb('#d6fff8'),
    shaderScene: 1,
    root: 246.94,
  },
  {
    id: 'fluid',
    name: 'Fluid',
    bg: hexToRgb('#08040c'),
    ink: hexToRgb('#fff0f8'),
    accent: hexToRgb('#ff5fbf'),
    accent2: hexToRgb('#ff9b54'),
    glow: hexToRgb('#ffd0ec'),
    shaderScene: 2,
    root: 196,
  },
  {
    id: 'gravity',
    name: 'Gravity',
    bg: hexToRgb('#05070d'),
    ink: hexToRgb('#eef2ff'),
    accent: hexToRgb('#9d8bff'),
    accent2: hexToRgb('#5ecbff'),
    glow: hexToRgb('#d9d2ff'),
    shaderScene: 3,
    root: 174.61,
  },
  {
    id: 'rhythm',
    name: 'Rhythm',
    bg: hexToRgb('#f0ebe1'),
    ink: hexToRgb('#131110'),
    accent: hexToRgb('#ff4d2e'),
    accent2: hexToRgb('#1a2a4a'),
    glow: hexToRgb('#ffb59f'),
    shaderScene: 4,
    root: 261.63,
  },
  {
    id: 'spectrum',
    name: 'Spectrum',
    bg: hexToRgb('#05060a'),
    ink: hexToRgb('#f6f4ff'),
    accent: hexToRgb('#ffd166'),
    accent2: hexToRgb('#ff3ea5'),
    glow: hexToRgb('#fff0c9'),
    shaderScene: 5,
    root: 293.66,
  },
];

const COLOR_KEYS = ['bg', 'ink', 'accent', 'accent2', 'glow'];

export class Theme {
  /**
   * @param {(state: object) => void} [onChange] called every animated frame
   */
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.index = 0;
    this.current = Theme.snapshot(STATES[0]);
    this.from = Theme.snapshot(STATES[0]);
    this.to = Theme.snapshot(STATES[0]);
    this.t = 1;
    this.duration = 1.15;
    this.shaderScene = STATES[0].shaderScene;
    this.day = 0;
    this.targetDay = 0;
    this.apply();
  }

  static snapshot(state) {
    const out = { shaderScene: state.shaderScene, root: state.root, name: state.name, id: state.id };
    for (const key of COLOR_KEYS) out[key] = [...state[key]];
    return out;
  }

  goTo(index) {
    const next = clamp(index, 0, STATES.length - 1);
    if (next === this.index && this.t >= 1) return;
    this.from = Theme.snapshot(this.current);
    this.from.shaderScene = this.shaderScene;
    this.to = Theme.snapshot(STATES[next]);
    this.index = next;
    this.t = 0;
    this.duration = 1.1;
  }

  update(dt) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.duration);
      const e = smootherstep(this.t);
      const out = Theme.snapshot(this.to);
      for (const key of COLOR_KEYS) out[key] = mixRgb(this.from[key], this.to[key], e);
      out.shaderScene = this.from.shaderScene + (this.to.shaderScene - this.from.shaderScene) * e;
      out.root = this.from.root + (this.to.root - this.from.root) * e;
      out.name = this.to.name;
      out.id = this.to.id;
      this.current = out;
      this.shaderScene = out.shaderScene;
      this.apply();
    }

    const targetDay = luminance(this.current.bg) > 0.5 ? 1 : 0;
    if (this.day !== targetDay) {
      this.day += Math.sign(targetDay - this.day) * Math.min(dt * 2.2, Math.abs(targetDay - this.day));
      this.apply();
    }
  }

  apply() {
    const root = document.documentElement;
    if (!root) return;
    const c = this.current;
    root.style.setProperty('--bg', rgbToCss(c.bg));
    root.style.setProperty('--ink', rgbToCss(c.ink));
    root.style.setProperty('--accent', rgbToCss(c.accent));
    root.style.setProperty('--accent-2', rgbToCss(c.accent2));
    root.style.setProperty('--glow', rgbToCss(c.glow));
    if (document.body) {
      document.body.dataset.scene = c.id;
      document.body.dataset.day = String(luminance(c.bg) > 0.5);
    }
    this.onChange(this.current);
  }

  get state() {
    return STATES[this.index];
  }
}
