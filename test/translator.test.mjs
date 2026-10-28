/** BABEL translator: catalogue integrity, chunking, parsing, page wiring. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, POPULAR, getLang, isRTL } from '../js/translator/languages.js';
import { chunkText, parseGoogle, translateText, OFFLINE } from '../js/translator/engine.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fails = 0;
const check = (name, pass, detail = '') => { console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); if (!pass) fails++; };

check('catalogue has 180+ languages', LANGUAGES.length >= 180, `${LANGUAGES.length} languages`);
const codes = LANGUAGES.map(([c]) => c);
check('language codes are unique', new Set(codes).size === codes.length);
check('every entry has code/name/native/flag', LANGUAGES.every((e) => e.length === 4 && e.every((v) => typeof v === 'string' && v.length > 0)));
check('popular languages all exist', POPULAR.every((c) => codes.includes(c)));
check('core languages present', ['en','es','fr','de','ja','ko','zh-CN','zh-TW','ar','he','hi','uk','sw','am'].every((c) => codes.includes(c)));
check('getLang falls back gracefully', getLang('xx-unknown').name === 'xx-unknown');
check('RTL detection', isRTL('ar') && isRTL('he') && isRTL('ur') && !isRTL('en') && !isRTL('ja'));

const chunks = chunkText('Hello world. '.repeat(120), 420);
check('chunkText splits long text', chunks.length > 3 && chunks.every((c) => c.length <= 430));
check('chunkText round-trips', chunks.join('') === 'Hello world. '.repeat(120));
check('chunkText keeps short text whole', JSON.stringify(chunkText('Bonjour', 420)) === '["Bonjour"]');
const newlined = chunkText(('line one\n'.repeat(80)), 100);
check('chunkText respects newlines', newlined.every((c) => c.length <= 101));

check('parseGoogle joins segments + detects', (() => {
  const r = parseGoogle([[['Hola ', 'Hello '], ['mundo', 'world']], null, 'en']);
  return r.text === 'Hola mundo' && r.detected === 'en';
})());

check('offline glossary covers 10+ phrases x 15+ languages', Object.keys(OFFLINE).length >= 10 && Object.values(OFFLINE).every((m) => Object.keys(m).length >= 15));
{
  const failingFetch = async () => { throw new Error('network down'); };
  const off = await translateText('Hello', 'en', 'ja', failingFetch);
  check('translation survives total network failure via offline glossary', off.text === 'こんにちは' && off.engine.includes('Offline'), off.text);
  const gtx = async () => ({ ok: true, json: async () => [[['Hola mundo', 'Hello world']], null, 'en'] });
  const on = await translateText('Hello world', 'en', 'es', gtx);
  check('online engine path translates + detects', on.text === 'Hola mundo' && on.detected === 'en');
}

const html = read('index.html');
check('index.html loads translator assets', html.includes('/css/translator.css') && html.includes('/js/translator/app.js'));
check('index.html has core controls', ['id="input"','id="output"','id="swap"','id="go"','id="mic"','id="phrases"','id="history-list"','id="fav-list"'].every((s) => html.includes(s)));
check('server exposes /api/translate proxy', read('server.mjs').includes('/api/translate'));
check('homepage is the translator (no calculator left)', html.includes('id="translator"') && !html.includes('class="calculator"'));

console.log(fails ? `\n${fails} FAILING` : '\nAll translator checks passed');
process.exit(fails ? 1 : 0);
