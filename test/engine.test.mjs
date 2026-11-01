/** Engine invariants: a whole simulated season has to add up. */
import assert from 'node:assert/strict';
import { createGame, fixtureFor, ROUNDS, squadOf, totalRounds, xiStrength, advanceSeason } from '../js/engine/state.js';
import { playRound, simulateFixture, applyResult, MENTALITY_LIST } from '../js/engine/match.js';
import { CLUBS } from '../js/data/league.js';

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};

console.log('engine');

check('a new career inherits the real mid-season table', () => {
  const game = createGame('liverpool', 'Test Boss');
  assert.equal(Object.values(game.lineup).length, 11);
  assert.equal(Object.values(game.lineup).filter(Boolean).length, 11);
  assert.equal(game.round, 0, 'the player takes over from here');
  assert.equal(game.season, 2026);
  assert.equal(Object.keys(game.table).length, 20);
  assert.equal(game.table.liverpool.p, 8, 'Liverpool have played eight real matches');
  assert.equal(game.table.liverpool.pts, 15);
  assert.equal(game.table['man-city'].pts, 21);
  assert.equal(game.manager, 'Test Boss');
  assert.ok(xiStrength(game) > 70 && xiStrength(game) < 95);
  assert.equal(totalRounds(game), 30, 'catch-up round plus 29 matchweeks');
});

check('a simulated fixture is internally consistent', () => {
  const game = createGame('arsenal');
  const fixture = fixtureFor(game, game.clubId, 1);
  const result = simulateFixture(game, fixture, 'round-0');
  assert.equal(result.home, fixture.home);
  assert.equal(result.away, fixture.away);
  const goals = result.events.filter((e) => e.type === 'goal');
  assert.equal(goals.length, result.hg + result.ag);
  assert.equal(goals.filter((g) => g.side === 'home').length, result.hg);
  assert.equal(goals.filter((g) => g.side === 'away').length, result.ag);
  for (const e of result.events) {
    assert.ok(e.minute >= 0 && e.minute <= 90, `minute ${e.minute}`);
    assert.ok(typeof e.text === 'string' && e.text.length > 4, 'event has commentary');
  }
  assert.equal(result.stats.home.possession + result.stats.away.possession, 100);
  assert.ok(result.stats.home.xg > 0 && result.stats.away.xg > 0);
  assert.equal(result.ratings.home.length, 11);
  assert.equal(result.ratings.away.length, 11);
  for (const r of [...result.ratings.home, ...result.ratings.away]) {
    assert.ok(r.rating >= 4.4 && r.rating <= 9.9, `rating ${r.rating}`);
  }
});

check('the same seed replays the same 90 minutes', () => {
  const game = createGame('chelsea');
  const fixture = fixtureFor(game, game.clubId, 1);
  const a = simulateFixture(game, fixture, 'seed');
  const b = simulateFixture(game, fixture, 'seed');
  assert.equal(a.hg, b.hg);
  assert.equal(a.ag, b.ag);
  assert.deepEqual(a.events.map((e) => e.text), b.events.map((e) => e.text));
});

check('mentality shifts expected goals', () => {
  const game = createGame('everton');
  const fixture = fixtureFor(game, game.clubId, 1);
  const defensive = simulateFixture({ ...game, mentality: 'defensive' }, fixture, 'x');
  const attacking = simulateFixture({ ...game, mentality: 'attacking' }, fixture, 'x');
  assert.ok(attacking.stats.home.xg > defensive.stats.home.xg, 'attacking should raise xG');
  assert.equal(MENTALITY_LIST.length, 3);
});

check('a full season is played and the table reconciles', () => {
  let game = createGame('newcastle');
  let matchesPlayed = 0;
  const rounds = totalRounds(game);
  while (game.round < rounds) {
    const out = playRound(game);
    game = out.game;
    assert.ok(out.result, 'user club had a fixture every round');
    matchesPlayed += 1;
  }
  assert.equal(game.round, rounds);
  assert.equal(matchesPlayed, rounds);
  const expectedMatches = game.fixtures.reduce((sum, r) => sum + r.fixtures.length, 0);
  assert.equal(game.results.length, expectedMatches);

  const rows = Object.values(game.table);
  const totalP = rows.reduce((s, r) => s + r.p, 0);
  const totalW = rows.reduce((s, r) => s + r.w, 0);
  const totalD = rows.reduce((s, r) => s + r.d, 0);
  const totalL = rows.reduce((s, r) => s + r.l, 0);
  const totalGF = rows.reduce((s, r) => s + r.gf, 0);
  const totalGA = rows.reduce((s, r) => s + r.ga, 0);
  const totalPts = rows.reduce((s, r) => s + r.pts, 0);
  const totalGoals = game.results.reduce((s, r) => s + r.hg + r.ag, 0);

  assert.equal(totalP, 760, 'each club plays 38 matches');
  assert.equal(totalW, totalL, 'wins equal losses');
  assert.equal(totalD % 2, 0, 'draws come in pairs');
  assert.equal(totalW + totalD + totalL, 760);
  assert.equal(totalPts, totalW * 3 + totalD, 'points model');
  for (const row of rows) {
    assert.equal(row.p, 38);
    assert.equal(row.w + row.d + row.l, 38);
    assert.ok(row.form.length <= 5);
  }
});

check('condition and morale stay in range all season', () => {
  let game = createGame('brighton');
  while (game.round < totalRounds(game)) game = playRound(game).game;
  for (const club of CLUBS) {
    for (const p of squadOf(game, club.id)) {
      assert.ok(p.fitness >= 55 && p.fitness <= 100, `${p.name} fitness ${p.fitness}`);
      assert.ok(p.morale >= 30 && p.morale <= 100, `${p.name} morale ${p.morale}`);
      assert.ok(Number.isFinite(p.goals) && p.goals >= 0, `${p.name} goals`);
    }
  }
});

check('no scorer is credited to the wrong club', () => {
  const game = createGame('man-city');
  const fixture = fixtureFor(game, game.clubId, 1);
  const result = simulateFixture(game, fixture, 'round-0');
  for (const goal of result.scorers) {
    const belongs = squadOf(game, goal.clubId).some((p) => p.id === goal.playerId);
    assert.ok(belongs, `${goal.playerId} not in ${goal.clubId}`);
  }
});

check('next season resets the table and ages the squad', () => {
  let game = createGame('tottenham');
  while (game.round < totalRounds(game)) game = playRound(game).game;
  const before = squadOf(game, game.clubId)[0];
  game = advanceSeason(game);
  assert.equal(game.round, 0);
  assert.equal(game.table.tottenham.p, 0);
  assert.equal(totalRounds(game), 38, 'a fresh season is the full 38 matchweeks');
  assert.equal(game.results.length, 0);
  assert.equal(game.history.length, 1);
  const after = squadOf(game, game.clubId).find((p) => p.id === before.id);
  assert.equal(after.age, before.age + 1);
  assert.ok(after.ovr >= 58 && after.ovr <= 95);
});

check('applying a result twice doubles it (guards accidental replay)', () => {
  const game = createGame('aston-villa');
  const fixture = fixtureFor(game, game.clubId, 1);
  const result = simulateFixture(game, fixture, 'round-0');
  const before = game.table['aston-villa'].p;
  const once = applyResult(game, result);
  const twice = applyResult(once, result);
  assert.equal(once.table['aston-villa'].p, before + 1);
  assert.equal(twice.table['aston-villa'].p, before + 2);
  assert.equal(once.results.length, 1);
  assert.equal(twice.results.length, 2);
});

console.log(`\n${checks} engine checks passed\n`);
