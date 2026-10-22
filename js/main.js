/**
 * PRISM — boot, choreography, scroll, cursor, audio wiring.
 * One requestAnimationFrame loop drives every layer.
 */
import { Sky } from './webgl.js';
import { Theme } from './core/palette.js';
import { FlowScene } from './scenes/flow.js';
import { GooScene } from './scenes/goo.js';
import { ClothScene } from './scenes/cloth.js';
import { OrbScene } from './scenes/orb.js';
import { Sound } from './audio.js';
import {
  qs, qsa, clamp, damp, lerp, rand, smootherstep,
  prefersReducedMotion, isTouch, TAU,
} from './core/utils.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SCENE_FACTORIES = {
  flow: FlowScene,
  goo: GooScene,
  cloth: ClothScene,
  orb: OrbScene,
};

const state = {
  ready: false,
  active: -1,
  progress: -1,
  time: 0,
  energy: 0,
  reduced: prefersReducedMotion(),
};

const pointer = {
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  nx: 0,
  ny: 0,
  down: false,
  dirty: false,
  seen: false,
};

let sky = null;
let theme = null;
let smooth = null;
let sound = null;
let sections = [];
let scenes = [];
let cursor = null;
let magnets = [];
let heroTitle = null;
let scramble = null;
let loader = null;
let loaderEl = null;
let railLinks = [];
let docHeight = 1;

/* ------------------------------------------------------------------ loader */

function initLoader() {
  loaderEl = $('#loader');
  loader = {
    el: loaderEl,
    bar: $('#loader-bar'),
    num: $('#loader-num'),
    start: performance.now(),
    finished: false,
    fontsReady: !document.fonts,
  };
  document.documentElement.classList.add('is-loading');

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready
      .then(() => { loader.fontsReady = true; })
      .catch(() => { loader.fontsReady = true; });
  }
  // Never hold the curtain for long.
  setTimeout(() => { if (loader) loader.fontsReady = true; }, 4200);
}

function updateLoader(now) {
  if (!loader || loader.finished) return;
  const minDuration = state.reduced ? 0.45 : 2.15;
  const elapsed = (now - loader.start) / 1000;
  let p = clamp(elapsed / minDuration, 0, 1);
  if (!loader.fontsReady && p > 0.9) p = 0.9;
  const eased = smootherstep(p);
  if (loader.el) loader.el.style.setProperty('--load', eased.toFixed(3));
  if (loader.num) loader.num.textContent = String(Math.round(eased * 100)).padStart(2, '0');
  if (p >= 1 && loader.fontsReady) finishLoader();
}

function finishLoader() {
  if (!loader || loader.finished) return;
  loader.finished = true;
  if (loader.el) {
    loader.el.style.setProperty('--load', '1');
    if (loader.num) loader.num.textContent = '100';
  }
  document.documentElement.classList.remove('is-loading');
  document.body.classList.add('is-ready');
  window.__PRISM_READY__ = true;
  state.ready = true;
  measure();
  requestAnimationFrame(() => {
    if (!loader.el) return;
    loader.el.classList.add('is-done');
    window.setTimeout(() => {
      if (loader.el) loader.el.hidden = true;
    }, 1300);
  });
}

function forceReveal() {
  document.documentElement.classList.remove('is-loading');
  if (loaderEl) {
    loaderEl.classList.add('is-done');
    loaderEl.hidden = true;
  }
  document.body.classList.add('is-ready');
  window.__PRISM_READY__ = true;
  state.ready = true;
  if (loader) loader.finished = true;
}

/* ------------------------------------------------------------------ layout */

function measure() {
  const scrollY = window.scrollY || window.pageYOffset || 0;
  sections = $$('.scene').map((el, index) => {
    const rect = el.getBoundingClientRect();
    return {
      el,
      index,
      top: rect.top + scrollY,
      height: Math.max(rect.height, 1),
      scene: null,
      p: -1,
      seen: false,
    };
  });

  // Re-attach the canvas engines (they survive re-measure).
  for (const s of sections) {
    const canvas = $('canvas[data-canvas]', s.el);
    if (!canvas) continue;
    s.scene = scenes.find((sc) => sc.canvas === canvas) || null;
  }

  docHeight = Math.max(document.documentElement.scrollHeight, window.innerHeight);
}

