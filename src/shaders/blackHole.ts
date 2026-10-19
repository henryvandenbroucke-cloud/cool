import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';
import { NOISE_GLSL } from './noise';

/**
 * Stylised black-hole rendering. None of this is general relativity: it is a
 * set of real-time approximations inspired by ray-traced visualisations
 * (thin hot disk, photon ring, lensed far-side image, Doppler beaming).
 */

const TEMPERATURE_RAMP = /* glsl */ `
vec3 diskColor(float t) {
  // t = 1 hottest (inner edge) → 0 coolest (outer edge).
  vec3 c0 = vec3(0.35, 0.05, 0.01);
  vec3 c1 = vec3(0.95, 0.28, 0.04);
  vec3 c2 = vec3(1.0, 0.62, 0.22);
  vec3 c3 = vec3(1.0, 0.9, 0.75);
  vec3 c4 = vec3(1.0, 0.97, 0.94);
  if (t < 0.3) return mix(c0, c1, t / 0.3);
  if (t < 0.6) return mix(c1, c2, (t - 0.3) / 0.3);
  if (t < 0.85) return mix(c2, c3, (t - 0.6) / 0.25);
  return mix(c3, c4, (t - 0.85) / 0.15);
}
`;

export const DISK_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
uniform float uSpin;
varying vec2 vLocal;
varying vec3 vWorldPos;
varying vec3 vTangent;
void main() {
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vTangent = normalize(mat3(modelMatrix) * vec3(-position.y, position.x, 0.0)) * uSpin;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const DISK_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
${TEMPERATURE_RAMP}
uniform float uInner;
uniform float uOuter;
uniform float uHole;
uniform float uTime;
uniform float uIntensity;
uniform float uBeta;
uniform float uFlare;
varying vec2 vLocal;
varying vec3 vWorldPos;
varying vec3 vTangent;

void main() {
  float r = length(vLocal);
  float rn = r / uHole;
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float phi = atan(vLocal.y, vLocal.x);
  // Keplerian differential rotation: inner gas laps the outer gas.
  float omega = 2.2 / pow(rn, 1.5);
  float a1 = phi + uTime * omega;
  float a2 = phi + uTime * omega * 0.82 + 1.7;
  float lr = log(rn);
  float s1 = fbm(vec3(cos(a1) * 1.6, sin(a1) * 1.6, lr * 7.0), 5);
  float s2 = fbm(vec3(cos(a2) * 3.4, sin(a2) * 3.4, lr * 16.0 + 4.0), 4);
  float streaks = clamp(0.55 + s1 * 0.75 + s2 * 0.45, 0.0, 1.6);
  float lanes = 0.7 + 0.3 * sin(lr * 38.0 + s1 * 4.0);

  float temp = clamp(pow(uInner / r, 0.9), 0.0, 1.0);
  vec3 col = diskColor(temp * 0.92 + streaks * 0.08);
  float profile = smoothstep(0.0, 0.035, t) * pow(1.0 - t, 1.3) * pow(uInner / r, 1.1);
  float brightness = profile * streaks * lanes;

  // Relativistic Doppler beaming (approximate): gas moving toward the camera brightens and blue-shifts.
  vec3 V = normalize(cameraPosition - vWorldPos);
  float beta = uBeta / sqrt(rn);
  float cosA = dot(normalize(vTangent), V);
  float gamma = inversesqrt(1.0 - beta * beta);
  float D = 1.0 / (gamma * (1.0 - beta * cosA));
  float beam = clamp(pow(D, 3.0), 0.12, 5.0);
  col = mix(col, col * vec3(0.82, 0.95, 1.3), clamp(D - 1.0, 0.0, 1.0) * 0.6);
  col = mix(col, col * vec3(1.15, 0.7, 0.45), clamp(1.0 - D, 0.0, 1.0) * 0.6);

  vec3 outc = col * brightness * beam * uIntensity * (1.0 + uFlare * 2.0);
  gl_FragColor = vec4(outc, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Billboard: photon ring + the lensed image of the far side of the disk ("Gargantua arc"). */
export const HALO_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
${TEMPERATURE_RAMP}
uniform float uRatio;      // billboard half-size in hole radii
uniform vec3 uNormalView;  // disk normal in view space
uniform float uTime;
uniform float uIntensity;
uniform float uFlare;
uniform float uSpin;
varying vec2 vUv;

void main() {
  float rn = length(vUv) * uRatio;
  if (rn < 0.98) discard;
  vec2 dir = normalize(vUv);
  float edgeOn = 1.0 - abs(uNormalView.z);
  vec2 nScr = length(uNormalView.xy) > 1e-3 ? normalize(uNormalView.xy) : vec2(0.0, 1.0);
  float side = dot(dir, nScr);
  float across = dot(dir, vec2(-nScr.y, nScr.x)) * uSpin;

  // Photon ring: nested, progressively thinner rings.
  float ring = exp(-pow((rn - 1.035) / 0.018, 2.0)) * 2.2 + exp(-pow((rn - 1.085) / 0.05, 2.0)) * 0.55;

  // Lensed far-side disk: an arc over the top (edge-on) or a full ring (face-on).
  float upper = smoothstep(-0.25, 0.75, side);
  float lower = smoothstep(-0.25, 0.75, -side) * 0.35;
  float weight = mix(0.5, upper + lower, edgeOn);
  float band = smoothstep(1.1, 1.3, rn) * smoothstep(2.5, 1.45, rn);
  float phi = atan(vUv.y, vUv.x);
  float a = phi + uTime * 1.1 * uSpin;
  float streaks = 0.6 + 0.6 * fbm(vec3(cos(a) * 2.0, sin(a) * 2.0, rn * 4.0), 4);
  float temp = clamp(1.4 - (rn - 1.1) * 0.75, 0.0, 1.0);
  vec3 arc = diskColor(temp) * band * weight * streaks * (1.0 + 0.55 * across * edgeOn) * 1.4;

  vec3 col = diskColor(0.95) * ring * (1.0 + uFlare * 3.0) + arc;
  // Faint warm glow bleeding outward.
  col += vec3(1.0, 0.45, 0.12) * exp(-(rn - 1.0) * 1.8) * 0.12;
  float fade = smoothstep(uRatio, uRatio * 0.7, rn);
  gl_FragColor = vec4(col * uIntensity * fade, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/**
 * Background lensing: re-samples the sky cubemap along bent rays using a
 * thin-lens mapping β = θ − θE²/θ (tapered to zero at the billboard edge).
 */
export const LENS_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
uniform float uSize;
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vCenterView;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vCenterView = center.xyz;
  center.xy += position.xy * uSize;
  vViewPos = center.xyz;
  gl_Position = projectionMatrix * center;
  #include <logdepthbuf_vertex>
}
`;

/**
 * Background lensing: re-samples the sky cubemap along bent rays using a
 * thin-lens mapping β = θ − θE²/θ (tapered to zero at the billboard edge).
 * Works in view space, then rotates the bent ray back to world space.
 */
export const LENS_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform samplerCube uSky;
uniform float uHoleRadius;
uniform float uSize;
uniform float uStrength;
varying vec2 vUv;
varying vec3 vViewPos;
varying vec3 vCenterView;

void main() {
  float rUv = length(vUv);
  if (rUv > 1.0) discard;
  float dist = length(vCenterView);
  vec3 c = vCenterView / dist;
  vec3 rd = normalize(vViewPos);
  float theta = acos(clamp(dot(rd, c), -1.0, 1.0));
  float thetaHole = atan(uHoleRadius / dist);
  float thetaMax = atan(uSize / dist);
  float thetaE = thetaHole * uStrength;
  float taper = 1.0 - smoothstep(thetaMax * 0.4, thetaMax * 0.98, theta);
  float beta = theta - (thetaE * thetaE / max(theta, 1e-5)) * taper;
  vec3 perp = rd - c * dot(rd, c);
  float pl = length(perp);
  perp = pl > 1e-6 ? perp / pl : vec3(1.0, 0.0, 0.0);
  vec3 bentView = normalize(c * cos(beta) + perp * sin(beta));
  vec3 bentWorld = normalize((vec4(bentView, 0.0) * viewMatrix).xyz);
  vec3 col = textureCube(uSky, bentWorld).rgb;
  float alpha = smoothstep(1.0, 0.9, rUv);
  gl_FragColor = vec4(col, alpha);
  ${FRAGMENT_OUTRO}
}
`;

export const INFALL_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
attribute vec4 aParams; // r0, phase, lifetime, seed
uniform float uTime;
uniform float uHole;
uniform float uScale;
uniform float uSpin;
varying float vHeat;
varying float vAlpha;
void main() {
  float r0 = aParams.x;
  float life = fract((uTime + aParams.w * 37.0) / aParams.z);
  float rn = mix(r0, 1.3, pow(life, 1.7));
  float angle = aParams.y + uSpin * (uTime * 2.2 / pow(rn, 1.5) + life * 6.0 / rn);
  float h = (fract(aParams.w * 13.7) - 0.5) * 0.18 * rn * (1.0 - life);
  // Prograde = counter-clockwise seen from +Y (x → −z), matching the disk shader.
  vec3 p = vec3(cos(angle) * rn, h, -sin(angle) * rn) * uHole;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vHeat = clamp(1.6 / rn, 0.0, 1.0);
  vAlpha = smoothstep(0.0, 0.1, life) * smoothstep(1.0, 0.9, life);
  gl_PointSize = clamp(uScale * uHole * (0.6 + fract(aParams.w * 7.3)) / -mv.z, 1.0, 7.0);
  #include <logdepthbuf_vertex>
}
`;

export const INFALL_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${TEMPERATURE_RAMP}
uniform float uIntensity;
varying float vHeat;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float g = exp(-d * 3.0);
  gl_FragColor = vec4(diskColor(vHeat) * g * vAlpha * uIntensity, 1.0);
  ${FRAGMENT_OUTRO}
}
`;
