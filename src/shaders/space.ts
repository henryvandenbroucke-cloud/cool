import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';
import { NOISE_GLSL } from './noise';

/**
 * Procedural deep-space backdrop, rendered once into a cubemap: a Milky-Way
 * band with dust lanes and a bright core, coloured emission nebulae in the
 * GOD MODE palette, and a few distant galaxies.
 */
export const SKY_BAKE_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_BAKE_FRAGMENT = /* glsl */ `
${NOISE_GLSL}
uniform float uSeed;
uniform vec3 uBandNormal;
uniform vec3 uCoreDir;
varying vec3 vDir;

vec3 nebula(vec3 d, vec3 center, float size, vec3 colA, vec3 colB, float seed) {
  float a = dot(d, center);
  float mask = smoothstep(cos(size), cos(size * 0.15), a);
  if (mask <= 0.0) return vec3(0.0);
  vec3 q = d * 3.0 + seed;
  vec3 w = q + 1.6 * vec3(fbm(q * 1.2, 4), fbm(q * 1.2 + 5.2, 4), fbm(q * 1.2 + 9.7, 4));
  float n = fbm(w * 1.6, 6) * 0.5 + 0.5;
  float filaments = pow(ridged(w * 2.2, 5), 2.0);
  vec3 col = mix(colA, colB, smoothstep(0.3, 0.8, n));
  return col * (pow(n, 2.4) * 0.9 + filaments * 0.35) * mask;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 seed = vec3(uSeed);
  vec3 col = vec3(0.004, 0.006, 0.014);

  // Milky Way band.
  float h = dot(d, uBandNormal);
  float warp = fbm(d * 3.0 + seed, 5) * 0.08;
  float band = exp(-pow((h + warp) / 0.17, 2.0));
  float wide = exp(-pow(h / 0.42, 2.0));
  float core = pow(max(dot(d, uCoreDir), 0.0), 6.0);
  float clouds = fbm(d * 5.0 + seed * 1.3, 7) * 0.5 + 0.5;
  float stars = fbm(d * 40.0 + seed, 3) * 0.5 + 0.5;
  float lanes = pow(ridged(d * 4.5 + seed * 2.1 + vec3(fbm(d * 3.0, 3)) * 0.6, 6), 1.6);
  float dust = smoothstep(0.35, 0.85, lanes) * exp(-pow(h / 0.07, 2.0));
  vec3 bandCol = mix(vec3(0.22, 0.24, 0.36), vec3(0.62, 0.5, 0.38), core * 1.6 + 0.15);
  float glow = band * (0.32 + clouds * 0.75) * (0.55 + stars * 0.6) + wide * 0.06 + core * band * 1.1;
  glow *= 1.0 - dust * 0.88;
  col += bandCol * glow * 0.42;

  // Emission nebulae in the GOD MODE palette.
  col += nebula(d, normalize(vec3(0.7, 0.25, -0.65)), 0.75, vec3(0.32, 0.18, 0.9), vec3(0.95, 0.35, 0.65), 1.3) * 0.22;
  col += nebula(d, normalize(vec3(-0.55, -0.35, 0.75)), 0.65, vec3(0.08, 0.55, 0.85), vec3(0.4, 0.95, 1.0), 4.2) * 0.17;
  col += nebula(d, normalize(vec3(-0.2, 0.75, -0.6)), 0.5, vec3(0.85, 0.32, 0.18), vec3(1.0, 0.7, 0.4), 7.7) * 0.10;
  col += nebula(d, normalize(vec3(0.1, -0.85, -0.5)), 0.55, vec3(0.45, 0.2, 0.75), vec3(0.2, 0.6, 0.95), 10.1) * 0.10;

  // Faint large-scale cosmic haze so the sky never reads as flat black.
  col += vec3(0.04, 0.03, 0.08) * (fbm(d * 1.5 + seed * 3.0, 4) * 0.5 + 0.5) * 0.35;

  // Distant galaxies: small tilted ellipses.
  for (int i = 0; i < 6; i++) {
    vec3 g = normalize(hash33(vec3(float(i) * 17.0 + uSeed)) * 2.0 - 1.0);
    vec3 t1 = normalize(cross(g, vec3(0.3, 1.0, 0.1)));
    vec3 t2 = cross(g, t1);
    vec2 pl = vec2(dot(d, t1), dot(d, t2)) / max(dot(d, g), 0.0001);
    float ang = hash33(g * 9.0).x * 6.28;
    pl = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * pl;
    float e = length(pl * vec2(1.0, 2.6 + hash33(g).y * 2.0)) / (0.006 + hash33(g * 3.0).z * 0.008);
    float gal = exp(-e * e) * step(0.0, dot(d, g));
    col += mix(vec3(0.9, 0.8, 1.0), vec3(1.0, 0.85, 0.65), hash33(g * 5.0).x) * gal * 0.5;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/** Star points baked into the cubemap. */
export const SKY_STARS_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
void main() {
  vColor = aColor;
  gl_PointSize = aSize;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_STARS_FRAGMENT = /* glsl */ `
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float g = exp(-d * 4.5);
  gl_FragColor = vec4(vColor * g, 1.0);
}
`;

/** Live foreground star layer with gentle twinkle and diffraction spikes on the brightest. */
export const BRIGHT_STARS_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vSpike;
void main() {
  float tw = 0.78 + 0.22 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
  vColor = aColor * tw;
  vSpike = smoothstep(3.4, 5.0, aSize);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (vSpike > 0.0 ? 3.2 : 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const BRIGHT_STARS_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
varying vec3 vColor;
varying float vSpike;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  float core = exp(-d * (vSpike > 0.0 ? 30.0 : 5.0));
  float spikes = vSpike * (exp(-abs(c.x) * 40.0) + exp(-abs(c.y) * 40.0)) * exp(-d * 2.2) * 0.6;
  float a = core + spikes;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Slow-drifting cosmic dust around the camera: gives parallax and depth. */
export const DUST_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute vec4 aSeed;
uniform float uBox;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec3 drift = vec3(sin(uTime * 0.03 + aSeed.w * 6.0), cos(uTime * 0.021 + aSeed.w * 3.0), sin(uTime * 0.017 + aSeed.w)) * 0.03;
  vec3 local = mod(aSeed.xyz + drift - cameraPosition / uBox, 1.0) - 0.5;
  vec3 wp = cameraPosition + local * uBox;
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = length(local) * 2.0;
  vAlpha = smoothstep(1.0, 0.45, dist) * smoothstep(0.02, 0.12, dist);
  vColor = mix(vec3(0.55, 0.65, 1.0), vec3(0.75, 0.55, 1.0), aSeed.w);
  gl_PointSize = clamp((0.6 + aSeed.w * 1.6) * uPixelRatio * (uBox * 0.06) / -mv.z, 0.5, 4.0);
  #include <logdepthbuf_vertex>
}
`;