function buildScenes() {
  for (const s of sections) {
    const canvas = $('canvas[data-canvas]', s.el);
    if (!canvas) continue;
    const Factory = SCENE_FACTORIES[canvas.dataset.canvas];
    if (!Factory) continue;
    try {
      const scene = new Factory(canvas, s.el);
      if (scene.disabled) continue;
      scenes.push(scene);
      s.scene = scene;
    } catch (error) {
      console.warn(`[PRISM] "${canvas.dataset.canvas}" scene unavailable.`, error);
      canvas.style.display = 'none';
    }
  }
}

/* ---------------------------------------------------------------- scrolling */

class SmoothScroll {
  constructor() {
    this.disabled = state.reduced || isTouch();
    this.target = window.scrollY || 0;
    this.current = this.target;
    this.animating = false;
    this._onWheel = this._onWheel.bind(this);
    if (!this.disabled) {
      window.addEventListener('wheel', this._onWheel, { passive: false });
    }
    window.addEventListener(
      'scroll',
      () => {
        if (!this.animating) this.target = window.scrollY;
      },
      { passive: true },
    );
    window.addEventListener(
      'resize',
      () => {
        this.current = window.scrollY;
        this.target = this.current;
        this.animating = false;
      },
      { passive: true },
    );
  }

  max() {
    return Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  }

  setDisabled(value) {
    this.disabled = value;
    if (value) {
      window.removeEventListener('wheel', this._onWheel);
      this.animating = false;
    } else {
      window.addEventListener('wheel', this._onWheel, { passive: false });
    }
  }

  _onWheel(event) {
    if (event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('[data-native-scroll]')) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    const delta = clamp(event.deltaY * unit, -300, 300);
    this.target = clamp(this.target + delta, 0, this.max());
    this.animating = true;
  }

  update(dt) {
    if (this.disabled) {
      this.current = window.scrollY;
      return;
    }
    if (this.animating) {
      this.current = damp(this.current, this.target, 11, dt);
      if (Math.abs(this.target - this.current) < 0.4) {
        this.current = this.target;
        this.animating = false;
      }
      window.scrollTo(0, this.current);
    } else {
      this.current = window.scrollY;
      this.target = this.current;
    }
  }

  to(y) {
    const dest = clamp(y, 0, this.max());
    if (this.disabled) {
      window.scrollTo({ top: dest, behavior: state.reduced ? 'auto' : 'smooth' });
      return;
    }
    this.current = window.scrollY;
    this.target = dest;
    this.animating = true;
  }
}

/* -------------------------------------------------------------------- cursor */

function initCursor() {
  const el = $('#cursor');
  if (!el) return;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  cursor = {
    el,
    dot: $('.cursor__dot', el),
    ring: $('.cursor__ring', el),
    label: $('.cursor__label', el),
    enabled: canHover && !isTouch(),
    x: pointer.x,
    y: pointer.y,
    rx: pointer.x,
    ry: pointer.y,
  };
  if (!cursor.enabled) {
    el.style.display = 'none';
    return;
  }
  document.documentElement.classList.add('has-cursor');

  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-cursor], a, button') : null;
    if (!target) {
      el.classList.remove('is-hover', 'is-title', 'has-label');
      cursor.label.textContent = '';
      return;
    }
    const mode = target.dataset.cursor || (target.tagName === 'A' || target.tagName === 'BUTTON' ? 'link' : '');
    el.classList.toggle('is-title', mode === 'title');
    el.classList.toggle('is-hover', mode !== 'title');
    const label = target.dataset.cursorLabel || '';
    cursor.label.textContent = label;
    el.classList.toggle('has-label', Boolean(label));
  });

  document.addEventListener('pointerdown', () => el.classList.add('is-down'));
  document.addEventListener('pointerup', () => el.classList.remove('is-down'));
  document.addEventListener('pointerleave', () => el.classList.add('is-hidden'));
  document.addEventListener('pointerenter', () => el.classList.remove('is-hidden'));
  document.addEventListener('mouseleave', () => el.classList.add('is-hidden'));
}

