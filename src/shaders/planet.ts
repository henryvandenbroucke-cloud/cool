import { FRAGMENT_OUTRO, LIGHTS_GLSL, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from './common';
import { NOISE_GLSL } from './noise';

export const PLANET_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjNormal;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vObjNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const PLANET_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${LIGHTS_GLSL}
${NOISE_GLSL}
uniform sampler2D uMapA;
uniform sampler2D uMapB;
uniform int uStyle;
uniform float uTime;
uniform float uFlow;
uniform float uCloudShift;
uniform vec3 uAtmoColor;
uniform float uAtmoDensity;
uniform float uCity;
uniform float uLava;
uniform float uHeat;
uniform vec3 uImpactDir;
uniform float uBump;
uniform float uDetail;
uniform float uImpactSize;
// Ring shadow cast onto the planet.
uniform float uHasRings;
uniform vec3 uRingNormal;
uniform vec3 uCenter;
uniform vec2 uRingRadii;
uniform float uRingOpacity;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjNormal;

vec3 srgbToLinear(vec3 c) { return pow(c, vec3(2.2)); }

vec3 perturb(vec3 N, float h) {
  vec3 dpx = dFdx(vWorldPos);
  vec3 dpy = dFdy(vWorldPos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(dpy, N);
  vec3 r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * N - grad);
}

float ringShadow(vec3 L) {
  if (uHasRings < 0.5) return 1.0;
  float denom = dot(L, uRingNormal);
  if (abs(denom) < 1e-4) return 1.0;
  float t = dot(uCenter - vWorldPos, uRingNormal) / denom;
  if (t <= 0.0) return 1.0;
  float r = length(vWorldPos + L * t - uCenter);
  float inRing = smoothstep(uRingRadii.x, uRingRadii.x * 1.03, r) * smoothstep(uRingRadii.y, uRingRadii.y * 0.97, r);
  float bands = 0.65 + 0.35 * sin(r / uRingRadii.y * 90.0);
  return 1.0 - inRing * uRingOpacity * 0.75 * bands;
}

void main() {
  vec2 uv = vUv;
  float lat = uv.y * 2.0 - 1.0;
  bool gas = uStyle >= 8 && uStyle <= 11;
  if (gas) {
    // Differential rotation: neighbouring bands drift past each other.
    uv.x += uTime * uFlow * (sin(lat * 23.0) * 0.6 + sin(lat * 7.0) * 0.4);
  }
  vec4 A = texture2D(uMapA, uv);
  vec4 B = texture2D(uMapB, uv);
  vec3 albedo = srgbToLinear(A.rgb);
  vec3 objN = normalize(vObjNormal);
  // Close-up micro detail so the baked texture never looks soft — faded out
  // by screen footprint so it never sparkles or aliases at a distance.
  float footprint = length(fwidth(objN)) * 260.0;
  float detailFade = (1.0 - smoothstep(0.2, 0.8, footprint)) * uDetail;
  float detail = detailFade > 0.0 ? snoise(objN * 260.0) * 0.6 + snoise(objN * 700.0) * 0.4 : 0.0;
  albedo *= 1.0 + detail * 0.06 * detailFade * (gas ? 0.25 : 1.0);

  vec3 Ng = normalize(vWorldNormal);
  float h = B.r * uBump + detail * uBump * 0.06 * detailFade;
  vec3 N = gas ? Ng : perturb(Ng, h);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 diffuse = vec3(0.0);
  vec3 cloudLight = vec3(0.0);
  vec3 spec = vec3(0.0);
  vec3 atmoLight = vec3(0.0);
  float sunAccum = 0.0;
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 Lv = uLightPos[i] - vWorldPos;
    float dist = length(Lv);
    vec3 L = Lv / dist;
    vec3 E = uLightColor[i] * irradiance(i, dist);
    float shadow = ringShadow(L);
    float ndl = dot(N, L);
    float ndlG = dot(Ng, L);
    float terminator = smoothstep(-0.03, 0.1, ndlG);
    // Slightly warm, reddened light right at the terminator (light through atmosphere).
    vec3 Et = mix(E * vec3(1.0, 0.62, 0.42), E, smoothstep(0.0, 0.3, ndlG));
    vec3 Ed = uAtmoDensity > 0.0 ? Et : E;
    diffuse += Ed * max(ndl, 0.0) * terminator * shadow;
    cloudLight += Ed * clamp(ndlG * 1.15 + 0.03, 0.0, 1.0) * shadow;
    vec3 H = normalize(L + V);
    float nh = max(dot(N, H), 0.0);
    float fresnelS = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float glint = (pow(nh, 160.0) * 3.2 + pow(nh, 22.0) * 0.06) * (0.5 + fresnelS);
    spec += E * glint * A.a * terminator * shadow;
    atmoLight += Et * smoothstep(-0.12, 0.45, ndlG);
    sunAccum += smoothstep(-0.12, 0.3, ndlG) * irradiance(i, dist);
  }

  vec3 col = albedo * (diffuse + vec3(0.004, 0.005, 0.008));
  if (gas) {
    // Limb darkening on gaseous worlds.
    float mu = clamp(dot(Ng, V), 0.0, 1.0);
    col *= mix(1.0, pow(mu, 0.45), 0.55);
  }
  col += spec;

  // Clouds drift relative to the ground and cast faint shadows.
  if (uStyle == 0 || uStyle == 1 || uStyle == 5 || uStyle == 6) {
    float cl = texture2D(uMapB, uv + vec2(uCloudShift, 0.0)).b;
    float shade = texture2D(uMapB, uv + vec2(uCloudShift + 0.004, 0.002)).b;
    col *= 1.0 - shade * 0.35;
    vec3 cloudCol = uStyle == 1 ? vec3(0.85, 0.6, 0.45) : vec3(0.97);
    col = mix(col, cloudCol * (cloudLight + 0.004), cl * 0.92);
    B.g *= 1.0 - cl * 0.85;
  }

  float night = 1.0 - clamp(sunAccum * 2.5, 0.0, 1.0);
  // City lights on the night side.
  col += vec3(1.0, 0.68, 0.32) * B.g * uCity * night * 1.6;
  // Lava glows on both hemispheres, pulsing gently.
  float pulse = 0.75 + 0.25 * sin(uTime * 1.7 + B.r * 30.0);
  col += vec3(1.0, 0.32, 0.05) * pow(B.g, 1.4) * uLava * pulse * 2.8;

  // Impact heat: a molten wound centred on the impact site. Its reach scales
  // with the impactor size and the glow cools (shrinks, reddens) over time.
  if (uHeat > 0.001) {
    float facing = dot(objN, normalize(uImpactDir));
    float wobble = 0.06 * snoise(objN * 4.0);
    float spread = clamp(uImpactSize, 0.15, 1.3) * (0.3 + 0.7 * uHeat);
    float reach = smoothstep(1.0 - spread, 1.0 - spread * 0.2, facing + wobble);
    float rim = exp(-pow((facing + wobble - (1.0 - spread)) / (0.04 + spread * 0.06), 2.0));
    vec2 cell = voronoi(objN * 6.0);
    float cracks = 1.0 - smoothstep(0.0, 0.045, cell.y - cell.x);
    float fine = pow(1.0 - abs(snoise(objN * 22.0 + uTime * 0.03)), 8.0);
    float molten = reach * uHeat;
    float core = pow(smoothstep(1.0 - spread * 0.45, 1.0, facing + wobble), 2.0) * uHeat;
    // Charred crust around the wound, glowing seams inside it, a molten pool at the centre.
    col = mix(col, col * 0.15, clamp(molten * 1.3 + rim * uHeat * 0.35, 0.0, 0.88));
    float glow = molten * (0.12 + cracks * 0.9 + fine * 0.35) + core * 1.1 + rim * uHeat * 0.18;
    vec3 hot = mix(vec3(0.75, 0.08, 0.01), vec3(1.0, 0.42, 0.06), clamp(molten * 1.3, 0.0, 1.0));
    hot = mix(hot, vec3(1.0, 0.78, 0.4), core * 0.7);
    col += hot * glow * 2.6;
  }

  // Atmospheric haze toward the (lit) limb.
  if (uAtmoDensity > 0.0) {
    float mu = clamp(dot(Ng, V), 0.0, 1.0);
    float fres = pow(1.0 - mu, 3.0);
    vec3 sky = uAtmoColor * atmoLight;
    col = mix(col, sky * 1.15, fres * uAtmoDensity * 0.7);
    col += sky * uAtmoDensity * 0.025;
  }

  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

/** Back-face halo shell: a thin, sun-lit scattering glow hugging the limb. */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
${LIGHTS_GLSL}
uniform vec3 uAtmoColor;
uniform float uAtmoDensity;
uniform vec3 uCenter;
uniform float uInner;
uniform float uOuter;
varying vec3 vWorldPos;

void main() {
  vec3 rd = normalize(vWorldPos - cameraPosition);
  vec3 oc = cameraPosition - uCenter;
  float b = dot(oc, rd);
  vec3 closest = oc - b * rd;
  float hDist = length(closest);
  float x = clamp((hDist - uInner) / (uOuter - uInner), 0.0, 1.0);
  // Optical depth along the ray grazing the shell: densest at the limb.
  float profile = exp(-x * 4.2) * (1.0 - x) * smoothstep(0.0, 0.035, x + 0.01);
  vec3 n = closest / max(hDist, 1e-6);
  vec3 light = vec3(0.0);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= uLightCount) break;
    vec3 Lv = uLightPos[i] - uCenter;
    float dist = length(Lv);
    vec3 L = Lv / dist;
    float e = irradiance(i, dist);
    float ndl = dot(n, L);
    float day = smoothstep(-0.22, 0.3, ndl);
    // Sunset band: light that crossed more atmosphere is reddened.
    vec3 tint = mix(vec3(1.0, 0.38, 0.14), vec3(1.0), smoothstep(-0.08, 0.32, ndl));
    float mu = dot(rd, L);
    float forward = 1.0 + 4.0 * pow(max(mu, 0.0), 12.0);
    light += uLightColor[i] * e * day * tint * forward;
  }
  vec3 col = uAtmoColor * light * profile * uAtmoDensity * 1.9;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

export const SIMPLE_VERTEX = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vObjPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vObjPos = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;
