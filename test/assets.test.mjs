/**
 * Static integrity: every reference in the document resolves, every module in
 * the import graph exists, and every canvas room has an engine registered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

const problems = [];
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  if (!pass) problems.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const html = read('index.html');

// 1. Local assets referenced by the document.
const refs = [...new Set([...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)].map((m) => m[1]))];
const missing = refs.filter((r) => !exists(r.slice(1)));
check('every local asset reference resolves', missing.length === 0, missing.join(', '));

// 2. Anchor targets.
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const anchors = [...new Set([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]))];
const dangling = anchors.filter((a) => !ids.has(a));
check('every in-page anchor has a target', dangling.length === 0, dangling.join(', '));

// 3. Labelled sections point at real headings.
const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
check('labelled sections reference real headings', labelled.every((id) => ids.has(id)));

// 4. Six rooms, each with a chapter number.
const sections = [...html.matchAll(/<section class="scene[^"]*"[^>]*data-scene="(\d)"/g)].map((m) => m[1]);
check('six rooms are declared', sections.length === 6, `found ${sections.length}`);

// 5. The module import graph.
const jsFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (entry.name.endsWith('.js')) jsFiles.push(rel);
  }
};
walk('js');

const unresolved = [];
for (const file of jsFiles) {
  for (const [, spec] of read(file).matchAll(/from\s+'([^']+)'/g)) {
    if (!spec.startsWith('.')) continue;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    if (!exists(target)) unresolved.push(`${file} → ${spec}`);
  }
}
check('every ES module import resolves', unresolved.length === 0, unresolved.join(', '));

// 6. Canvas rooms have factories in main.js.
const main = read('js/main.js');
const canvases = [...new Set([...html.matchAll(/data-canvas="([^"]+)"/g)].map((m) => m[1]))];
const missingFactories = canvases.filter((kind) => !new RegExp(`\\b${kind}:\\s*\\w+`).test(main));
check('every canvas room has an engine', missingFactories.length === 0, missingFactories.join(', '));
check('four canvas rooms exist', canvases.length === 4, canvases.join(', '));

// 7. Fonts are self-hosted and licensed.
const fontFaces = [...html.matchAll(/data-canvas/g)]; // no-op, keeps intent explicit
check('fonts are self-hosted', exists('assets/fonts/space-grotesk-var.woff2') && exists('assets/fonts/instrument-serif.woff2'));
check('font licences ship with the fonts', exists('assets/fonts/OFL-SpaceGrotesk.txt') && exists('assets/fonts/OFL-InstrumentSerif.txt'));

// 8. No remote origins (the site must work offline).
const remote = [...html.matchAll(/(?:src|href)="https?:\/\/[^"]+"/g)].map((m) => m[0]);
check('no remote dependencies in the document', remote.length === 0, remote.join(', '));

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail && !r.pass ? `  → ${r.detail}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
