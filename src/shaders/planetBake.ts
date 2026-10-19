import { NOISE_GLSL } from './noise';

/** Integer codes for SurfaceStyle, shared by the baker and the planet material. */
export const STYLE_CODE: Record<string, number> = {
  terran: 0,
  mars: 1,
  mercury: 2,
  venus: 3,
  volcanic: 4,
  ice: 5,
  desert: 6,
  moon: 7,
  jupiter: 8,
  saturn: 9,
  neptune: 10,
  gas: 11,
  asteroid: 12,
  comet: 13,
};

export const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Bakes a seamless equirectangular surface into two textures by evaluating 3D
 * noise on the unit sphere (so there is no seam at the date line):
 *   pass 0 → rgb albedo (sRGB-encoded), a = specular / ocean mask
 *   pass 1 → r = height, g = emissive mask (city lights or lava), b = clouds
 */
export const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform int uPass;
uniform int uStyle;
uniform float uSeed;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uOcean;
uniform float uClouds;
uniform float uCity;

${NOISE_GLSL}

const float PI = 3.14159265359;

vec3 sphereDir(vec2 uv) {
  // Matches THREE.SphereGeometry's vertex layout: uv.y = 1 - v.
  float u = uv.x;
  float v = 1.0 - uv.y;
  float phi = u * 2.0 * PI;
  float theta = v * PI;
  return vec3(-cos(phi) * sin(theta), cos(theta), sin(phi) * sin(theta));
}

float crater(vec3 p, float scale, float density) {
  vec2 v = voronoi(p * scale);
  float r = mix(0.18, 0.42, hash33(floor(p * scale)).x);
  float d = v.x / r;
  float keep = step(hash33(floor(p * scale) + 7.0).y, density);
  float bowl = smoothstep(1.0, 0.0, d) * -0.9;
  float rim = exp(-pow((d - 1.0) * 5.0, 2.0)) * 0.55;
  return (bowl + rim) * keep;
}

float craters(vec3 p, float density) {
  return crater(p, 3.0, density) * 0.9 + crater(p + 11.0, 7.0, density) * 0.5 + crater(p + 23.0, 16.0, density) * 0.25 + crater(p + 41.0, 34.0, density) * 0.12;
}

struct Surface { vec3 albedo; float spec; float height; float emissive; float cloud; };

Surface terran(vec3 d, vec3 p) {
  Surface s;
  vec3 q = p + 0.55 * vec3(fbm(p * 1.1 + 3.0, 4), fbm(p * 1.1 + 8.0, 4), fbm(p * 1.1 + 13.0, 4));
  float h = fbm(q * 1.35, 8) + 0.12 * ridged(p * 3.0, 5) - 0.05;
  float sea = mix(0.35, -0.25, uOcean);
  float lat = abs(d.y);
  float land = smoothstep(sea - 0.004, sea + 0.004, h);
  float elev = clamp((h - sea) / 0.55, 0.0, 1.0);
  float moisture = fbm(p * 2.2 + 31.0, 5) * 0.5 + 0.5;
  // Biomes: rainforest near the equator, deserts around ±25°, temperate, tundra.
  vec3 jungle = vec3(0.09, 0.22, 0.07);
  vec3 forest = uC1;
  vec3 grass = mix(uC1, vec3(0.45, 0.48, 0.22), 0.45);
  vec3 desert = uC2;
  vec3 tundra = vec3(0.42, 0.40, 0.33);
  float desertBand = exp(-pow((lat - 0.33) / 0.12, 2.0)) * smoothstep(0.62, 0.35, moisture);
  vec3 col = mix(grass, forest, smoothstep(0.35, 0.65, moisture));
  col = mix(col, jungle, smoothstep(0.25, 0.0, lat) * smoothstep(0.4, 0.6, moisture));
  col = mix(col, desert, clamp(desertBand * 1.6, 0.0, 1.0));
  col = mix(col, tundra, smoothstep(0.55, 0.72, lat));
  // Mountains and snow.
  col = mix(col, vec3(0.36, 0.31, 0.26), smoothstep(0.35, 0.7, elev));
  col = mix(col, vec3(0.92, 0.93, 0.95), smoothstep(0.72, 0.9, elev + lat * 0.25));
  col *= 0.85 + 0.3 * fbm(p * 18.0, 3);
  // Ocean: deep to shallow turquoise near coasts.
  float depth = clamp((sea - h) / 0.35, 0.0, 1.0);
  vec3 shallow = mix(uC0, vec3(0.05, 0.38, 0.45), 0.55);
  vec3 ocean = mix(shallow, uC0 * 0.7, smoothstep(0.0, 0.6, depth));
  col = mix(ocean, col, land);
  // Polar ice.
  float ice = smoothstep(0.80, 0.86, lat + fbm(p * 4.0 + 5.0, 4) * 0.08);
  col = mix(col, vec3(0.93, 0.96, 1.0), ice);
  s.albedo = col;
  s.spec = (1.0 - land) * (1.0 - ice);
  s.height = land * elev * (1.0 - ice * 0.5);
  // City lights: clustered on habitable land, densest near coasts.
  float coast = smoothstep(0.12, 0.0, h - sea);
  float habitable = land * (1.0 - ice) * smoothstep(0.75, 0.55, lat) * (1.0 - smoothstep(0.5, 0.8, elev)) * (1.0 - desertBand * 0.8);
  float clusters = smoothstep(0.15, 0.6, fbm(p * 5.0 + 71.0, 4) + coast * 0.35);
  float sparkle = smoothstep(0.62, 0.9, snoise(p * 90.0) * 0.5 + 0.5 + snoise(p * 31.0) * 0.25);
  s.emissive = uCity * habitable * clusters * (0.35 + sparkle);
  // Clouds: warped fbm with a band of storms near the equator.
  vec3 cq = p * 1.6 + 1.4 * vec3(fbm(p * 1.3 + 50.0, 4), fbm(p * 1.3 + 60.0, 4), fbm(p * 1.3 + 70.0, 4));
  float c = fbm(cq * 2.2, 6) + 0.15 * exp(-pow(d.y / 0.12, 2.0)) - 0.12 * exp(-pow((lat - 0.3) / 0.1, 2.0));
  s.cloud = smoothstep(0.55 - uClouds * 0.75, 0.95 - uClouds * 0.5, c * 0.5 + 0.5);
  return s;
}

