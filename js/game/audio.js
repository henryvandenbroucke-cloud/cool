// Audio: real recorded CC0 foley + ambience through Web Audio, with spatial
// sources, an indoor/outdoor muffle, and a little radio for the music.

const SFX = {
  door_open: 1, door_close: 1, shop_bell: 1, till_ding: 1,
  step_wood: 5, step_grass: 5, place_wood: 3, place_glass: 3, box_soft: 3, box_drop: 1,
  coins: 2, coin_stack: 2, key_click: 1, latch: 1, book_open: 1, book_close: 1, page: 2, cloth: 2,
  creak: [1, 2, 3], clink: [1, 2, 4], lamp_switch: 1, paper: [1, 2, 3], cat_mew: 1, cat_mewpurr: 1,
  wind_key: 1, ceramic: 1,
};
const LOOPS = ['purr_loop', 'clock_tick', 'fire_loop', 'pour_loop', 'amb_rain', 'amb_crickets', 'amb_river', 'amb_wind'];
export const TRACKS = [
  { id: 'apple_cider', name: 'Apple Cider' },
  { id: 'catmint', name: 'Catmint' },
  { id: 'cozy_puzzle', name: 'Cozy Puzzle' },
  { id: 'chill_lofi', name: 'Chill Lofi' },
];

