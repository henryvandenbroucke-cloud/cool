import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';
import { NOISE_GLSL } from './noise';

export const STAR_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
uniform vec3 uColor;
uniform vec3 uHot;
uniform float uTime;
uniform float uIntensity;
uniform float uSeed;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  vec3 p = normalize(vObjPos) + uSeed;
  float t = uTime * 0.04;
  // Convection cells (granulation) and supergranulation.
  vec2 cells = voronoi(p * 26.0 + vec3(t, -t, t * 0.5));
  float gran = smoothstep(0.0, 0.55, cells.y - cells.x);
  float big = fbm(p * 3.5 + vec3(0.0, t * 0.6, 0.0), 5);
  float spots = smoothstep(0.42, 0.62, fbm(p * 2.2 - t * 0.2, 4)) * smoothstep(0.75, 0.3, abs(normalize(vObjPos).y));
  float faculae = smoothstep(0.2, 0.7, big) * pow(1.0 - mu, 2.0);
  // Limb darkening (Eddington-like).
  float limb = 0.36 + 0.64 * pow(mu, 0.55);
  vec3 col = mix(uColor, uHot, pow(mu, 3.0) * 0.6);
  float brightness = (0.78 + 0.32 * gran + 0.18 * big) * limb;
  brightness *= 1.0 - spots * 0.75;
  brightness += faculae * 0.35;
  gl_FragColor = vec4(col * brightness * uIntensity, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Camera-facing quad: corona, streamers and the soft bloom halo. */
export const BILLBOARD_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  center.xy += position.xy * uSize;
  gl_Position = projectionMatrix * center;
  #include <logdepthbuf_vertex>
}
`;

export const CORONA_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uRatio; // billboard half-size / star radius
uniform float uSeed;
varying vec2 vUv;

void main() {
  float r = length(vUv) * uRatio; // in star radii
  if (r < 0.98) discard;
  float a = atan(vUv.y, vUv.x);
  float glow = exp(-(r - 1.0) * 2.4) * 1.1 + 0.6 / (r * r * r) + 0.08 / r;
  float streams = fbm(vec3(cos(a) * 2.2, sin(a) * 2.2, uTime * 0.05 + uSeed), 4) * 0.5 + 0.5;
  float rays = pow(streams, 3.0) * exp(-(r - 1.0) * 0.9) * 1.4;
  float fine = pow(fbm(vec3(cos(a) * 9.0, sin(a) * 9.0, r * 0.4 - uTime * 0.08), 3) * 0.5 + 0.5, 4.0) * exp(-(r - 1.0) * 1.6);
  float edge = smoothstep(uRatio, uRatio * 0.6, r);
  float inner = smoothstep(0.98, 1.04, r);
  vec3 col = uColor * (glow + rays + fine * 0.8) * uIntensity * edge * inner;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Soft radial glow used for distant stars, flashes and black-hole halos. */
export const GLOW_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uFalloff;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float g = exp(-r * uFalloff) * smoothstep(1.0, 0.6, r);
  gl_FragColor = vec4(uColor * g * uIntensity, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

export const RING_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec3 vWorldPos;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const RING_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
#define MAX_LIGHTS 4
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
uniform float uLightStrength[MAX_LIGHTS];
uniform int uLightCount;
uniform float uRenderScale;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uInner;
uniform float uOuter;
uniform float uSeed;
uniform vec3 uCenter;
uniform float uPlanetRadius;
uniform vec3 uNormal;
varying vec3 vWorldPos;
varying vec2 vLocal;

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  return mix(hash(i + uSeed), hash(i + 1.0 + uSeed), smoothstep(0.0, 1.0, f));
}

float irradianceR(int i, float distScene) {
  float d = distScene / uRenderScale;
  float e = uLightStrength[i] / sqrt(d + 0.06);
  return 1.0 - exp(-1.5 * e);
}

void main() {
  float r = length(vLocal);
  float t = (r - uInner) / (uOuter - uInner);
  if (t < 0.0 || t > 1.0) discard;
  float bands = noise1(t * 70.0) * 0.55 + noise1(t * 190.0) * 0.3 + noise1(t * 23.0) * 0.4;
  float density = smoothstep(0.0, 0.04, t) * smoothstep(1.0, 0.93, t);
  density *= 0.35 + bands * 0.85;
  // Divisions.
  density *= 1.0 - 0.85 * exp(-pow((t - 0.62) / 0.025, 2.0));
  density *= 1.0 - 0.5 * exp(-pow((t - 0.86) / 0.012, 2.0));
  density *= mix(0.55, 1.0, smoothstep(0.0, 0.25, t));
  vec3 col = uColor * (0.75 + 0.5 * noise1(t * 340.0));

  vec3 light = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 Lv = uLightPos[i] - vWorldPos;
    float dist = length(Lv);
    vec3 L = Lv / dist;
    // Planet shadow on the rings (ray–sphere test toward the light).
    vec3 oc = vWorldPos - uCenter;
    float b = dot(oc, L);
    float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
    float disc = b * b - c;
    float shadow = (disc > 0.0 && -b - sqrt(disc) > 0.0) ? 0.06 : 1.0;
    float facing = abs(dot(uNormal, L));
    light += uLightColor[i] * irradianceR(i, dist) * (0.25 + 0.75 * facing) * shadow;
  }
  vec3 V = normalize(cameraPosition - vWorldPos);
  // Unlit side shows forward-scattered light through the ring.
  float alpha = clamp(density * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(col * (light + 0.01) * (0.85 + 0.3 * abs(dot(V, uNormal))), alpha);
  ${FRAGMENT_OUTRO}
}
`;

