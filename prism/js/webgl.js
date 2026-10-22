/**
 * PRISM sky — a single fragment shader that carries all six rooms.
 * Domain-warped nebula, dust, aperture rings, a refracted beam, caustics,
 * gravitational lensing, paper and a spectral veil — cross-faded by uScene.
 */
import { clampPixelRatio, damp, clamp } from './core/utils.js';

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform vec2  uMouseVel;
uniform vec3  uAccent;
uniform vec3  uAccent2;
uniform vec3  uGlow;
uniform float uScene;
uniform float uEnergy;
uniform float uDay;

const float PI = 3.141592653589793;

mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  mat2 m = rot(0.62);
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p = m * p * 2.07 + 13.7;
    a *= 0.5;
  }
  return v;
}

float fbm4(vec2 p) {
  float v = 0.0;
  float a = 0.54;
  mat2 m = rot(0.62);
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = m * p * 2.07 + 13.7;
    a *= 0.5;
  }
  return v;
}

float bandMask(float v, float a, float b) {
  return smoothstep(a - 0.45, a + 0.45, v) * (1.0 - smoothstep(b - 0.45, b + 0.45, v));
}

float stars(vec2 p, float density, float seed, float t) {
  vec2 g = floor(p * density);
  vec2 f = fract(p * density);
  float h = hash21(g + seed);
  float on = step(0.982, h);
  vec2 pos = vec2(hash21(g + seed + 1.31), hash21(g + seed + 2.77));
  float d = length(f - pos);
  float twinkle = 0.55 + 0.45 * sin(t * 1.7 + h * 43.0);
  return on * (1.0 - smoothstep(0.0, 0.055, d)) * twinkle;
}

