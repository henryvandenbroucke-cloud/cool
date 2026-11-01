/**
 * Rendering: every view is a pure string function, so we can assert on the
 * markup without a browser. Catches undefined interpolations and broken states.
 */
import assert from 'node:assert/strict';
import { createGame, fixtureFor, seasonComplete } from '../js/engine/state.js';
import { applyResult, simulateFixture, playRound } from '../js/engine/match.js';
import { renderLanding, renderDossier } from '../js/ui/landing.js';
import { renderSquad, renderPlayerDrawer } from '../js/ui/squad.js';
import { renderTactics } from '../js/ui/tactics.js';
import { renderMatch } from '../js/ui/match.js';
import { renderTable } from '../js/ui/table.js';
import { renderNav, renderTopbar, renderRail } from '../js/ui/shell.js';
import { crest } from '../js/ui/crest.js';
import { CLUBS } from '../js/data/league.js';

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};

const noGarbage = (markup, label) => {
  assert.ok(markup.length > 200, `${label} produced too little markup`);
  for (const bad of ['undefined', 'NaN', '[object Object]', 'null%']) {
    assert.ok(!markup.includes(bad), `${label} contains "${bad}"`);
  }
};

const fakeStore = (overrides = {}) => ({
  game: createGame('liverpool', 'Test Boss'),
  view: 'squad',
  filter: 'ALL',
  sort: { key: 'ovr', dir: -1 },
  selectedSlot: null,
  drawerPlayerId: null,
  pickedClub: null,
  hoverClub: null,
  managerName: '',
  match: null,
  ...overrides,
});

console.log('render');

check('landing page renders a card for every club', () => {
  const store = fakeStore({ game: null });
  const markup = renderLanding(store);
  noGarbage(markup, 'landing');
  for (const club of CLUBS) assert.ok(markup.includes(club.name), `missing ${club.name}`);
  assert.ok(markup.includes('The season'));
  assert.equal((markup.match(/data-club=/g) || []).length, 20);
  assert.ok(markup.includes('data-action="start"'));
  assert.ok(markup.includes('disabled'), 'start is disabled until a club is picked');
});

check('landing dossier works for every club', () => {
  const store = fakeStore({ game: null });
  for (const club of CLUBS) {
    const markup = renderDossier(store, club.id);
    noGarbage(markup, `dossier ${club.id}`);
    assert.ok(markup.includes(club.ground.split("'")[0]), `dossier missing ${club.id} ground`);
  }
});

check('squad view lists every player and honours filters', () => {
  const store = fakeStore();
  const all = renderSquad(store);
  noGarbage(all, 'squad');
  for (const p of store.game.squads.liverpool) assert.ok(all.includes(p.name), `missing ${p.name}`);
  assert.ok(all.includes('Starting XI'));

  const keepers = renderSquad({ ...store, filter: 'GK' });
  const gk = store.game.squads.liverpool.filter((p) => p.pos === 'GK');
  assert.equal((keepers.match(/data-player=/g) || []).length, gk.length);

  const byName = renderSquad({ ...store, sort: { key: 'name', dir: 1 } });
  assert.ok(byName.indexOf('Alisson') < byName.indexOf('Florian Wirtz'));
});

check('player drawer shows attributes and season stats', () => {
  const store = fakeStore();
  const player = store.game.squads.liverpool[0];
  const markup = renderPlayerDrawer(store, player.id);
  noGarbage(markup, 'drawer');
  assert.ok(markup.includes(player.name));
  assert.ok(markup.includes('Attributes'));
  assert.ok(markup.includes('Season'));
});

check('tactics board places eleven tokens on the pitch', () => {
  const store = fakeStore();
  const markup = renderTactics(store);
  noGarbage(markup, 'tactics');
  assert.equal((markup.match(/class="token /g) || []).length, 11);
  assert.equal((markup.match(/data-slot=/g) || []).length, 11);
  for (const f of ['4-3-3', '4-2-3-1', '4-4-2', '3-4-2-1', '5-3-2']) {
    assert.ok(renderTactics({ ...store, game: { ...store.game, formation: f } }).includes(`data-formation="${f}"`));
  }
  const exhausted = { ...store.game, formation: '3-4-2-1', lineup: { gk: null } };
  noGarbage(renderTactics({ ...store, game: exhausted }), 'tactics with empty slot');
});

check('pre-match hub renders for home and away fixtures', () => {
  const store = fakeStore();
  const fixture = fixtureFor(store.game, 'liverpool', 1);
  noGarbage(renderMatch(store), 'prematch');
  const awayGame = { ...store.game, round: 1 };
  const awayFixture = fixtureFor(awayGame, 'liverpool', 2);
  const markup = renderMatch({ ...store, game: awayGame });
  assert.ok(markup.includes(awayFixture.home === 'liverpool' ? 'Home' : 'Away'));
  assert.ok(markup.includes('Opposition report'));
  assert.ok(fixture);
});

check('live match renders a running clock and commentary', () => {
  const store = fakeStore();
  const fixture = fixtureFor(store.game, 'liverpool', 1);
  const result = simulateFixture(store.game, fixture, 'round-0');
  const live = renderMatch({ ...store, match: { result, clock: 46, speed: 2, finished: false, goalCount: 0 } });
  noGarbage(live, 'live match');
  assert.ok(live.includes('Live commentary'));
  assert.ok(live.includes('46:00'));
  const skipped = renderMatch({ ...store, match: { result, clock: 90, speed: 1, finished: false, goalCount: 99 } });
  assert.ok(skipped.includes('FULL TIME'));
});

check('post-match shows ratings for the user XI', () => {
  const store = fakeStore();
  const fixture = fixtureFor(store.game, 'liverpool', 1);
  const result = simulateFixture(store.game, fixture, 'round-0');
  const next = applyResult(store.game, result);
  const markup = renderMatch({ ...store, game: next, match: { result, clock: 90, finished: true } });
  noGarbage(markup, 'post match');
  assert.ok(markup.includes('Player ratings'));
  assert.ok(markup.includes('Expected goals'));
});

check('league table reflects results and highlights the club', () => {
  const store = fakeStore();
  let game = store.game;
  while (game.round < 3) game = playRound(game).game;
  const markup = renderTable({ ...store, game });
  noGarbage(markup, 'table');
  assert.ok(markup.includes('Premier League'));
  assert.ok(markup.includes('is-me'));
  assert.ok((markup.match(/<tr class="[^"]*zone-/g) || []).length >= 3);
  assert.equal((markup.match(/<tr /g) || []).length, 20);
});

check('shell chrome renders with a live match and a finished season', () => {
  const store = fakeStore();
  noGarbage(renderNav(store) + renderTopbar(store) + renderRail(store), 'shell');
  assert.ok(renderTopbar({ ...store, view: 'match' }).includes('Matchday'));
  let finished = store.game;
  while (!seasonComplete(finished)) finished = playRound(finished).game;
  noGarbage(renderRail({ ...store, game: finished }), 'rail at season end');
  const seasonEnd = renderMatch({ ...store, game: finished });
  assert.ok(seasonEnd.includes('Season 2026 complete'));
});

check('real crest images render for every club', () => {
  for (const club of CLUBS) {
    const markup = crest(club.id, 32);
    assert.ok(markup.includes(`assets/crests/${club.id}.png`), `${club.id} crest path`);
    assert.ok(markup.includes(club.short), `${club.id} fallback code`);
    assert.ok(markup.includes(`alt="${club.name} crest"`) || markup.includes(club.name.split('&')[0]), `${club.id} alt text`);
  }
});

console.log(`\n${checks} render checks passed\n`);
