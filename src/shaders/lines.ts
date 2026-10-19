import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';

/**
 * Screen-space ribbon: every polyline point is duplicated (side = ±1) and the
 * pair is pushed apart perpendicular to the projected line direction, giving
 * constant-pixel-width, anti-aliased lines with per-vertex fading.
 */
export const RIBBON_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aAge;
attribute float aDist;
uniform vec2 uResolution;
uniform float uWidth;
uniform vec3 uOffset;
uniform float uHeadShift;
varying float vAge;
varying float vSide;
varying float vDist;

vec2 toScreen(vec4 clip) {
  return clip.xy / max(abs(clip.w), 1e-6) * uResolution * 0.5;
}

void main() {
  mat4 vp = projectionMatrix * viewMatrix;
  vec4 cur = vp * vec4(position + uOffset, 1.0);
  vec4 prv = vp * vec4(aPrev + uOffset, 1.0);
  vec4 nxt = vp * vec4(aNext + uOffset, 1.0);
  vec2 s0 = toScreen(prv);
  vec2 s1 = toScreen(cur);
  vec2 s2 = toScreen(nxt);
  vec2 d1 = s1 - s0;
  vec2 d2 = s2 - s1;
  vec2 dir = length(d1) > 1e-4 ? normalize(d1) : vec2(1.0, 0.0);
  if (length(d2) > 1e-4) dir = normalize(dir + normalize(d2));
  vec2 normal = vec2(-dir.y, dir.x);
  float w = uWidth * (1.0 - aAge * 0.55);
  vec2 offset = normal * w * aSide / uResolution * 2.0;
  cur.xy += offset * cur.w;
  gl_Position = cur;
  vAge = aAge;
  vSide = aSide;
  // Distances were measured when the ribbon was last rebuilt; the live head has moved since.
  vDist = aAge > 0.0 ? aDist + uHeadShift : 0.0;
  #include <logdepthbuf_vertex>
}
`;

export const RIBBON_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform vec3 uColor;
uniform vec3 uHeadColor;
uniform float uOpacity;
uniform float uDash;
uniform float uTime;
uniform float uHeadClear;
varying float vAge;
varying float vSide;
varying float vDist;
void main() {
  // Bright core plus a soft glow skirt.
  float s = abs(vSide);
  float core = 1.0 - smoothstep(0.22, 0.5, s);
  float glow = exp(-s * 3.2) * 0.32 * (1.0 - smoothstep(0.8, 1.0, s));
  float edge = core + glow * (1.0 - core);
  float fade = pow(1.0 - vAge, 1.6);
  // Keep the line off the body itself.
  float clear = uHeadClear > 0.0 ? smoothstep(uHeadClear * 0.9, uHeadClear * 2.6, vDist) : 1.0;
  float a = edge * fade * clear * uOpacity;
  if (uDash > 0.0) {
    float m = fract(vDist / uDash - uTime * 0.6);
    a *= smoothstep(0.0, 0.08, m) * smoothstep(0.62, 0.5, m);
  }
  if (a < 0.002) discard;
  vec3 col = mix(uHeadColor, uColor, smoothstep(0.0, 0.25, vAge));
  gl_FragColor = vec4(col * a, a);
  ${FRAGMENT_OUTRO}
}
`;