void main() {
  vec2 res = uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * res) / res.y;
  vec2 mouse = (uMouse - 0.5 * res) / res.y;
  float t = uTime;
  float scene = uScene;

  // Room masks, soft so palettes and motifs cross-fade continuously.
  float m0 = 1.0 - smoothstep(0.35, 0.9, scene);
  float m1 = bandMask(scene, 0.62, 1.38);
  float m2 = bandMask(scene, 1.62, 2.38);
  float m3 = bandMask(scene, 2.62, 3.38);
  float m4 = bandMask(scene, 3.62, 4.38);
  float m5 = smoothstep(4.62, 5.0, scene);

  vec2 q = p + mouse * (0.045 + 0.02 * sin(t * 0.13));

  // ---- Nebula ------------------------------------------------------------
  vec2 warp = vec2(
    fbm3(q * 1.25 + vec2(t * 0.028, 0.0)),
    fbm3(q * 1.25 + vec2(4.7, -t * 0.024))
  );
  q += warp * (0.02 + 0.03 * m2) * vec2(sin(t * 0.31), cos(t * 0.27));

  float n1 = fbm4(q * 1.05 + warp * 0.9 + vec2(t * 0.011, -t * 0.008));
  float n2 = fbm3(q * 2.35 - warp * 0.5 + vec2(-t * 0.019, t * 0.014));

  vec3 col = vec3(0.0075, 0.0085, 0.0135);
  col += mix(uAccent2, uAccent, smoothstep(0.18, 0.92, n1)) * pow(n1, 1.5) * 0.52;
  col += uGlow * pow(n2, 3.1) * 0.36;

  // ---- Dust --------------------------------------------------------------
  col += vec3(0.92, 0.96, 1.0) * stars(p, 78.0, 11.0, t) * 0.5;
  col += uGlow * stars(p + 3.17, 36.0, 7.0, t * 0.7) * 0.20;

  // ---- 00 Aperture: concentric blades of light ---------------------------
  vec2 c0 = vec2(0.56, 0.015);
  float d0 = length((q - c0) * vec2(0.92, 1.1));
  float rings = pow(0.5 + 0.5 * cos(d0 * 24.0 - t * 0.42), 22.0);
  col += mix(uAccent, uGlow, 0.45) * rings * 0.32 * exp(-d0 * 1.1) * m0;
  col += uAccent * exp(-d0 * 2.4) * 0.09 * m0;

  // ---- 01 Refraction: a fan of bent rays ---------------------------------
  vec2 origin = vec2(-0.28, 0.22);
  float rays = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float ang = -0.52 + fi * 0.128 + sin(t * 0.24 + fi * 1.4) * 0.022;
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 rel = q - origin;
    float along = dot(rel, dir);
    float perp = abs(dot(rel, vec2(-dir.y, dir.x)));
    float taper = smoothstep(0.0, 0.32, along) * (1.0 - smoothstep(0.9, 1.45, along));
    rays += (1.0 - smoothstep(0.0, 0.0032, perp)) * taper;
  }
  col += mix(uAccent, uGlow, 0.35) * rays * 0.36 * m1;

  // ---- 02 Fluid: caustics ------------------------------------------------
  float caus = pow(0.5 + 0.5 * sin(n1 * 15.0 + n2 * 9.0 - t * 1.15), 9.0);
  col += mix(uAccent, uGlow, 0.5) * caus * 0.28 * m2;

  // ---- 03 Gravity: lensing rings ----------------------------------------
  vec2 gm = vec2(0.46 + 0.07 * sin(t * 0.19), 0.03 * cos(t * 0.16));
  float gd = length(q - gm);
  float lens = pow(0.5 + 0.5 * cos(gd * 31.0 - t * 0.55), 16.0) * exp(-gd * 1.5);
  col += mix(uAccent2, uAccent, 0.4) * lens * 0.4 * m3;
  col += uGlow * exp(-gd * 10.0) * 0.15 * m3;

  // ---- 04 Rhythm: paper (mostly hidden behind the daylight room) --------
  vec3 paper = vec3(0.925, 0.906, 0.855) + 0.014 * vec3(sin(t * 0.2), cos(t * 0.17), 0.0);
  paper *= 0.93 + 0.07 * vnoise(p * 34.0);
  paper += uAccent * 0.05 * exp(-length(p - vec2(0.55, 0.1)) * 1.9);
  col = mix(col, paper, m4 * 0.94);

  // ---- 05 Spectrum: a spectral veil -------------------------------------
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float yy = 0.075 * sin(q.x * 1.5 + t * 0.33 + fi * 2.0) + (fi - 1.0) * 0.062;
    float band = 1.0 - smoothstep(0.0, 0.013, abs(q.y - yy));
    vec3 bc = mix(uAccent, uAccent2, fi * 0.5);
    col += bc * band * (0.18 + 0.03 * sin(t + fi)) * m5;
  }
  col += uGlow * stars(p * 1.4 + 8.0, 46.0, 3.3, t * 1.3) * 0.34 * m5;

  // ---- Cursor as a second light source ----------------------------------
  float md = length(p - mouse);
  col += uGlow * exp(-md * 5.2) * (0.075 + 0.04 * uEnergy);
  col += uAccent2 * exp(-length(p - (mouse - uMouseVel * 2.2)) * 7.0) * 0.03;

  // ---- Finish ------------------------------------------------------------
  float vig = 1.0 - smoothstep(0.2, 1.4, length(p * vec2(0.82, 1.0)));
  col *= mix(0.66, 1.0, vig);

  float edge = smoothstep(0.55, 1.15, length(p));
  col.r *= 1.0 + edge * 0.09;
  col.g *= 1.0 + edge * 0.02;
  col.b *= 1.0 + edge * 0.13;

  col = max(col, 0.0);
  col = col / (1.0 + col * 0.62);
  col = pow(col, vec3(0.94));

  // paper needs to stay bright after the tonemap
  col = mix(col, paper, clamp(m4 * 0.9 - 0.06, 0.0, 1.0));

  col += (hash21(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.012;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ok = false;
    this.time = 0;
    this.mouse = [0, 0];
    this.targetMouse = [0, 0];
    this.mouseVel = [0, 0];
    this.energy = 0;
    this.palette = {
      accent: [124, 247, 212],
      accent2: [109, 124, 255],
      glow: [182, 255, 240],
    };
    this.day = 0;
    this.dpr = 1;
    this.width = 1;
    this.height = 1;
    this.uniforms = {};
    this._lost = false;
    this._bound = false;
    this._init();
  }

  _init() {
    const opts = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    };
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl', opts) || this.canvas.getContext('experimental-webgl', opts);
    } catch {
      gl = null;
    }
    if (!gl) {
      this._fail('WebGL unavailable');
      return;
    }

    this.gl = gl;
    const vs = this._shader(gl.VERTEX_SHADER, VERT);
    const fs = this._shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      this._fail('Shader compile failed');
      return;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this._fail(`Program link failed: ${gl.getProgramInfoLog(program)}`);
      return;
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
    gl.useProgram(program);

    // A single oversized triangle covers the viewport with no vertex buffer churn.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      'uRes', 'uTime', 'uMouse', 'uMouseVel', 'uAccent', 'uAccent2',
      'uGlow', 'uScene', 'uEnergy', 'uDay',
    ]) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    this.ok = true;
    this.canvas.style.opacity = '1';

    if (!this._bound) {
      this._bound = true;
      window.addEventListener('resize', () => this.resize(), { passive: true });
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.ok = false;
        this._lost = true;
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this._lost = false;
        this.uniforms = {};
        this._init();
      });
    }

    this.resize();
    this._setPaletteUniforms();
  }

  _fail(message) {
    this.ok = false;
    this.gl = null;
    // Let the CSS gradient sky take over rather than a black rectangle.
    this.canvas.style.display = 'none';
    document.documentElement.classList.add('no-webgl');
    if (message) console.warn(`[PRISM] ${message} — falling back to the CSS sky.`);
  }

  _shader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[PRISM] shader error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  resize() {
    if (!this.ok) return;
    const w = Math.max(window.innerWidth, 1);
    const h = Math.max(window.innerHeight, 1);
    const dpr = clampPixelRatio(w, h, 2_600_000, 2);
    this.dpr = dpr;
    this.width = Math.round(w * dpr);
    this.height = Math.round(h * dpr);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.gl.viewport(0, 0, this.width, this.height);
    this.gl.uniform2f(this.uniforms.uRes, this.width, this.height);
  }

  setPalette(palette) {
    this.palette = palette;
    this._setPaletteUniforms();
  }

  _setPaletteUniforms() {
    if (!this.ok) return;
    const gl = this.gl;
    const p = this.palette;
    const scale = 1 / 255;
    gl.uniform3f(this.uniforms.uAccent, p.accent[0] * scale, p.accent[1] * scale, p.accent[2] * scale);
    gl.uniform3f(this.uniforms.uAccent2, p.accent2[0] * scale, p.accent2[1] * scale, p.accent2[2] * scale);
    gl.uniform3f(this.uniforms.uGlow, p.glow[0] * scale, p.glow[1] * scale, p.glow[2] * scale);
  }

  setScene(value) {
    this.scene = value;
    if (this.ok) this.gl.uniform1f(this.uniforms.uScene, value);
  }

  setDay(value) {
    this.day = value;
    if (this.ok) this.gl.uniform1f(this.uniforms.uDay, value);
  }

  setEnergy(value) {
    this.energy = clamp(value, 0, 1);
  }

  update(dt, pointer, theme) {
    if (!this.ok) return;
    this.time += dt;
    const sec = this.time;

    // Convert CSS pointer to GL pixels (origin bottom-left) with smoothing.
    const px = (pointer.x / Math.max(window.innerWidth, 1)) * this.width;
    const py = (1 - pointer.y / Math.max(window.innerHeight, 1)) * this.height;
    this.targetMouse[0] = px;
    this.targetMouse[1] = py;
    const prevX = this.mouse[0];
    const prevY = this.mouse[1];
    this.mouse[0] = damp(this.mouse[0], px, 12, dt);
    this.mouse[1] = damp(this.mouse[1], py, 12, dt);
    const inv = 1 / Math.max(this.height, 1);
    this.mouseVel[0] = damp(this.mouseVel[0], (this.mouse[0] - prevX) * inv, 6, dt);
    this.mouseVel[1] = damp(this.mouseVel[1], (this.mouse[1] - prevY) * inv, 6, dt);

    if (theme) this.setPalette(theme);

    const gl = this.gl;
    gl.uniform1f(this.uniforms.uTime, sec);
    gl.uniform2f(this.uniforms.uMouse, this.mouse[0], this.mouse[1]);
    gl.uniform2f(this.uniforms.uMouseVel, this.mouseVel[0], this.mouseVel[1]);
    gl.uniform1f(this.uniforms.uEnergy, this.energy);
    gl.uniform1f(this.uniforms.uDay, this.day);
    if (typeof this.scene === 'number') {
      gl.uniform1f(this.uniforms.uScene, this.scene);
    }
  }

  render() {
    if (!this.ok) return;
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }

  dispose() {
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    this.ok = false;
  }
}