export const DUST_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d * 3.0) * vAlpha * 0.16, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Procedural spiral galaxy (decorative): flat rotation curve, evaluated on the GPU. */
export const GALAXY_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute vec4 aOrbit; // radius, angle, height, kind (0 star, 1 HII, 2 dust)
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
uniform float uScale;
varying vec3 vColor;
varying float vKind;
void main() {
  float r = aOrbit.x;
  float v = r / sqrt(r * r + 0.04);
  float omega = v / max(r, 0.02);
  float a = aOrbit.y + uTime * omega * 0.35;
  vec3 p = vec3(cos(a) * r, aOrbit.z, sin(a) * r) * uScale;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vKind = aOrbit.w;
  float s = aOrbit.w > 1.5 ? 9.0 : (aOrbit.w > 0.5 ? 4.5 : 1.8);
  gl_PointSize = clamp(s * uPixelRatio * uScale * 0.02 / -mv.z, 0.6, aOrbit.w > 1.5 ? 48.0 : 10.0);
  #include <logdepthbuf_vertex>
}
`;

export const GALAXY_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
varying vec3 vColor;
varying float vKind;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float g = exp(-d * (vKind > 1.5 ? 2.0 : 4.0));
  gl_FragColor = vec4(vColor * g, 1.0);
  ${FRAGMENT_OUTRO}
}
`;
