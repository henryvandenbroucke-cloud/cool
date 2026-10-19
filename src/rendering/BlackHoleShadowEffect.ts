import * as THREE from 'three';
import { Effect } from 'postprocessing';

export const MAX_SHADOWS = 2;
export const MAX_OCCLUDERS = 8;

const FRAGMENT = /* glsl */ `
#define MAX_SHADOWS ${MAX_SHADOWS}
#define MAX_OCCLUDERS ${MAX_OCCLUDERS}
uniform int uCount;
uniform vec3 uCenter[MAX_SHADOWS];
uniform float uRadius[MAX_SHADOWS];
uniform vec3 uNormal[MAX_SHADOWS];
uniform vec2 uDisk[MAX_SHADOWS];
uniform mat4 uProjInv;
uniform int uOccCount;
uniform vec4 uOcc[MAX_OCCLUDERS];
uniform vec2 uViewport;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(p.xyz / p.w);
  vec2 px = uv * uViewport;
  float keep = 1.0;
  for (int i = 0; i < MAX_SHADOWS; i++) {
    if (i >= uCount) break;
    vec3 C = uCenter[i];
    float R = uRadius[i];
    float b = dot(rd, C);
    float d = length(C - rd * b);
    if (b <= 0.0 || d >= R) continue;
    float tSphere = b - sqrt(max(R * R - d * d, 0.0));
    // Is the accretion disk (in front of the hole) what this ray sees first?
    float denom = dot(rd, uNormal[i]);
    float front = 0.0;
    if (abs(denom) > 1e-5) {
      float tDisk = dot(C, uNormal[i]) / denom;
      if (tDisk > 0.0 && tDisk < tSphere) {
        float rr = length(rd * tDisk - C) / R;
        front = smoothstep(uDisk[i].x * 0.97, uDisk[i].x * 1.05, rr) * (1.0 - smoothstep(uDisk[i].y * 0.9, uDisk[i].y, rr));
      }
    }
    // Anti-aliased silhouette edge.
    float edge = 1.0 - smoothstep(R * 0.975, R, d);
    float mask = edge * (1.0 - front);
    // Bodies passing in front of the hole stay visible.
    for (int k = 0; k < MAX_OCCLUDERS; k++) {
      if (k >= uOccCount) break;
      vec4 o = uOcc[k];
      if (o.w < tSphere && length(px - o.xy) < o.z) mask = 0.0;
    }
    // Remove bloom spill and haze inside the shadow, keeping only the disk light that is genuinely in front.
    keep = min(keep, 1.0 - mask * 0.97);
  }
  outputColor = vec4(inputColor.rgb * keep, inputColor.a);
}
`;

/**
 * Keeps black-hole shadows black after bloom. Bloom spreads light from the
 * photon ring and disk into the shadow, which real renders never show; this
 * effect re-darkens pixels whose view ray hits the hole first, analytically
 * excluding the near side of the disk and any body passing in front.
 */
export class BlackHoleShadowEffect extends Effect {
  constructor() {
    super('BlackHoleShadowEffect', FRAGMENT, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uCount', new THREE.Uniform(0)],
        ['uCenter', new THREE.Uniform(Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector3()))],
        ['uRadius', new THREE.Uniform(new Array(MAX_SHADOWS).fill(1))],
        ['uNormal', new THREE.Uniform(Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector3(0, 1, 0)))],
        ['uDisk', new THREE.Uniform(Array.from({ length: MAX_SHADOWS }, () => new THREE.Vector2(1.55, 7.5)))],
        ['uProjInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uOccCount', new THREE.Uniform(0)],
        ['uOcc', new THREE.Uniform(Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4()))],
        ['uViewport', new THREE.Uniform(new THREE.Vector2(1, 1))],
      ]),
    });
  }
}