Surface rocky(vec3 d, vec3 p, float craterDensity, float maria) {
  Surface s;
  float n = fbm(p * 2.0, 7);
  float cr = craters(p, craterDensity);
  float m = smoothstep(0.05, 0.25, fbm(p * 0.9 + 17.0, 5)) * maria;
  vec3 col = mix(uC0, uC1, smoothstep(-0.4, 0.5, n));
  col = mix(col, uC1 * 0.7, m);
  col = mix(col, uC2, smoothstep(0.25, 0.6, cr) * 0.6 + smoothstep(0.45, 0.8, fbm(p * 6.0, 4)) * 0.2);
  col *= 0.88 + 0.24 * fbm(p * 24.0, 3);
  s.albedo = col;
  s.spec = 0.02;
  s.height = clamp(0.5 + n * 0.25 + cr * 0.35 - m * 0.1, 0.0, 1.0);
  s.emissive = 0.0;
  s.cloud = 0.0;
  return s;
}

Surface marsLike(vec3 d, vec3 p) {
  Surface s = rocky(d, p, 0.45, 0.0);
  float dark = smoothstep(0.0, 0.35, fbm(p * 1.4 + 9.0, 6));
  s.albedo = mix(uC0, uC1, dark);
  s.albedo = mix(s.albedo, uC2, smoothstep(0.35, 0.7, fbm(p * 3.0 + 4.0, 5)) * 0.55);
  // A great canyon system.
  float canyon = smoothstep(0.035, 0.0, abs(d.y + 0.08 + 0.05 * fbm(p * 3.0, 3))) * smoothstep(0.2, 0.6, d.x * 0.5 + 0.5);
  s.albedo = mix(s.albedo, uC1 * 0.6, canyon);
  s.height -= canyon * 0.35;
  float cap = smoothstep(0.86, 0.9, abs(d.y) + fbm(p * 5.0, 3) * 0.05);
  s.albedo = mix(s.albedo, vec3(0.95, 0.93, 0.9), cap);
  s.albedo *= 0.9 + 0.2 * fbm(p * 20.0, 3);
  float dust = fbm(p * 2.0 + 99.0, 4);
  s.cloud = smoothstep(0.35, 0.7, dust) * uClouds * 4.0;
  return s;
}

