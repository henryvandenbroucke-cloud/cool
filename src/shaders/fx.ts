import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';
import { NOISE_GLSL } from './noise';

/**
 * Pooled GPU debris particles. Each particle stores its spawn state; the
 * vertex shader evaluates position, cooling colour and size analytically, so
 * the CPU only writes when a burst is spawned.
 */
export const DEBRIS_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
#define MAX_ANCHORS 16
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec4 aParams; // birth, life, size, anchor slot
attribute float aKind;  // 0 spark, 1 ember, 2 smoke, 3 absorb streamer
uniform float uTime;
uniform vec3 uAnchors[MAX_ANCHORS];
uniform float uPixelRatio;
uniform float uViewport;
varying float vT;
varying float vKind;
varying float vSeed;
varying vec2 vDir;
varying float vStretch;

vec3 positionAt(float age, vec3 anchor) {
  float drag = aKind > 1.5 ? 1.6 : (aKind > 0.5 ? 0.6 : 1.1);
  float f = (1.0 - exp(-drag * age)) / drag;
  return anchor + aStart + aVel * f;
}

void main() {
  float age = uTime - aParams.x;
  float life = aParams.y;
  float t = age / life;
  vT = t;
  vKind = aKind;
  vSeed = fract(aParams.z * 91.7 + aStart.x * 13.1);
  vDir = vec2(1.0, 0.0);
  vStretch = 1.0;
  if (t < 0.0 || t > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  int slot = int(aParams.w);
  vec3 anchor = uAnchors[slot];
  vec3 p;
  if (aKind > 2.5) {
    // Absorption streamers spiral into the anchor (the black hole).
    float k = pow(t, 1.6);
    float r = length(aStart) * (1.0 - k);
    vec3 axis = normalize(aVel);
    vec3 e1 = normalize(aStart);
    vec3 e2 = cross(axis, e1);
    float ang = k * 9.0;
    p = anchor + (e1 * cos(ang) + e2 * sin(ang)) * r;
  } else {
    p = positionAt(age, anchor);
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  gl_Position = clip;
  float grow = aKind > 1.5 ? (1.0 + t * 3.0) : (1.0 - t * 0.5);
  float px = aParams.z * grow * projectionMatrix[1][1] * uViewport * 0.5 / max(-mv.z, 1e-6);
  // Motion streak: stretch sparks along their projected velocity.
  if (aKind < 1.5) {
    vec3 p2 = aKind > 2.5 ? p : positionAt(age + 0.06, anchor);
    vec4 c2 = projectionMatrix * viewMatrix * vec4(p2, 1.0);
    vec2 sv = (c2.xy / c2.w - clip.xy / clip.w) * uViewport * 0.5;
    float len = length(sv);
    if (len > 1e-3) vDir = sv / len;
    vStretch = clamp(1.0 + len / max(px, 1.0), 1.0, aKind > 0.5 ? 3.0 : 5.0);
  }
  gl_PointSize = clamp(px * uPixelRatio * vStretch, 1.5, aKind > 1.5 ? 96.0 : 48.0);
  #include <logdepthbuf_vertex>
}
`;

export const DEBRIS_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform float uIntensity;
varying float vT;
varying float vKind;
varying float vSeed;
varying vec2 vDir;
varying float vStretch;

vec3 cooling(float h) {
  vec3 white = vec3(1.0, 0.94, 0.82);
  vec3 yellow = vec3(1.0, 0.68, 0.22);
  vec3 orange = vec3(1.0, 0.33, 0.05);
  vec3 red = vec3(0.55, 0.07, 0.02);
  vec3 ember = vec3(0.1, 0.02, 0.01);
  if (h > 0.8) return mix(yellow, white, (h - 0.8) / 0.2);
  if (h > 0.55) return mix(orange, yellow, (h - 0.55) / 0.25);
  if (h > 0.3) return mix(red, orange, (h - 0.3) / 0.25);
  return mix(ember, red, h / 0.3);
}

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  c.y = -c.y;
  // Rotate into the velocity frame and squash across it.
  vec2 q = vec2(dot(c, vDir), dot(c, vec2(-vDir.y, vDir.x)) * vStretch);
  float d = dot(q, q);
  if (d > 1.0) discard;
  float heat = 1.0 - vT;
  vec3 col;
  float a;
  if (vKind > 2.5) {
    col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.88, 0.62), heat) * 2.4;
    a = exp(-d * 4.0) * smoothstep(0.0, 0.1, vT) * (1.0 - vT);
  } else if (vKind > 1.5) {
    // Hot dust: dim, dark red, broad and short-lived.
    col = mix(vec3(0.32, 0.08, 0.03), vec3(0.04, 0.03, 0.05), vT);
    a = exp(-d * 2.4) * (1.0 - vT) * (1.0 - vT) * 0.32;
  } else {
    float h = clamp(heat * (vKind > 0.5 ? 0.85 : 1.15) - vSeed * 0.18, 0.0, 1.0);
    col = cooling(h) * (1.0 + h * h * 4.0);
    a = exp(-d * 3.2) * smoothstep(1.0, 0.7, vT);
  }
  gl_FragColor = vec4(col * a * uIntensity, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Expanding shockwave ring (lies in the plane perpendicular to the impact normal). */
export const SHOCK_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const SHOCK_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
uniform float uT;
uniform vec3 uColor;
uniform float uSeed;
varying vec2 vLocal;
void main() {
  float r = length(vLocal);
  float ring = exp(-pow((r - 0.92) / 0.018, 2.0)) * 1.2 + exp(-pow((r - 0.84) / 0.07, 2.0)) * 0.14;
  float a = atan(vLocal.y, vLocal.x);
  float n = 0.55 + 0.45 * (fbm(vec3(cos(a) * 4.0, sin(a) * 4.0, uSeed + uT * 2.0), 4) * 0.5 + 0.5);
  float fade = pow(1.0 - uT, 2.2);
  vec3 col = mix(uColor, vec3(1.0, 0.9, 0.75), pow(1.0 - uT, 3.0) * 0.7) * ring * n * fade * 2.6;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Spaghettified ghost of a body falling into a black hole. */
export const GHOST_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform vec3 uColor;
uniform float uT;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), V)), 1.5);
  vec3 hot = mix(uColor, vec3(1.0, 0.55, 0.15), uT);
  vec3 col = hot * (0.4 + rim * 2.5) * (1.0 + uT * 3.0) * (1.0 - smoothstep(0.75, 1.0, uT));
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;
