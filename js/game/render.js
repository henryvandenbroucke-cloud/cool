// Rendering: physically based materials with soft environment light, warm
// bloom for every light source, a gentle grade, and optional ink outlines.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

export const LAYER_NO_INK = 1;   // glass, particles, sky: excluded from the outline pass

// ---------- Materials ----------
/** A lit, physically based material. Accepts (and ignores) old toon-only options. */
export function litMat(opts = {}) {
  const { gradientMap, ...rest } = opts;
  return new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...rest });
}

export function toon(color = '#ffffff', opts = {}) {
  return litMat({ color, ...opts });
}

export function glow(color, intensity = 2.2) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: true });
}

// Kenney material names → our palette, so every pack reads as one world.
export const REMAP = {
  wood: '#c48a58', woodDark: '#8a5a3b', woodBark: '#8a5a3b', woodBarkDark: '#6e4a36', woodInner: '#e8cfa4',
  metal: '#a8aca2', metalDark: '#4b5350', metalMedium: '#6e756f',
  carpet: '#b85a4c', carpetDarker: '#7d3d35', carpetWhite: '#efe3c9',
  plant: '#5f9a62', grass: '#5f8f52', leafsGreen: '#4f8a55', leafsDark: '#2f5f52',
  dirt: '#8a6a4a', stone: '#a7ada6', stoneDark: '#7d857f',
  colorRed: '#d0544a', colorTan: '#e7b07a', colorPurple: '#a690d6', colorYellow: '#f0c05a',
  _defaultMat: '#f1e7d3', lamp: '#ffd58a', glass: '#bfd8d2',
};

