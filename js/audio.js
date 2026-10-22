/**
 * PRISM sound — a generative, six-room ambient instrument.
 * Everything is synthesised: no samples, no files. One note every few seconds,
 * a slow pad that follows the palette, and a little air.
 */
import { STATES } from './core/palette.js';
import { rand, clamp, damp } from './core/utils.js';

const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];
const BRIGHTNESS = [1150, 1500, 900, 780, 1750, 1250];

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.ready = false;
    this.enabled = false;
    this.current = 0;
    this.energy = 0;
    this.pingEnv = 0;
    this.timer = null;
    this.volume = 0.42;
  }

  get playing() {
    return this.enabled;
  }

  async toggle() {
    if (this.enabled) {
      this.disable();
      return false;
    }
    const ok = await this.enable();
    return ok ? true : false;
  }

  async enable() {
    if (!this.ready) this.build();
    if (!this.ctx) return false;
    try {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch {
      return false;
    }
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.volume, now, 0.8);
    this.setScene(this.current, true);
    this.schedulePing(900);
    return true;
  }

  disable() {
    this.enabled = false;
    if (this.master && this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.4);
    }
    clearTimeout(this.timer);
    this.timer = null;
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // A little room to sit in.
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(3.2, 2.3);
    const wet = ctx.createGain();
    wet.gain.value = 0.4;
    conv.connect(wet);
    wet.connect(master);
    this.reverbIn = conv;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = BRIGHTNESS[0];
    filter.Q.value = 0.5;
    filter.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.6;
    filter.connect(send);
    send.connect(conv);
    this.filter = filter;

    // Breathing filter.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 380;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.lfo = lfo;

    // Air.
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(7);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.055;
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(filter);
    noise.start();
    this.noise = noise;
    this.air = bp;

    // One pad per room; cross-faded as you scroll.
    this.voices = STATES.map((state, index) => {
      const gain = ctx.createGain();
      gain.gain.value = index === 0 ? 0.2 : 0.0001;
      gain.connect(filter);
      const ratios = [0.5, 1, 1.5, 2, 3];
      const oscs = ratios.map((ratio, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'triangle' : 'sine';
        osc.frequency.value = state.root * ratio;
        osc.detune.value = (i % 2 ? 5 : -4) + (i === 4 ? 3 : 0);
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.42 : i === 4 ? 0.1 : 0.26 / i;
        osc.connect(g);
        g.connect(gain);
        osc.start();
        return osc;
      });
      return { gain, oscs };
    });

    this.ready = true;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  noiseBuffer(seconds) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 2.4;
    }
    return buffer;
  }

  setScene(index, force = false) {
    const next = clamp(index | 0, 0, STATES.length - 1);
    if (!force && next === this.current) return;
    this.current = next;
    if (!this.ready || !this.enabled) return;
    const now = this.ctx.currentTime;
    this.voices.forEach((voice, i) => {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(i === next ? 0.22 : 0.0001, now, i === next ? 1.1 : 1.8);
    });
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setTargetAtTime(BRIGHTNESS[next] || 1150, now, 1.4);
  }

  schedulePing(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.enabled) return;
      this.ping();
      this.schedulePing(rand(1700, 5200));
    }, Math.max(0, delay));
  }

  ping() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const state = STATES[this.current];
    const semi = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
    const freq = state.root * 2 * Math.pow(2, semi / 12);
    const now = ctx.currentTime + 0.02;

    const osc = ctx.createOscillator();
    osc.type = Math.random() < 0.3 ? 'triangle' : 'sine';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.085, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    osc.connect(gain);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = rand(-0.75, 0.75);
      gain.connect(pan);
      pan.connect(this.filter);
    } else {
      gain.connect(this.filter);
    }
    osc.start(now);
    osc.stop(now + 3);
    this.pingEnv = 1;
  }

  update(dt) {
    if (!this.enabled || !this.ctx) {
      this.energy = damp(this.energy, 0, 2.5, dt);
      return this.energy;
    }
    this.pingEnv = Math.max(0, this.pingEnv - dt * 0.8);
    const t = this.ctx.currentTime;
    const slow = 0.5 + 0.5 * Math.sin(t * 0.42);
    this.energy = clamp(slow * 0.55 + this.pingEnv * 0.45, 0, 1);
    return this.energy;
  }

  dispose() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* already closed */
      }
    }
    this.ctx = null;
    this.ready = false;
    this.enabled = false;
  }
}