export const ROCK_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
#define MAX_LIGHTS 4
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
uniform float uLightStrength[MAX_LIGHTS];
uniform int uLightCount;
uniform float uRenderScale;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uHeat;
uniform float uSeed;
uniform float uIcy;
uniform float uHighlight;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;

float irradianceR(int i, float distScene) {
  float d = distScene / uRenderScale;
  float e = uLightStrength[i] / sqrt(d + 0.06);
  return 1.0 - exp(-1.5 * e);
}

void main() {
  vec3 p = normalize(vObjPos) * 2.0 + uSeed;
  float n = fbm(p * 2.5, 5);
  vec2 cr = voronoi(p * 4.0);
  float pit = smoothstep(0.32, 0.0, cr.x) * 0.6;
  vec3 albedo = mix(uC1, uC0, smoothstep(-0.5, 0.5, n));
  albedo = mix(albedo, uC2, smoothstep(0.3, 0.8, fbm(p * 9.0, 3)) * 0.4);
  albedo *= 1.0 - pit * 0.45;
  albedo = pow(albedo, vec3(2.2));
  vec3 N = normalize(vWorldNormal + 0.25 * vec3(snoise(p * 7.0), snoise(p * 7.0 + 3.0), snoise(p * 7.0 + 6.0)));
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 light = vec3(0.0);
  vec3 spec = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 Lv = uLightPos[i] - vWorldPos;
    float dist = length(Lv);
    vec3 L = Lv / dist;
    vec3 E = uLightColor[i] * irradianceR(i, dist);
    light += E * max(dot(N, L), 0.0);
    spec += E * pow(max(dot(N, normalize(L + V)), 0.0), 40.0) * uIcy * 0.6;
  }
  vec3 col = albedo * (light + 0.008) + spec;
  if (uHeat > 0.001) {
    float cracks = pow(1.0 - abs(snoise(p * 3.0)), 5.0);
    vec3 hot = mix(vec3(1.0, 0.2, 0.02), vec3(1.0, 0.8, 0.45), uHeat);
    col = mix(col, col * 0.3, uHeat * 0.6) + hot * (0.35 + cracks * 1.6) * uHeat * uHeat * 3.0;
  }
  col += vec3(0.25, 0.85, 1.0) * uHighlight * pow(1.0 - clamp(dot(normalize(vWorldNormal), V), 0.0, 1.0), 3.0) * 0.6;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Comet tail: a camera-facing ribbon stretched along the anti-stellar direction. */
export const TAIL_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
uniform vec3 uAxis;
uniform vec3 uBend;
uniform float uLength;
uniform float uWidth;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float along = uv.y;
  vec3 axis = normalize(uAxis + uBend * along * along);
  vec3 toCam = normalize(cameraPosition - center);
  vec3 side = normalize(cross(axis, toCam));
  float w = uWidth * (0.15 + along * 1.1);
  vec3 wp = center + axis * along * uLength + uBend * along * along * uLength * 0.35 + side * (uv.x - 0.5) * w;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

export const TAIL_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${NOISE_GLSL}
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uStreak;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float along = vUv.y;
  float profile = exp(-x * x * 4.0);
  float streak = 0.6 + 0.4 * (snoise(vec3(vUv.x * 18.0 * uStreak, along * 3.0 - uTime * 0.4, 0.0)) * 0.5 + 0.5);
  float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.04, along);
  vec3 col = uColor * profile * streak * fade * uIntensity;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;