const matCache = new Map();
/** Every converted toon material that came from a Kenney material with this name. */
export function materialsNamed(name) { return [...matCache.values()].filter((m) => m.name === name); }
const METALS = new Set(['metal', 'metalDark', 'metalMedium']);
/** Convert any loaded material into a shared lit material on our palette. */
export function toToon(src, { remap = true } = {}) {
  const k = src.uuid + (remap ? 'r' : '');
  if (matCache.has(k)) return matCache.get(k);
  const name = src.name || '';
  let out;
  if (name === 'glass') {
    out = litMat({ color: REMAP.glass, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
    out.userData.noInk = true;
  } else if (name === 'lamp') {
    out = glow(REMAP.lamp, 1.6);
  } else {
    const color = remap && REMAP[name] ? new THREE.Color(REMAP[name]) : (src.color ? src.color.clone() : new THREE.Color('#fff'));
    const metal = METALS.has(name);
    out = litMat({ color, map: src.map || null, transparent: src.transparent, opacity: src.opacity ?? 1, alphaTest: src.alphaTest || 0, metalness: metal ? 0.6 : 0, roughness: metal ? 0.42 : name.startsWith('wood') ? 0.72 : 0.85 });
    if (src.map) { src.map.colorSpace = THREE.SRGBColorSpace; out.color.set('#ffffff'); }
  }
  out.name = name;
  matCache.set(k, out);
  return out;
}

// ---------- Canvas textures ----------
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rand = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

export const textures = {
  planks: (repeat) => canvasTex(256, 256, (g, w, h) => {
    const rows = 4;
    const cols = ['#b77d4f', '#c18657', '#ad744a', '#bd8352'];
    g.fillStyle = cols[0];
    g.fillRect(0, 0, w, h);
    let n = 0;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 120;
      while (x < w) {
        const len = 90 + rand() * 120;
        g.fillStyle = cols[(r + n++) % cols.length];
        g.fillRect(x, (r * h) / rows, len, h / rows);
        g.fillStyle = 'rgba(70,40,20,.35)';
        g.fillRect(x, (r * h) / rows, 2, h / rows);
        // grain
        g.strokeStyle = 'rgba(90,55,30,.13)';
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          const y = (r * h) / rows + 6 + rand() * (h / rows - 12);
          g.moveTo(x + 4, y); g.bezierCurveTo(x + len * 0.3, y + 3, x + len * 0.6, y - 3, x + len, y + 1);
          g.stroke();
        }
        x += len;
      }
      g.fillStyle = 'rgba(60,34,18,.45)';
      g.fillRect(0, (r * h) / rows - 1, w, 3);
    }
  }, { repeat }),
  plaster: (repeat) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#efe1c6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(${170 + rand() * 40},${140 + rand() * 30},${100 + rand() * 30},${0.05 + rand() * 0.06})`;
      const r = 2 + rand() * 10;
      g.beginPath(); g.arc(rand() * w, rand() * h, r, 0, Math.PI * 2); g.fill();
    }
  }, { repeat }),
  logs: (repeat) => canvasTex(256, 256, (g, w, h) => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const y = (i * h) / n;
      const grd = g.createLinearGradient(0, y, 0, y + h / n);
      grd.addColorStop(0, '#6d4630'); grd.addColorStop(0.25, '#8f6040'); grd.addColorStop(0.7, '#7d5236'); grd.addColorStop(1, '#4d3122');
      g.fillStyle = grd; g.fillRect(0, y, w, h / n);
      g.strokeStyle = 'rgba(40,24,14,.25)';
      for (let k = 0; k < 3; k++) { g.beginPath(); const yy = y + 8 + rand() * (h / n - 16); g.moveTo(0, yy); g.lineTo(w, yy + rand() * 4 - 2); g.stroke(); }
    }
  }, { repeat }),
  shingles: (repeat) => canvasTex(256, 256, (g, w, h) => {
    const rows = 8, cols = 6;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols + 1; c++) {
        const x = c * (w / cols) - (r % 2) * (w / cols / 2);
        const y = r * (h / rows);
        const v = 0.78 + rand() * 0.22;
        g.fillStyle = `rgb(${Math.round(232 * v)},${Math.round(226 * v)},${Math.round(214 * v)})`;
        g.beginPath();
        g.roundRect(x + 1, y, w / cols - 2, h / rows + 6, [0, 0, 10, 10]);
        g.fill();
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 1, y + h / rows + 2, w / cols - 2, 4);
      }
    }
  }, { repeat }),
  grass: (repeat) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4c7040'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = rand();
      g.fillStyle = v < 0.5 ? 'rgba(98,140,78,.35)' : 'rgba(54,84,48,.35)';
      g.fillRect(rand() * w, rand() * h, 2 + rand() * 3, 2 + rand() * 6);
    }
  }, { repeat }),
  path: (repeat) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9c8466'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const v = 0.85 + rand() * 0.25;
      g.fillStyle = `rgb(${Math.round(170 * v)},${Math.round(158 * v)},${Math.round(140 * v)})`;
      g.beginPath(); g.ellipse(rand() * w, rand() * h, 8 + rand() * 18, 6 + rand() * 12, rand() * 3, 0, Math.PI * 2); g.fill();
    }
  }, { repeat }),
  snow: (repeat) => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#eef3f8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(200,215,235,.45)' : 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 4, 0, Math.PI * 2); g.fill(); }
  }, { repeat }),
  cork: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b98c5c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = rand() < 0.5 ? 'rgba(120,80,40,.35)' : 'rgba(230,190,140,.3)'; g.fillRect(rand() * w, rand() * h, 2, 2); }
  }),
  label: (text, { bg = '#f6ecd8', fg = '#3b2a20', w = 256, h = 96, font = 600, size = 44, border = '#c9b089' } = {}) => {
    const t = canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 14); g.fill();
      g.strokeStyle = border; g.lineWidth = 4; g.stroke();
      g.fillStyle = fg; g.font = `${font} ${size}px Fredoka, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2);
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  },
};

// ---------- Post-processing ----------
class NormalDepthPass extends Pass {
  constructor(scene, camera, w, h) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const mat = new THREE.MeshNormalMaterial();
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vInkDepth;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvInkDepth = -mvPosition.z;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <packing>', '#include <packing>\nvarying float vInkDepth;')
        .replace('gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );', 'gl_FragColor = vec4( packNormalToRGB( normal ), 1.0 / max( vInkDepth, 0.01 ) );')
        .replace('gl_FragColor.a = 1.0;', '');
    };
    this.override = mat;
    this.clear = new THREE.Color(0.5, 0.5, 1.0);
  }
  setSize(w, h) { this.target.setSize(w, h); }
  render(renderer) {
    const prevOverride = this.scene.overrideMaterial;
    const prevBg = this.scene.background;
    const prevMask = this.camera.layers.mask;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    this.scene.overrideMaterial = this.override;
    this.scene.background = null;
    this.camera.layers.disable(LAYER_NO_INK);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this.clear, 0);  // alpha 0 = infinitely far (alpha stores 1/depth)
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.camera.layers.mask = prevMask;
    this.scene.overrideMaterial = prevOverride;
    this.scene.background = prevBg;
    renderer.setClearColor(prevClear, prevAlpha);
  }
}

const InkShader = {
  uniforms: {
    tDiffuse: { value: null },
    tNormal: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uNRes: { value: new THREE.Vector2(1, 1) },
    uThickness: { value: 1.0 },
    uInk: { value: new THREE.Color('#2a1c18') },
    uStrength: { value: 0.85 },
    uVignette: { value: 0.32 },
    uWarm: { value: 0.0 },
    uTime: { value: 0 },
    uFilter: { value: 0 },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform vec2 uRes; uniform vec2 uNRes; uniform float uThickness;
    uniform vec3 uInk; uniform float uStrength; uniform float uVignette; uniform float uWarm; uniform float uTime; uniform int uFilter;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec4 col = texture2D(tDiffuse, vUv);
      vec2 px = uThickness / uNRes;
      vec4 c = texture2D(tNormal, vUv);
      vec4 l = texture2D(tNormal, vUv - vec2(px.x, 0.0));
      vec4 r = texture2D(tNormal, vUv + vec2(px.x, 0.0));
      vec4 u = texture2D(tNormal, vUv + vec2(0.0, px.y));
      vec4 d = texture2D(tNormal, vUv - vec2(0.0, px.y));
      float dz = min(1.0 / max(c.a, 0.005), 200.0);
      float dl = min(1.0 / max(l.a, 0.005), 200.0), dr = min(1.0 / max(r.a, 0.005), 200.0);
      float du = min(1.0 / max(u.a, 0.005), 200.0), dd = min(1.0 / max(d.a, 0.005), 200.0);
      float depthEdge = (abs(dl - dz) + abs(dr - dz) + abs(du - dz) + abs(dd - dz)) / max(dz, 0.05);
      vec3 nc = c.rgb * 2.0 - 1.0;
      float normalEdge = (1.0 - dot(nc, l.rgb * 2.0 - 1.0)) + (1.0 - dot(nc, r.rgb * 2.0 - 1.0)) + (1.0 - dot(nc, u.rgb * 2.0 - 1.0)) + (1.0 - dot(nc, d.rgb * 2.0 - 1.0));
      float e = max(smoothstep(0.18, 0.42, depthEdge), smoothstep(0.55, 1.1, normalEdge));
      e *= smoothstep(60.0, 18.0, dz);              // fade lines into the distance
      vec3 inked = mix(col.rgb, col.rgb * 0.32 + uInk * 0.12, e * uStrength);
      // storybook grade: lift shadows toward blue, warm the mids
      float lum = dot(inked, vec3(0.299, 0.587, 0.114));
      inked = mix(inked, inked + vec3(0.012, 0.02, 0.045), 1.0 - smoothstep(0.0, 0.35, lum));
      inked *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), uWarm);
      if (uFilter == 1) { inked = mix(vec3(lum), inked, 0.35) * vec3(1.08, 1.0, 0.86); }
      else if (uFilter == 2) { inked = inked * vec3(0.92, 1.0, 1.1); }
      vec2 q = vUv - 0.5;
      float vig = 1.0 - dot(q, q) * uVignette * 2.2;
      inked *= vig;
      inked += (hash(vUv * uRes + uTime) - 0.5) * 0.012;
      gl_FragColor = vec4(inked, col.a);
    }`,
};

