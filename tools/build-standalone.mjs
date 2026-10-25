// Builds dist/Lantern-and-Lens.html: one self-contained file (code, styles,
// fonts, models, sounds, music) that plays by double-clicking, no server needed.
//
//   npm install && npm run build

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const rel = (...p) => path.join(ROOT, ...p);
const MIME = { '.glb': 'model/gltf-binary', '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const dataUri = (file) => `data:${MIME[path.extname(file)]};base64,${fs.readFileSync(file).toString('base64')}`;

// 1. bundle the game into one classic script
const vendor = {
  name: 'vendor-three',
  setup(build) {
    build.onResolve({ filter: /^three(\/.*)?$/ }, (args) => ({
      path: args.path === 'three' ? rel('js/vendor/three/three.module.min.js') : rel('js/vendor/three', args.path.slice('three/'.length)),
    }));
  },
};
const out = await esbuild.build({ entryPoints: [rel('js/main.js')], bundle: true, format: 'iife', minify: true, write: false, plugins: [vendor], target: 'es2020', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 2. embed every runtime asset under the path the game asks for
const assets = {};
const walk = (dir) => {
  for (const e of fs.readdirSync(rel(dir), { withFileTypes: true })) {
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (MIME[path.extname(e.name)]) assets['/' + p] = dataUri(rel(p));
  }
};
walk('assets/models');
walk('assets/audio');
walk('assets/music');

// 3. inline the stylesheet with its fonts
const css = fs.readFileSync(rel('css/style.css'), 'utf8').replace(/url\('(\/assets\/fonts\/[^']+)'\)/g, (_, p) => `url('${dataUri(rel(p))}')`);

// 4. assemble the page
let html = fs.readFileSync(rel('index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preload"[^>]*>/g, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${dataUri(rel('assets/favicon.svg'))}">`)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
  .replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/\s*<script>\s*\/\* file-protocol notice \*\/[\s\S]*?<\/script>/, '')
  .replace(/<script type="module" src="\/js\/main.js"><\/script>/, () => `<script>window.__LL_ASSETS=${JSON.stringify(assets)};</script>\n  <script>${js}</script>`);

fs.mkdirSync(rel('dist'), { recursive: true });
const target = rel('dist/Lantern-and-Lens.html');
fs.writeFileSync(target, html);
console.log(`Built ${path.relative(ROOT, target)} — ${(fs.statSync(target).size / 1048576).toFixed(1)} MB, ${Object.keys(assets).length} assets embedded`);
