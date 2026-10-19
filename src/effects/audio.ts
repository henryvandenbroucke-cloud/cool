/**
 * Fully synthesised audio (Web Audio API, no samples): a slowly evolving
 * ambient drone, soft UI ticks and impact / absorption sounds.
 * Starts only after a user gesture, as browsers require.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private volume = 0.55;
  private lastClick = 0;

  get started(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user-gesture handler. Safe to call repeatedly. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      // Pinkish noise.
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    this.startAmbient();
  }

  private startAmbient(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 6);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    // A minor-ninth-ish pad of detuned voices.
    const freqs = [55, 82.41, 110.0, 164.81, 123.47];
    freqs.forEach((f, i) => {
      for (const detune of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = i % 2 === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = detune + i * 1.5;
        const og = ctx.createGain();
        og.gain.value = 0.05 / (1 + i * 0.4);
        const trem = ctx.createOscillator();
        trem.frequency.value = 0.05 + i * 0.017;
        const tg = ctx.createGain();
        tg.gain.value = 0.025 / (1 + i * 0.4);
        trem.connect(tg).connect(og.gain);
        trem.start();
        o.connect(og).connect(filter);
        o.start();
      }
    });
    // Space "wind".
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 600;
    bp.Q.value = 0.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.12;
    noise.connect(bp).connect(ng).connect(filter);
    noise.start();
    filter.connect(g).connect(this.master!);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : this.volume, this.ctx.currentTime, 0.15);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  click(pitch = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    if (now - this.lastClick < 0.03) return;
    this.lastClick = now;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880 * pitch, now);
    o.frequency.exponentialRampToValueAtTime(1320 * pitch, now + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.05, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g).connect(this.master);
    o.start(now);
    o.stop(now + 0.15);
  }

  /** Low thump + filtered noise burst, scaled by `strength` (0..1). */
  impact(strength: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const s = Math.min(1, Math.max(0.1, strength));
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, now);
    o.frequency.exponentialRampToValueAtTime(28, now + 1.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.5 * s, now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    o.connect(og).connect(this.master);
    o.start(now);
    o.stop(now + 1.7);
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(120, now + 2.2);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.8 * s, now + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    n.connect(lp).connect(ng).connect(this.master);
    n.start(now);
    n.stop(now + 2.5);
  }

  /** Descending whoosh for black-hole absorption. */
  absorb(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(1800, now);
    bp.frequency.exponentialRampToValueAtTime(90, now + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);
    n.connect(bp).connect(g).connect(this.master);
    n.start(now);
    n.stop(now + 2.1);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(30, now + 1.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.2, now + 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 2);
    o.connect(og).connect(this.master);
    o.start(now);
    o.stop(now + 2.1);
  }

  /** Soft confirmation chime (object created). */
  spawn(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    [523.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      const t0 = now + i * 0.06;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      o.connect(g).connect(this.master!);
      o.start(t0);
      o.stop(t0 + 0.65);
    });
  }
}

export const audio = new AudioEngine();
