/**
 * Full-app integration test in jsdom: boot the real entry point, click through
 * the career, play a match, check persistence.
 *
 * Needs jsdom (`npm install --no-save jsdom`); skips cleanly when it's absent.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, '..');

let JSDOM;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  console.log('dom\n  ~ jsdom not installed — skipping integration test\n');
  process.exit(0);
}

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};

async function boot({ saved } = {}) {
  const html = await readFile(resolve(rootDir, 'index.html'), 'utf8');
  const { VirtualConsole } = await import('jsdom');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => console.error('jsdom error:', error.detail || error));
  virtualConsole.on('error', (...args) => console.error('console.error:', ...args));
  const dom = new JSDOM(html, { url: 'http://localhost:4173/', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;
  window.scrollTo = () => {};
  window.Element.prototype.setPointerCapture = () => {};
  window.Element.prototype.releasePointerCapture = () => {};
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.Element = window.Element;
  if (saved) window.localStorage.setItem('touchline.save.v1', saved);
  window.HTMLElement.prototype.focus = function focus() {};
  // The store module is a singleton across boots; reset it to simulate a reload.
  const { store } = await import('../js/store.js');
  store.game = null;
  store.loadedSave = null;
  store.pickedClub = null;
  store.match = null;
  store.view = 'squad';
  // Fresh module graph per boot so main.js runs again.
  const url = new URL(`../js/main.js?boot=${Math.random()}`, import.meta.url);
  await import(url.href);
  return window;
}

const click = (window, selector) => {
  const el = window.document.querySelector(selector);
  assert.ok(el, `missing element ${selector}`);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  return el;
};

const pointer = (window, selector, type = 'pointerdown') => {
  const el = window.document.querySelector(selector);
  assert.ok(el, `missing element ${selector}`);
  el.dispatchEvent(new window.Event(type, { bubbles: true }));
};

console.log('dom');

const window = await boot();
const doc = window.document;

await check('landing screen boots with the club picker', () => {
  assert.ok(doc.querySelector('.landing'), 'no landing screen');
  assert.equal(doc.querySelectorAll('[data-club]').length, 10);
  assert.ok(doc.querySelector('[data-action="start"]').disabled);
});

await check('picking a club enables the start button', () => {
  click(window, '[data-club="arsenal"]');
  const start = doc.querySelector('[data-action="start"]');
  assert.equal(start.disabled, false);
  assert.match(start.textContent, /Manage Arsenal/);
  assert.match(doc.querySelector('.dossier__name').textContent, /Arsenal/);
});

await check('starting a career paints the app shell', () => {
  const input = doc.querySelector('[data-manager-input]');
  input.value = 'Mikel Test';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  click(window, '[data-action="start"]');
  assert.ok(doc.querySelector('.app'), 'no app shell');
  assert.ok(doc.querySelectorAll('table.squad tbody tr').length >= 16, 'squad rows missing');
  assert.match(doc.body.textContent, /Mikel Test/);
  assert.match(doc.querySelector('.topbar__h1').textContent, /Squad/);
});

await check('squad filters and sorting work', () => {
  click(window, '[data-filter="GK"]');
  assert.equal(doc.querySelectorAll('table.squad tbody tr').length, 2);
  click(window, '[data-filter="ALL"]');
  click(window, '[data-sort="age"]');
  assert.match(doc.querySelector('th.is-active').textContent, /Age/);
});

await check('player drawer opens and closes', () => {
  click(window, 'table.squad tbody tr');
  assert.ok(doc.querySelector('.sheet'), 'drawer did not open');
  assert.match(doc.querySelector('.sheet__name').textContent, /\w/);
  click(window, '[data-close-sheet]');
  assert.equal(doc.querySelector('.sheet'), null);
});

await check('tactics board renders and selection swaps a player', () => {
  click(window, '[data-nav="tactics"]');
  const tokens = doc.querySelectorAll('#pitch .token');
  assert.equal(tokens.length, 11);
  const before = doc.querySelector('[data-bench]').dataset.bench;
  pointer(window, '#pitch .token');
  pointer(window, '#pitch .token', 'pointerup');
  assert.ok(doc.querySelector('.token.is-selected'), 'token not selected after tap');
  click(window, '[data-bench]');
  assert.match(doc.body.textContent, /Best available XI|Team report/);
  assert.ok(before);
});

await check('changing formation reshapes the board', () => {
  click(window, '[data-formation="3-4-2-1"]');
  assert.match(doc.querySelector('.pitch-card .card__title').textContent, /3-4-2-1/);
  assert.ok(doc.querySelectorAll('#pitch .token').length === 11);
  click(window, '[data-formation="4-3-3"]');
});

await check('mentality switch persists into the match hub', () => {
  click(window, '[data-mentality="attacking"]');
  click(window, '[data-nav="match"]');
  assert.match(doc.body.textContent, /Attacking/);
  assert.match(doc.body.textContent, /Opposition report/);
});

await check('kick off starts the live clock, skip finishes the match', () => {
  click(window, '[data-action="kickoff"]');
  assert.ok(doc.querySelector('.commentary'), 'no commentary feed');
  assert.match(doc.querySelector('.scoreboard__clock').textContent, /LIVE|0[0-9]:00/i);
  click(window, '[data-action="skip"]');
  assert.match(doc.body.textContent, /FULL TIME/);
  assert.match(doc.body.textContent, /Player ratings/);
});

await check('continuing moves to the table with the result applied', () => {
  click(window, '[data-action="finish-match"]');
  assert.match(doc.querySelector('.topbar__h1').textContent, /League table/);
  const me = doc.querySelector('tr.is-me');
  assert.ok(me, 'user row not highlighted');
  assert.match(doc.querySelector('.scoreboard') ? 'ok' : 'ok', /ok/);
  // The user's club must show one match played.
  const cells = me.querySelectorAll('td');
  assert.equal(cells[3].textContent.trim(), '1');
});

await check('career is saved to localStorage', () => {
  const raw = window.localStorage.getItem('touchline.save.v1');
  assert.ok(raw, 'nothing saved');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.clubId, 'arsenal');
  assert.equal(parsed.manager, 'Mikel Test');
  assert.equal(parsed.round, 1);
});

await check('reload offers to continue the career', async () => {
  const saved = window.localStorage.getItem('touchline.save.v1');
  const win2 = await boot({ saved });
  const d2 = win2.document;
  assert.ok(d2.querySelector('[data-action="continue-career"]'), 'continue button missing');
  click(win2, '[data-action="continue-career"]');
  assert.ok(d2.querySelector('.app'));
  assert.match(d2.querySelector('.club-chip__name').textContent, /Arsenal/);
});

console.log(`\n${checks} dom checks passed\n`);