Surface venusLike(vec3 d, vec3 p) {
  Surface s;
  vec3 q = vec3(p.x * 0.6, p.y * 3.0, p.z * 0.6);
  float w = fbm(q + 2.0 * vec3(fbm(p * 1.5, 4), fbm(p * 1.5 + 4.0, 4), 0.0), 6);
  float bands = sin(d.y * 14.0 + w * 3.0) * 0.5 + 0.5;
  vec3 col = mix(uC1, uC0, bands);
  col = mix(col, uC2, smoothstep(0.2, 0.7, w) * 0.6);
  s.albedo = col;
  s.spec = 0.0;
  s.height = 0.5;
  s.emissive = 0.0;
  s.cloud = 0.0;
  return s;
}

Surface volcanicLike(vec3 d, vec3 p) {
  Surface s = rocky(d, p, 0.25, 0.0);
  vec3 q = p + 0.6 * vec3(fbm(p * 1.4, 4), fbm(p * 1.4 + 3.0, 4), fbm(p * 1.4 + 6.0, 4));
  float rivers = pow(ridged(q * 2.2, 6), 2.2);
  float pools = smoothstep(0.35, 0.6, fbm(p * 1.3 + 40.0, 5));
  float lava = clamp(smoothstep(0.42, 0.75, rivers) + pools * 0.8, 0.0, 1.0);
  vec3 rock = mix(uC1, uC0, smoothstep(-0.4, 0.4, fbm(p * 3.0, 5)));
  rock *= 0.8 + 0.4 * fbm(p * 30.0, 2);
  s.albedo = mix(rock, mix(rock, uC2 * 0.5, 0.6), smoothstep(0.1, 0.5, lava));
  s.emissive = lava;
  s.height = clamp(0.6 - lava * 0.45 + fbm(p * 4.0, 4) * 0.2, 0.0, 1.0);
  return s;
}

Surface iceLike(vec3 d, vec3 p) {
  Surface s;
  float n = fbm(p * 1.8, 7);
  float cracks = pow(ridged(p * 3.5 + 0.4 * vec3(fbm(p * 2.0, 3)), 5), 3.0);
  float seas = smoothstep(0.1, 0.0, fbm(p * 1.1 + 20.0, 5));
  vec3 col = mix(uC0, uC1, smoothstep(-0.3, 0.6, n) * 0.55);
  col = mix(col, uC2, smoothstep(0.55, 0.9, cracks) * 0.85);
  col = mix(col, uC2 * 0.75 + vec3(0.0, 0.05, 0.12), seas * 0.7);
  col *= 0.92 + 0.16 * fbm(p * 22.0, 3);
  s.albedo = col;
  s.spec = 0.35 + seas * 0.4;
  s.height = clamp(0.5 + n * 0.3 - cracks * 0.2, 0.0, 1.0);
  s.emissive = 0.0;
  vec3 cq = p * 1.8 + vec3(fbm(p * 1.2 + 50.0, 4), fbm(p * 1.2 + 60.0, 4), 0.0);
  s.cloud = smoothstep(0.62 - uClouds * 0.6, 0.95, fbm(cq * 2.0, 5) * 0.5 + 0.5);
  return s;
}

Surface desertLike(vec3 d, vec3 p) {
  Surface s;
  float n = fbm(p * 1.6, 7);
  vec3 dir = normalize(vec3(1.0, 0.25, 0.6));
  float dunes = sin(dot(p, dir) * 42.0 + fbm(p * 3.0, 4) * 6.0) * 0.5 + 0.5;
  float flats = smoothstep(0.25, 0.45, fbm(p * 1.2 + 15.0, 5));
  float rock = smoothstep(0.2, 0.55, ridged(p * 2.5, 5) - 0.35);
  vec3 col = mix(uC0, uC1, smoothstep(-0.5, 0.5, n));
  col = mix(col, uC2, dunes * 0.25 + flats * 0.55);
  col = mix(col, uC1 * 0.55, rock * 0.7);
  col *= 0.9 + 0.2 * fbm(p * 26.0, 3);
  s.albedo = col;
  s.spec = flats * 0.08;
  s.height = clamp(0.45 + n * 0.25 + rock * 0.3 + dunes * 0.04, 0.0, 1.0);
  s.emissive = 0.0;
  s.cloud = smoothstep(0.7, 1.0, fbm(p * 2.5 + 80.0, 5) * 0.5 + 0.5) * uClouds * 5.0;
  return s;
}

