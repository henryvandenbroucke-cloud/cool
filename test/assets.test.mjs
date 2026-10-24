// Static integrity: every model, sound, font and module the game asks for exists.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const results = [];
const check = (name, missing) => results.push([name, missing.length === 0, missing.join(', ')]);

const jsFiles = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (!rel.includes('vendor')) walk(rel); } else if (e.name.endsWith('.js')) jsFiles.push(rel);
  }
};
walk('js');
const src = jsFiles.map((f) => [f, read(f)]);

// 1. relative imports resolve
const unresolved = [];
for (const [file, code] of src) {
  for (const [, spec] of code.matchAll(/from\s+'([^']+)'/g)) {
    if (spec === 'three') continue;
    const target = spec.startsWith('three/addons/') ? 'js/vendor/three/addons/' + spec.slice(13) : path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
    if (!exists(target)) unresolved.push(`${file} → ${spec}`);
  }
}
check('every ES module import resolves', unresolved);

// 2. every GLB path referenced in code exists (with its texture if external)
const models = new Set();
for (const [, code] of src) for (const [, p] of code.matchAll(/'((?:furniture|nature|people|pets|holiday|survival)\/[\w.-]+\.glb)'/g)) models.add(p);
for (const [, code] of src) for (const [, m] of code.matchAll(/model:\s*'([\w-]+)'/g)) models.add(`people/${m}.glb`);
for (const m of JSON.parse(JSON.stringify([...read('js/game/config.js').matchAll(/'(character-[\w-]+)'/g)].map((x) => x[1])))) models.add(`people/${m}.glb`);
check(`all ${models.size} referenced models exist`, [...models].filter((m) => !exists('assets/models/' + m)));
const texMissing = [];
for (const m of models) {
  const buf = fs.readFileSync(path.join(ROOT, 'assets/models', m));
  const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString());
  for (const img of json.images || []) if (img.uri && !exists(path.posix.join('assets/models', path.posix.dirname(m), img.uri))) texMissing.push(`${m} → ${img.uri}`);
}
check('external model textures exist', texMissing);

// 3. every sound the audio manager loads exists in both formats
const audioSrc = read('js/game/audio.js');
const sfxBlock = audioSrc.match(/const SFX = \{([\s\S]*?)\};/)[1];
const names = [];
for (const [, name, val] of sfxBlock.matchAll(/(\w+):\s*(\[[^\]]*\]|\d+)/g)) {
  if (val.startsWith('[')) for (const i of JSON.parse(val)) names.push(`${name}_${i}`);
  else if (+val === 1) names.push(name);
  else for (let i = 0; i < +val; i++) names.push(`${name}_${i}`);
}
for (const [, l] of audioSrc.match(/const LOOPS = \[([^\]]*)\]/)[1].matchAll(/'(\w+)'/g)) names.push(l);
check(`all ${names.length} sounds exist as .ogg and .m4a`, names.flatMap((n) => ['ogg', 'm4a'].filter((e) => !exists(`assets/audio/${n}.${e}`)).map((e) => `${n}.${e}`)));
const tracks = [...audioSrc.matchAll(/\{ id: '(\w+)', name:/g)].map((m) => m[1]);
check(`all ${tracks.length} radio tracks exist`, tracks.filter((t) => !exists(`assets/music/${t}.m4a`)));

// 4. html + css references
const html = read('index.html');
const refs = [...html.matchAll(/(?:href|src)="(\/[^"#]+)"/g)].map((m) => m[1]);
const css = read('css/style.css');
const cssRefs = [...css.matchAll(/url\('(\/[^']+)'\)/g)].map((m) => m[1]);
check('html + css references resolve', [...refs, ...cssRefs].filter((r) => !exists(r.slice(1))));

// 5. DOM ids the scripts look up exist
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const wanted = new Set();
for (const [, code] of src) {
  for (const [, id] of code.matchAll(/\$\('([\w-]+)'\)/g)) wanted.add(id);
  for (const [, id] of code.matchAll(/getElementById\('([\w-]+)'\)/g)) wanted.add(id);
}
check('every DOM id used by scripts exists', [...wanted].filter((id) => !ids.has(id)));

for (const [name, ok, msg] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${msg}`}`);
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
