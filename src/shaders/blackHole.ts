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
  vec3 c0 = vec3(0.32, 0.04, 0.01);
  vec3 c1 = vec3(0.92, 0.22, 0.03);
  vec3 c2 = vec3(1.0, 0.5, 0.14);
  vec3 c3 = vec3(1.0, 0.78, 0.5);
  vec3 c4 = vec3(1.0, 0.93, 0.82);
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
  float lr = log(rn);
  // Keplerian differential rotation (inner gas laps the outer gas) plus a
  // logarithmic shear, which stretches every clump into a spiral filament.
  float omega = 2.0 / pow(rn, 1.5);
  float a1 = phi + uTime * omega + lr * 2.6;
  float a2 = phi + uTime * omega * 0.9 + lr * 4.2 + 2.1;
  // Clumps a few per revolution, sheared into arcs; the radial warp breaks up concentric banding.
  vec3 q1 = vec3(cos(a1) * 2.6, sin(a1) * 2.6, lr * 4.0);
  vec3 warp = vec3(fbm(q1 * 1.2 + 7.0, 3), fbm(q1 * 1.2 + 13.0, 3), fbm(q1 * 1.2 + 21.0, 3)) * 0.9;
  float clumps = fbm(q1 + warp, 5) * 0.5 + 0.5;
  vec3 q2 = vec3(cos(a2) * 5.0, sin(a2) * 5.0, lr * 9.0) + warp * 1.4;
  // Fade fine radial detail when the disk is seen nearly edge-on (prevents moiré).
  float aa = clamp(1.0 - fwidth(lr * 9.0) * 1.6, 0.0, 1.0);
  float filaments = pow(1.0 - abs(snoise(q2)), 4.0) * aa;
  float gas = clamp(0.2 + pow(clumps, 1.4) * 1.15 + filaments * 0.3, 0.0, 1.7);

  float temp = clamp(pow(uInner / r, 0.75), 0.0, 1.0);
  vec3 col = diskColor(clamp(temp * 0.9 + (clumps - 0.5) * 0.18, 0.0, 1.0));
  float profile = smoothstep(0.0, 0.05, t) * pow(1.0 - t, 1.6) * pow(uInner / r, 1.25);
  // The hot innermost ring.
  profile += exp(-pow(t / 0.035, 2.0)) * 0.6;
  float brightness = profile * gas;

  // Relativistic Doppler beaming (approximate): gas moving toward the camera brightens and blue-shifts.
  vec3 V = normalize(cameraPosition - vWorldPos);
  float beta = uBeta / sqrt(rn);
  float cosA = dot(normalize(vTangent), V);
  float gamma = inversesqrt(1.0 - beta * beta);
  float D = 1.0 / (gamma * (1.0 - beta * cosA));
  float beam = clamp(pow(D, 3.0), 0.1, 5.0);
  col = mix(col, col * vec3(0.85, 0.97, 1.25), clamp(D - 1.0, 0.0, 1.0) * 0.55);
  col = mix(col, col * vec3(1.1, 0.62, 0.4), clamp(1.0 - D, 0.0, 1.0) * 0.7);

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
  if (rn < 0.99) discard;
  vec2 dir = normalize(vUv);
  float edgeOn = 1.0 - abs(uNormalView.z);
  vec2 nScr = length(uNormalView.xy) > 1e-3 ? normalize(uNormalView.xy) : vec2(0.0, 1.0);
  float side = dot(dir, nScr);
  float across = dot(dir, vec2(-nScr.y, nScr.x)) * uSpin;

  // Photon ring: a razor-thin bright ring with a fainter secondary image.
  float ring = exp(-pow((rn - 1.025) / 0.011, 2.0)) * 1.5 + exp(-pow((rn - 1.06) / 0.03, 2.0)) * 0.3;

  // Lensed far side of the disk: an arc over the top when seen edge-on,
  // a full ring when seen face-on, brighter on the approaching side.
  float upper = smoothstep(-0.3, 0.8, side);
  float lower = smoothstep(-0.3, 0.8, -side) * 0.3;
  float weight = mix(0.42, upper + lower, edgeOn);
  float band = smoothstep(1.08, 1.22, rn) * smoothstep(2.15, 1.35, rn);
  float phi = atan(vUv.y, vUv.x);
  float a = phi + uTime * 1.2 * uSpin - log(rn) * 3.0;
  float streaks = 0.55 + 0.75 * (fbm(vec3(cos(a) * 1.8, sin(a) * 1.8, rn * 3.5), 4) * 0.5 + 0.5);
  float temp = clamp(0.74 - (rn - 1.1) * 0.45, 0.0, 1.0);
  vec3 arc = diskColor(temp) * band * weight * streaks * (1.0 + 0.6 * across * edgeOn) * 0.7;

  vec3 col = diskColor(0.86) * ring * (1.0 + uFlare * 3.0) + arc;
  col += vec3(1.0, 0.42, 0.1) * exp(-(rn - 1.0) * 2.4) * 0.06;
  float fade = smoothstep(uRatio, uRatio * 0.72, rn);
  gl_FragColor = vec4(col * uIntensity * fade, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

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
  gl_PointSize = clamp(uScale * uHole * (0.35 + fract(aParams.w * 7.3) * 0.5) / -mv.z, 1.0, 4.0);
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
