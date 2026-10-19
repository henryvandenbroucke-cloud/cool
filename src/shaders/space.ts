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

// Sparse, filamentary emission nebula confined to a patch of sky.
vec3 nebula(vec3 d, vec3 center, float size, vec3 colA, vec3 colB, float seed) {
  float a = dot(d, center);
  float mask = smoothstep(cos(size), cos(size * 0.25), a);
  if (mask <= 0.0) return vec3(0.0);
  vec3 q = d * 2.6 + seed;
  vec3 w = q + 1.8 * vec3(fbm(q * 1.3, 4), fbm(q * 1.3 + 5.2, 4), fbm(q * 1.3 + 9.7, 4));
  float n = fbm(w * 1.7, 6) * 0.5 + 0.5;
  float body = pow(max(n - 0.42, 0.0) * 1.9, 2.2);
  float filaments = pow(ridged(w * 2.6, 5), 4.0);
  float holes = smoothstep(0.55, 0.85, fbm(w * 3.1 + 2.0, 4) * 0.5 + 0.5);
  vec3 col = mix(colA, colB, smoothstep(0.35, 0.75, n));
  return col * (body * 1.4 + filaments * 0.5) * (1.0 - holes * 0.7) * mask * mask;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 seed = vec3(uSeed);
  vec3 col = vec3(0.0013, 0.0019, 0.0046);

  // Milky Way: a narrow clumpy band, a faint wide halo, a warm core and dark dust lanes.
  float h = dot(d, uBandNormal);
  float warp = fbm(d * 2.4 + seed, 4) * 0.07;
  float band = exp(-pow((h + warp) / 0.12, 2.0));
  float halo = exp(-pow(h / 0.36, 2.0));
  float core = pow(max(dot(d, uCoreDir), 0.0), 5.0);
  float clouds = pow(fbm(d * 7.0 + seed * 1.3, 6) * 0.5 + 0.5, 1.7);
  float grain = fbm(d * 38.0 + seed, 3) * 0.5 + 0.5;
  // Dust lanes are stretched along the band (anisotropic noise in band coordinates).
  vec3 along = normalize(cross(uBandNormal, vec3(0.0, 0.0, 1.0)));
  vec3 bd = vec3(dot(d, along) * 2.2, h * 9.0, dot(d, cross(uBandNormal, along)) * 2.2);
  float lanes = ridged(bd * 1.6 + seed * 2.1 + vec3(fbm(d * 2.2, 3)) * 0.4, 6);
  float dust = smoothstep(0.42, 0.9, lanes) * exp(-pow((h + warp * 0.6) / 0.05, 2.0));
  vec3 bandCol = mix(vec3(0.2, 0.22, 0.34), vec3(0.6, 0.46, 0.32), clamp(core * 1.8, 0.0, 1.0));
  float glow = band * (0.12 + clouds * 0.9) * (0.6 + grain * 0.6) + halo * 0.03 + core * (band * 0.55 + halo * 0.12);
  glow *= 1.0 - dust * 0.9;
  col += bandCol * glow * 0.1;

  // Emission nebulae in the GOD MODE palette — rare, wispy and dim, so space stays black.
  col += nebula(d, normalize(vec3(0.72, 0.22, -0.66)), 0.55, vec3(0.42, 0.16, 0.95), vec3(1.0, 0.3, 0.62), 1.3) * 0.075;
  col += nebula(d, normalize(vec3(-0.55, -0.32, 0.77)), 0.5, vec3(0.05, 0.42, 0.85), vec3(0.3, 0.95, 1.0), 4.2) * 0.06;
  col += nebula(d, normalize(vec3(-0.18, 0.78, -0.6)), 0.38, vec3(0.9, 0.3, 0.12), vec3(1.0, 0.68, 0.38), 7.7) * 0.05;

  // Distant galaxies: small tilted ellipses with bright cores.
  for (int i = 0; i < 7; i++) {
    vec3 g = normalize(hash33(vec3(float(i) * 17.0 + uSeed)) * 2.0 - 1.0);
    vec3 t1 = normalize(cross(g, vec3(0.3, 1.0, 0.1)));
    vec3 t2 = cross(g, t1);
    vec2 pl = vec2(dot(d, t1), dot(d, t2)) / max(dot(d, g), 0.0001);
    float ang = hash33(g * 9.0).x * 6.28;
    pl = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * pl;
    float sz = 0.004 + hash33(g * 3.0).z * 0.007;
    float e = length(pl * vec2(1.0, 2.4 + hash33(g).y * 2.2)) / sz;
    float gal = (exp(-e * e) + exp(-e * e * 9.0) * 1.5) * step(0.0, dot(d, g));
    col += mix(vec3(0.85, 0.8, 1.0), vec3(1.0, 0.82, 0.62), hash33(g * 5.0).x) * gal * 0.22;
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

/** Live foreground star layer: crisp points, gentle twinkle, rare diffraction spikes. */
export const BRIGHT_STARS_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute float aSize;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSpike;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vSpike;
void main() {
  float tw = 0.82 + 0.18 * sin(uTime * (0.7 + aPhase * 2.1) + aPhase * 40.0);
  vColor = aColor * tw;
  vSpike = aSpike;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * (aSpike > 0.5 ? 7.0 : 2.2);
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
  float a;
  if (vSpike > 0.5) {
    float core = exp(-d * 90.0) * 1.6 + exp(-d * 14.0) * 0.25;
    float spikes = (exp(-abs(c.x) * 70.0) * exp(-abs(c.y) * 2.6) + exp(-abs(c.y) * 70.0) * exp(-abs(c.x) * 2.6)) * 0.55;
    a = core + spikes;
  } else {
    a = exp(-d * 9.0);
  }
  if (a < 0.004) discard;
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
  float s = aOrbit.w > 1.5 ? 9.0 : (aOrbit.w > 0.5 ? 4.0 : 1.3);
  gl_PointSize = clamp(s * uPixelRatio * uScale * 0.02 / -mv.z, 0.8, aOrbit.w > 1.5 ? 48.0 : 9.0);
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
