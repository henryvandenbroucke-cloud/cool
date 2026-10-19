/** Shared lighting uniforms + helpers. Every lit body shader includes this. */
export const LIGHTS_GLSL = /* glsl */ `
#define MAX_LIGHTS 4
uniform vec3 uLightPos[MAX_LIGHTS];
uniform vec3 uLightColor[MAX_LIGHTS];
uniform float uLightStrength[MAX_LIGHTS];
uniform int uLightCount;
uniform float uRenderScale;
uniform float uExposure;

// Stylised irradiance: real starlight falls off with 1/d², which would leave
// the outer planets invisible. We use a gentler 1/√d curve that saturates near
// the star, so every world stays readable while inner planets remain brighter.
float irradiance(int i, float distScene) {
  float d = distScene / uRenderScale;
  float e = uLightStrength[i] / sqrt(d + 0.06);
  return (1.0 - exp(-1.5 * e)) * uExposure;
}
`;

export const LOGDEPTH_VERTEX_PARS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;

export const LOGDEPTH_FRAGMENT_PARS = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;

/** Close every fragment shader with log-depth + tone mapping + output colour space. */
export const FRAGMENT_OUTRO = /* glsl */ `
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