function files() {
  const out = [];
  for (const [name, n] of Object.entries(SFX)) {
    if (Array.isArray(n)) n.forEach((i) => out.push(`${name}_${i}`));
    else if (n === 1) out.push(name);
    else for (let i = 0; i < n; i++) out.push(`${name}_${i}`);
  }
  return out.concat(LOOPS);
}

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.ext = 'ogg';
    this.settings = { master: 0.9, music: 0.55, amb: 0.8, sfx: 0.9 };
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    this.indoor = 1;
    this.loops = new Map();
    this.radio = { on: true, index: 0, el: null };
    this.ready = false;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const probe = document.createElement('audio');
    this.ext = probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a';
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.bus = {};
    for (const b of ['music', 'amb', 'sfx']) {
      this.bus[b] = c.createGain();
      this.bus[b].connect(this.master);
    }
    // outdoor ambience passes through a lowpass that closes when you're indoors
    this.outdoor = c.createBiquadFilter();
    this.outdoor.type = 'lowpass';
    this.outdoor.frequency.value = 18000;
    this.outdoorGain = c.createGain();
    this.outdoor.connect(this.outdoorGain).connect(this.bus.amb);
    this.applySettings();
    await Promise.all(files().map((f) => this.loadBuffer(f)));
    this.ready = true;
  }

  async loadBuffer(name) {
    try {
      const res = await fetch(`/assets/audio/${name}.${this.ext}`);
      const arr = await res.arrayBuffer();
      const buf = await new Promise((ok, bad) => this.ctx.decodeAudioData(arr, ok, bad));
      this.buffers.set(name, buf);
    } catch { /* a missing sound never breaks the game */ }
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.05);
    this.bus.music.gain.setTargetAtTime(this.settings.music, t, 0.05);
    this.bus.amb.gain.setTargetAtTime(this.settings.amb, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(this.settings.sfx, t, 0.05);
    if (this.radio.el) this.radio.el.volume = 1;
  }

  pick(name) {
    if (this.buffers.has(name)) return this.buffers.get(name);
    const v = SFX[name];
    if (!v) return null;
    const ids = Array.isArray(v) ? v : Array.from({ length: v }, (_, i) => i);
    const i = ids[Math.floor(Math.random() * ids.length)];
    return this.buffers.get(`${name}_${i}`) || null;
  }

  panner(pos, { ref = 1.2, roll = 1.4, max = 30 } = {}) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = max;
    setPos(p, pos);
    return p;
  }

  /** One-shot. pos → spatialised. */
  play(name, { volume = 1, rate = 1, jitter = 0.05, pos = null, delay = 0 } = {}) {
    if (!this.ready) return;
    const buf = this.pick(name);
    if (!buf) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    const g = c.createGain();
    g.gain.value = volume;
    src.connect(g);
    if (pos) g.connect(this.panner(pos)).connect(this.bus.sfx);
    else g.connect(this.bus.sfx);
    src.start(c.currentTime + delay);
  }

  /** Looping source; returns a handle. outdoor=true routes through the muffle filter. */
  loop(name, { volume = 1, pos = null, outdoor = false, rate = 1, fade = 1.2 } = {}) {
    if (!this.ready) return null;
    if (this.loops.has(name)) return this.loops.get(name);
    const buf = this.buffers.get(name);
    if (!buf) return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(g);
    let panner = null;
    let node = g;
    if (pos) { panner = this.panner(pos, { ref: 1, roll: 1.6 }); node = g.connect(panner); }
    node.connect(outdoor ? this.outdoor : (name.startsWith('amb') ? this.bus.amb : this.bus.sfx));
    src.start(0, Math.random() * buf.duration);
    g.gain.setTargetAtTime(volume, c.currentTime, fade / 3);
    const h = {
      name, src, gain: g, panner, volume,
      set(v, t = 0.4) { this.volume = v; g.gain.setTargetAtTime(v, c.currentTime, t / 3); },
      move(p) { if (panner) setPos(panner, p); },
      stop: (t = 0.8) => {
        g.gain.setTargetAtTime(0, c.currentTime, t / 3);
        src.stop(c.currentTime + t + 0.1);
        this.loops.delete(name);
      },
    };
    this.loops.set(name, h);
    return h;
  }

  stopLoop(name, t) { this.loops.get(name)?.stop(t); }

  setListener(pos, forward) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(forward.x, t, 0.02); L.forwardY.setTargetAtTime(forward.y, t, 0.02); L.forwardZ.setTargetAtTime(forward.z, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  /** 0 = fully outdoors, 1 = indoors with the door shut. */
  setIndoor(k) {
    if (!this.ctx) return;
    this.indoor = k;
    const t = this.ctx.currentTime;
    this.outdoor.frequency.setTargetAtTime(18000 - k * 16800, t, 0.25);
    this.outdoorGain.gain.setTargetAtTime(1 - k * 0.45, t, 0.25);
  }

  // ---------- Radio ----------
  radioPlay(index = this.radio.index) {
    if (!this.ctx) return;
    this.radio.index = (index + TRACKS.length) % TRACKS.length;
    const track = TRACKS[this.radio.index];
    if (!this.radio.el) {
      const el = new Audio();
      el.crossOrigin = 'anonymous';
      el.preload = 'auto';
      el.addEventListener('ended', () => this.radioPlay(this.radio.index + 1));
      this.radio.el = el;
      try {
        this.radio.node = this.ctx.createMediaElementSource(el);
        this.radio.filter = this.ctx.createBiquadFilter();
        this.radio.filter.type = 'peaking';
        this.radio.filter.frequency.value = 1800;
        this.radio.filter.gain.value = 2;
        this.radio.node.connect(this.radio.filter).connect(this.bus.music);
      } catch { /* fall back to element volume */ }
    }
    this.radio.el.src = `/assets/music/${track.id}.m4a`;
    this.radio.on = true;
    this.radio.el.play().catch(() => {});
    return track;
  }
  radioNext() { return this.radioPlay(this.radio.index + 1); }
  radioToggle() {
    if (!this.radio.el) return this.radioPlay(), true;
    if (this.radio.on) { this.radio.el.pause(); this.radio.on = false; }
    else { this.radio.el.play().catch(() => {}); this.radio.on = true; }
    return this.radio.on;
  }
  suspend() { this.ctx?.suspend(); this.radio.el?.pause(); }
  resume() { this.ctx?.resume(); if (this.radio.on) this.radio.el?.play().catch(() => {}); }
}

function setPos(p, pos) {
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
  else p.setPosition(pos.x, pos.y, pos.z);
}

export const audio = new AudioManager();