// ---------- Quality ----------
// Tiers trade fidelity for speed. 'auto' starts at medium and walks the
// render scale (and then the tier) up or down from measured frame times.
// Quality never trades resolution first: effects go before pixels do.
export const TIERS = {
  high:   { dpr: 1.5, bloom: true, bloomDiv: 2, aa: true, lights: 4, shadows: true },
  medium: { dpr: 1.0, bloom: true, bloomDiv: 4, aa: true, lights: 4 },
  low:    { dpr: 1.0, bloom: false, bloomDiv: 4, aa: false, lights: 3 },
};
const ORDER = ['low', 'medium', 'high'];

export function createRenderer(canvas) {
  // MSAA on the default framebuffer smooths edges on the low tier, which renders directly
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false, stencil: false });
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

/** The GPU the browser is using, and whether it is drawing in software (slow). */
export function gpuInfo(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { name, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) };
  } catch { return { name: 'unknown', software: false }; }
}

export function createComposer(renderer, scene, camera, { mobile = false } = {}) {
  const v2 = new THREE.Vector2();
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  const nd = new NormalDepthPass(scene, camera, 1, 1);
  const renderPass = new RenderPass(scene, camera);
  const ink = new ShaderPass(InkShader);
  ink.uniforms.tNormal.value = nd.target.texture;
  // threshold above 1: only emissive light sources bloom, lit walls never do
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 1.05);
  const bloomSetSize = bloom.setSize.bind(bloom);
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(nd);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(ink);
  composer.addPass(new OutputPass());
  composer.addPass(fxaa);

  const api = {
    composer, ink, bloom,
    mode: 'auto',
    tier: mobile ? 'low' : 'medium',
    scale: 1,
    outlines: false,
    fps: 60,
    onChange: null,
    setMode(mode) {
      this.mode = mode;
      if (mode !== 'auto') this.tier = mode;
      this.scale = 1;
      this.apply();
    },
    setOutlines(on) { this.outlines = !!on; this.apply(); },
    get direct() { return !TIERS[this.tier].bloom && !this.outlines && !this.filter; },
    apply() {
      const t = TIERS[this.tier];
      const dpr = Math.min(window.devicePixelRatio || 1, t.dpr) * this.scale;
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      const s = renderer.getDrawingBufferSize(v2);
      composer.setSize(s.x, s.y);
      const inkRes = this.tier === 'high' ? 1 : 0.5;
      const nw = Math.max(1, Math.round(s.x * inkRes)), nh = Math.max(1, Math.round(s.y * inkRes));
      nd.setSize(nw, nh);
      bloomSetSize(Math.round(s.x / (t.bloomDiv / 2)), Math.round(s.y / (t.bloomDiv / 2)));
      bloom.setSize = (w, h) => bloomSetSize(Math.round(w / (t.bloomDiv / 2)), Math.round(h / (t.bloomDiv / 2)));
      ink.uniforms.uRes.value.set(s.x, s.y);
      ink.uniforms.uNRes.value.set(nw, nh);
      ink.uniforms.uThickness.value = Math.max(1, (nh / 900) * (inkRes < 1 ? 1.4 : 1));
      nd.enabled = this.outlines;
      ink.uniforms.uStrength.value = this.outlines ? 0.85 : 0;
      bloom.enabled = t.bloom;
      fxaa.enabled = t.aa;
      fxaa.material.uniforms.resolution.value.set(1 / s.x, 1 / s.y);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      this.onChange?.(this.tier, t);
    },
    resize() { this.apply(); },
    // frame-time driven adaptation: tier first, resolution only as a last resort
    acc: 0, frames: 0, slow: 0, fast: 0,
    measure(dt) {
      this.acc += dt; this.frames++;
      if (this.acc < 1) return;
      this.fps = this.frames / this.acc;
      this.acc = 0; this.frames = 0;
      if (this.mode !== 'auto') return;
      if (this.fps < 45) { this.slow++; this.fast = 0; } else if (this.fps > 58) { this.fast++; this.slow = 0; } else { this.slow = 0; this.fast = 0; }
      const i = ORDER.indexOf(this.tier);
      if (this.slow >= 2) {
        this.slow = 0;
        if (i > 0) this.tier = ORDER[i - 1];
        else if (this.fps < 28 && this.scale > 0.8) this.scale = 0.8;
        else return;
        this.apply();
      } else if (this.fast >= 8) {
        this.fast = 0;
        if (this.scale < 1) this.scale = 1;
        else if (i < ORDER.length - 1) this.tier = ORDER[i + 1];
        else return;
        this.apply();
      }
    },
    render(dt) {
      ink.uniforms.uTime.value = (ink.uniforms.uTime.value + dt) % 100;
      if (this.direct) renderer.render(scene, camera);
      else composer.render(dt);
    },
  };
  api.apply();
  return api;
}