/* -------------------------------------------------------------------- motion */

function updateCursor(dt) {
  if (!cursor || !cursor.enabled) return;
  cursor.x = damp(cursor.x, pointer.x, 34, dt);
  cursor.y = damp(cursor.y, pointer.y, 34, dt);
  cursor.rx = damp(cursor.rx, pointer.x, 16, dt);
  cursor.ry = damp(cursor.ry, pointer.y, 16, dt);
  cursor.dot.style.transform = `translate3d(${cursor.x.toFixed(2)}px, ${cursor.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
  cursor.ring.style.transform = `translate3d(${cursor.rx.toFixed(2)}px, ${cursor.ry.toFixed(2)}px, 0) translate(-50%, -50%)`;
  cursor.label.style.transform = `translate3d(${cursor.rx.toFixed(2)}px, ${cursor.ry.toFixed(2)}px, 0) translate(-50%, -50%)`;
}

function updateMagnets() {
  if (!cursor || !cursor.enabled) return;
  for (const el of magnets) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = pointer.x - cx;
    const dy = pointer.y - cy;
    const dist = Math.hypot(dx, dy);
    const range = Math.max(rect.width, rect.height) * 0.62 + 46;
    if (dist < range) {
      const fall = 1 - dist / range;
      el.style.transform = `translate3d(${(dx * 0.16 * fall).toFixed(2)}px, ${(dy * 0.2 * fall).toFixed(2)}px, 0)`;
    } else if (el.style.transform) {
      el.style.transform = '';
    }
  }
}

function updateScrollChrome(vh) {
  const scrollY = window.scrollY;
  const max = Math.max(docHeight - vh, 1);
  const progress = clamp(scrollY / max, 0, 1);

  if (Math.abs(progress - state.progress) > 0.0004) {
    state.progress = progress;
    document.documentElement.style.setProperty('--progress', progress.toFixed(4));
    const pct = $('#rail-pct');
    if (pct) pct.textContent = String(Math.round(progress * 100)).padStart(2, '0');
  }

  for (const s of sections) {
    const p = clamp((scrollY + vh - s.top) / (s.height + vh), 0, 1);
    if (Math.abs(p - s.p) > 0.002) {
      s.p = p;
      s.el.style.setProperty('--p', p.toFixed(3));
    }
  }

  // The room under the centre of the viewport owns the palette.
  const centre = scrollY + vh * 0.5;
  let active = sections.length ? sections[0].index : 0;
  for (const s of sections) if (centre >= s.top) active = s.index;
  if (active !== state.active) setActiveScene(active);
}

function setActiveScene(index) {
  const changed = index !== state.active;
  state.active = index;
  if (!changed) return;

  if (theme) theme.goTo(index);
  if (sound) sound.setScene(index);

  railLinks.forEach((link) => {
    if (Number(link.dataset.index) === index) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  });

  const section = sections.find((s) => s.index === index);
  if (section) {
    const inner = $('.scene__inner', section.el);
    if (inner) inner.classList.add('is-in');
  }
}

/* ------------------------------------------------------------------- reveals */

function observeReveals() {
  const targets = $$('[data-reveal], .display, .type-scene__top, .type-scene__foot, .marquees');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18, rootMargin: '0px 0px -6% 0px' },
  );
  targets.forEach((el) => observer.observe(el));

  // Also reveal a room as soon as it becomes active (safety for tall sections).
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          $$('.word', entry.target).forEach((w) => { w.style.opacity = ''; });
        }
      }
    },
    { threshold: 0.12 },
  );
  sections.forEach((s) => sectionObserver.observe(s.el));
}

/* ----------------------------------------------------------------- wordplay */

class Scramble {
  constructor(el) {
    this.el = el;
    this.out = $('.scramble__text', el) || el;
    this.words = (el.dataset.words || 'PRISM').split(',').map((w) => w.trim()).filter(Boolean);
    this.index = 0;
    this.frame = 0;
    this.chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*+=/<>';
    this.out.setAttribute('aria-hidden', 'true');
    this.el.setAttribute('aria-label', `Shuffle the word: ${this.words[0]}`);
    el.addEventListener('click', () => {
      this.index = (this.index + 1) % this.words.length;
      this.play(this.words[this.index]);
    });
  }

  play(word) {
    cancelAnimationFrame(this.frame);
    this.el.setAttribute('aria-label', `Shuffle the word: ${word}`);
    if (state.reduced) {
      this.out.textContent = word;
      return;
    }
    const start = performance.now();
    const duration = 640;
    const step = (now) => {
      const p = clamp((now - start) / duration, 0, 1);
      let text = '';
      for (let i = 0; i < word.length; i++) {
        const settle = 0.25 + (i / Math.max(word.length, 1)) * 0.6;
        if (p >= settle) text += word[i];
        else text += this.chars[Math.floor(Math.random() * this.chars.length)];
      }
      this.out.textContent = text;
      if (p < 1) this.frame = requestAnimationFrame(step);
      else this.out.textContent = word;
    };
    this.frame = requestAnimationFrame(step);
  }
}

/* --------------------------------------------------------------------- audio */

function initSound() {
  sound = new Sound();
  const button = $('#sound');
  const clone = $('#sound-2');
  const label = $('#sound-label');

  const sync = (playing) => {
    [button, clone].forEach((b) => {
      if (!b) return;
      b.setAttribute('aria-pressed', String(playing));
    });
    if (label) label.textContent = playing ? 'Sound on' : 'Sound off';
    // The label is visually hidden on small screens, so name the button itself.
    if (button) button.setAttribute('aria-label', playing ? 'Mute the room' : 'Enable sound');
    if (clone) {
      const span = $('span', clone);
      if (span) span.textContent = playing ? 'Mute the room' : 'Listen to the room';
    }
  };

  const toggle = async () => {
    if (button) button.disabled = true;
    try {
      const playing = await sound.toggle();
      sync(playing);
    } finally {
      if (button) button.disabled = false;
    }
  };

  button?.addEventListener('click', toggle);
  clone?.addEventListener('click', toggle);
  sync(false);
}

/* -------------------------------------------------------------------- wiring */

function bindInteractions() {
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.nx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ny = (event.clientY / window.innerHeight - 0.5) * 2;
      pointer.dirty = true;
      pointer.seen = true;
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (event) => {
      const touch = event.touches[0];
      if (!touch) return;
      pointer.x = touch.clientX;
      pointer.y = touch.clientY;
      pointer.nx = (touch.clientX / window.innerWidth - 0.5) * 2;
      pointer.ny = (touch.clientY / window.innerHeight - 0.5) * 2;
      pointer.dirty = true;
    },
    { passive: true },
  );

  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY;
      smooth.to(top);
      history.replaceState(null, '', href);
      const heading = target.querySelector('h1, h2');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus({ preventScroll: true });
      }
    });
  });

  $('#replay')?.addEventListener('click', () => smooth.to(0));

  const year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Re-measure when the document changes height (fonts, wrapping, resize).
  if ('ResizeObserver' in window) {
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        measure();
        scenes.forEach((scene) => scene.resize());
      });
    });
    ro.observe(document.body);
  }

  window.addEventListener('resize', () => {
    measure();
    scenes.forEach((scene) => scene.resize());
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    last = performance.now();
  });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onMotionChange = (event) => {
    state.reduced = event.matches;
    if (smooth) smooth.setDisabled(state.reduced || isTouch());
    scenes.forEach((scene) => {
      scene.reduced = state.reduced;
      scene.staticPending = true;
    });
  };
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
  else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);

  window.__PRISM__ = {
    get state() {
      return { ...state, sections: sections.length, scenes: scenes.length, theme: theme?.current };
    },
    goTo: (index) => {
      const s = sections[index];
      if (s) smooth.to(s.top);
    },
  };
}

/* ---------------------------------------------------------------------- boot */

function init() {
  initLoader();
  measure();
  loaderEl?.style.setProperty('--load', '0');

  // Sky first so the shader compiles while the curtain is closed.
  const canvas = $('#gl');
  if (canvas) {
    try {
      sky = new Sky(canvas);
    } catch (error) {
      console.warn('[PRISM] WebGL sky unavailable.', error);
      canvas.style.display = 'none';
    }
  }

  buildScenes();

  theme = new Theme((current) => {
    if (sky) sky.setPalette(current);
    for (const scene of scenes) scene.setPalette(current);
  });

  initCursor();
  initSound();
  observeReveals();
  smooth = new SmoothScroll();
  bindInteractions();

  railLinks = $$('.rail__list a').map((link, index) => {
    link.dataset.index = String(index);
    return link;
  });

  heroTitle = $('.hero__title');
  magnets = $$('.pill, .scramble, .sound, .cue, .brand').map((el) => {
    el.classList.add('magnetic');
    return el;
  });

  const scrambleEl = $('#scramble');
  if (scrambleEl) scramble = new Scramble(scrambleEl);

  $$('.marquee').forEach((el) => {
    const speed = parseFloat(el.dataset.speed || '30');
    const duration = clamp(speed * 0.52, 9, 30);
    el.style.setProperty('--dur', `${duration.toFixed(1)}s`);
  });

  setActiveScene(0);
  measure();
  requestAnimationFrame(frame);
}

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);

  const dt = clamp((now - last) / 1000, 0, 1 / 20);
  last = now;

  updateLoader(now);

  const vh = window.innerHeight;
  if (!state.reduced) state.time += dt;

  smooth?.update(dt);
  updateScrollChrome(vh);

  if (theme) theme.update(dt);

  if (sky) {
    if (theme) sky.setScene(theme.shaderScene);
    sky.setDay(theme ? theme.day : 0);
    sky.setEnergy(state.energy);
    sky.update(state.reduced ? 0 : dt, pointer, theme ? theme.current : null);
    sky.render();
  }

  // Scenes
  const scrollY = window.scrollY;
  const energy = sound ? sound.update(dt) : 0;
  state.energy = energy;

  for (const s of sections) {
    const scene = s.scene;
    if (!scene) continue;
    const near = s.top + s.height > scrollY - vh * 0.45 && s.top < scrollY + vh * 1.45;
    scene.visible = near;
    if (!near) continue;

    const localY = pointer.y - (s.top - scrollY);
    if (state.reduced) {
      if (pointer.dirty) {
        scene.setPointer(pointer.x, localY);
        scene.staticPending = true;
      }
      if (scene.staticPending) {
        if (scene.setEnergy) scene.setEnergy(energy);
        scene.update(0, 1.4);
        scene.staticPending = false;
      }
    } else {
      scene.setPointer(pointer.x, localY);
      if (scene.setEnergy) scene.setEnergy(energy);
      scene.update(dt, state.time);
    }
  }
  // Chrome
  updateCursor(dt);
  if (heroTitle) {
    heroTitle.style.setProperty('--mx', pointer.nx.toFixed(3));
    heroTitle.style.setProperty('--my', pointer.ny.toFixed(3));
  }
  if (pointer.dirty) updateMagnets();
  pointer.dirty = false;
}

/* ---------------------------------------------------------------------- kick */

try {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
} catch (error) {
  console.error('[PRISM] failed to start.', error);
  forceReveal();
}

// Last-resort safety: never trap a visitor behind the curtain.
setTimeout(() => {
  if (!state.ready) {
    console.warn('[PRISM] startup took too long — revealing the page.');
    forceReveal();
  }
}, 9000);

window.addEventListener('error', () => {
  if (!state.ready) forceReveal();
});