Surface gasGiant(vec3 d, vec3 p, float bandFreq, float turbulence, float contrast, float spot) {
  Surface s;
  float lat = d.y;
  vec3 wp = p * vec3(1.0, 4.0, 1.0);
  float warp = fbm(wp * 1.5 + vec3(fbm(p * 2.0, 4) * 2.0), 6);
  float latw = lat + warp * turbulence;
  float band = sin(latw * bandFreq + 0.6 * sin(latw * bandFreq * 0.37 + uSeed));
  float fine = fbm(vec3(p.x * 2.0, latw * 40.0, p.z * 2.0), 5);
  float t = band * 0.5 + 0.5;
  vec3 col = mix(uC1, uC0, smoothstep(0.2, 0.8, t));
  col = mix(col, uC2, smoothstep(0.55, 0.95, t + fine * 0.25) * contrast);
  col *= 0.9 + 0.2 * fine;
  // Swirling vortices along band edges.
  float edge = 1.0 - abs(band);
  col = mix(col, uC2, smoothstep(0.85, 1.0, edge) * smoothstep(0.2, 0.6, fbm(p * 6.0, 4)) * 0.35);
  // Great storm.
  if (spot > 0.0) {
    vec3 c = normalize(vec3(0.6, -0.36, 0.72));
    vec3 lp = d - c;
    float e = length(vec2(dot(lp, normalize(cross(c, vec3(0.0, 1.0, 0.0)))) * 0.55, lp.y * 1.05));
    float swirl = fbm(vec3(e * 12.0, atan(lp.y, lp.x) * 2.0, 1.0), 3);
    float storm = smoothstep(0.11, 0.03, e + swirl * 0.015);
    col = mix(col, mix(vec3(0.75, 0.33, 0.2), vec3(0.85, 0.5, 0.35), swirl + 0.5), storm * spot);
  }
  s.albedo = col;
  s.spec = 0.0;
  s.height = 0.5 + fine * 0.05;
  s.emissive = 0.0;
  s.cloud = 0.0;
  return s;
}

Surface neptuneLike(vec3 d, vec3 p) {
  Surface s = gasGiant(d, p, 9.0, 0.06, 0.25, 0.0);
  // Bright high-altitude cirrus streaks and a dark storm.
  float streaks = smoothstep(0.55, 0.9, fbm(vec3(p.x * 1.5, d.y * 30.0, p.z * 1.5), 5) * 0.5 + 0.5);
  s.albedo = mix(s.albedo, vec3(0.92, 0.95, 1.0), streaks * 0.35 * smoothstep(0.7, 0.2, abs(d.y)));
  vec3 c = normalize(vec3(-0.5, -0.3, 0.8));
  float spot = smoothstep(0.16, 0.06, length((d - c) * vec3(0.6, 1.2, 0.6)));
  s.albedo = mix(s.albedo, uC1 * 0.6, spot * 0.8);
  return s;
}

void main() {
  vec3 d = sphereDir(vUv);
  vec3 seed = vec3(uSeed * 0.0137, uSeed * 0.0291, uSeed * 0.0173);
  vec3 p = d * 1.2 + seed;
  Surface s;
  if (uStyle == 0) s = terran(d, p);
  else if (uStyle == 1) s = marsLike(d, p);
  else if (uStyle == 2) s = rocky(d, p, 0.85, 0.0);
  else if (uStyle == 3) s = venusLike(d, p);
  else if (uStyle == 4) s = volcanicLike(d, p);
  else if (uStyle == 5) s = iceLike(d, p);
  else if (uStyle == 6) s = desertLike(d, p);
  else if (uStyle == 7) s = rocky(d, p, 0.75, 1.0);
  else if (uStyle == 8) s = gasGiant(d, p, 22.0, 0.07, 0.7, 1.0);
  else if (uStyle == 9) s = gasGiant(d, p, 30.0, 0.03, 0.45, 0.0);
  else if (uStyle == 10) s = neptuneLike(d, p);
  else if (uStyle == 11) s = gasGiant(d, p, 16.0 + fract(uSeed * 0.001) * 14.0, 0.09, 0.6, step(0.5, fract(uSeed * 0.37)));
  else s = rocky(d, p, 0.6, 0.0);

  if (uPass == 0) {
    // Colours are authored and stored in sRGB; the planet material decodes them.
    gl_FragColor = vec4(clamp(s.albedo, 0.0, 1.0), clamp(s.spec, 0.0, 1.0));
  } else {
    gl_FragColor = vec4(clamp(s.height, 0.0, 1.0), clamp(s.emissive, 0.0, 1.0), clamp(s.cloud, 0.0, 1.0), 1.0);
  }
}
`;
