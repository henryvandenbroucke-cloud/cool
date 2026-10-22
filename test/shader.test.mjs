/**
 * Compiles the real shaders from js/webgl.js as GLSL.
 *
 * glslang validates GLSL for Vulkan, so the ES 1.00 source is adapted
 * mechanically (uniforms into a block, attribute → location, gl_FragColor →
 * an output) — the maths, uniforms and control flow under test are untouched.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

let glslangInit;
try {
  ({ default: glslangInit } = await import('@webgpu/glslang/dist/web-devel-onefile/glslang.js'));
} catch {
  console.log('SKIP  shader test — run `npm install` to install @webgpu/glslang.');
  process.exit(0);
}

const source = fs.readFileSync(new URL('../prism/js/webgl.js', import.meta.url), 'utf8');
const extract = (name) => {
  const match = source.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  if (!match) throw new Error(`could not extract ${name} from js/webgl.js`);
  return match[1];
};

function adapt(raw, stage) {
  let src = raw.replace(/precision\s+\w+\s+float;/g, '');
  if (stage === 'vertex') {
    src = src.replace(/attribute\s+vec2\s+aPos;/, 'layout(location = 0) in vec2 aPos;');
    return `#version 450\n${src}`;
  }
  const uniforms = [];
  src = src.replace(/^uniform\s+[^;]+;/gm, (line) => {
    uniforms.push(line);
    return '';
  });
  src = src.replace('void main() {', 'layout(location = 0) out vec4 fragColor;\nvoid main() {');
  src = src.replace(/gl_FragColor/g, 'fragColor');
  return `#version 450\nlayout(std140, binding = 0) uniform UBO {\n${uniforms.join('\n')}\n};\n${src}`;
}

const results = [];
const frag = extract('FRAG');
const vert = extract('VERT');

// Guard the things that are easy to break and impossible to see in source.
const uniforms = [...frag.matchAll(/^uniform\s+\w+\s+(\w+);/gm)].map((m) => m[1]);
const required = ['uRes', 'uTime', 'uMouse', 'uMouseVel', 'uAccent', 'uAccent2', 'uGlow', 'uScene', 'uEnergy', 'uDay'];
const missing = required.filter((name) => !uniforms.includes(name));
results.push({ name: 'shader declares every uniform main.js sets', pass: missing.length === 0, extra: missing.join(', ') });

const usedScene = /uScene/.test(frag) && /m0|m1|m2|m3|m4|m5/.test(frag);
results.push({ name: 'scene blending logic is present', pass: usedScene });
// GLSL leaves smoothstep(edge0, edge1, x) undefined when edge0 >= edge1.
const smoothstepCalls = [...frag.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)];
const inverted = smoothstepCalls.filter(([, a, b]) => parseFloat(a) >= parseFloat(b));
results.push({
  name: 'no inverted smoothstep edges (edge0 >= edge1)',
  pass: inverted.length === 0,
  extra: inverted.map((m) => m[0]).join(', '),
});

try {
  const glslang = await glslangInit();
  for (const stage of ['vertex', 'fragment']) {
    const raw = stage === 'vertex' ? vert : frag;
    try {
      const spirv = glslang.compileGLSL(adapt(raw, stage), stage);
      results.push({ name: `${stage} shader compiles to SPIR-V`, pass: spirv.length > 0, extra: `${spirv.length} words` });
    } catch (error) {
      results.push({ name: `${stage} shader compiles to SPIR-V`, pass: false, extra: String(error.message || error).slice(0, 400) });
    }
  }
} catch (error) {
  results.push({ name: 'glslang initialises', pass: false, extra: String(error.message || error) });
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? `  → ${r.extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
