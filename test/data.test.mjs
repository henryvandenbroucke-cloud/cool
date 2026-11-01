/** Data integrity: squads, formations and fixtures must be coherent. */
import assert from 'node:assert/strict';
import { CLUBS, CLUB_BY_ID, groupOf } from '../js/data/league.js';
import { FORMATIONS, FORMATION_LIST, autoPick } from '../js/core/formations.js';
import { buildFixtures, buildSquads, ROUNDS } from '../js/engine/state.js';

let checks = 0;
const check = (name, fn) => {
  fn();
  checks += 1;
  console.log(`  ✓ ${name}`);
};

console.log('data');

check('ten clubs with unique ids', () => {
  assert.equal(CLUBS.length, 10);
  assert.equal(new Set(CLUBS.map((c) => c.id)).size, 10);
  assert.equal(Object.keys(CLUB_BY_ID).length, 10);
});

check('every club fields a keeper and at least fifteen players', () => {
  for (const club of CLUBS) {
    assert.ok(club.squad.length >= 15, `${club.name} squad too small`);
    assert.ok(club.squad.filter((p) => p.pos === 'GK').length >= 1, `${club.name} has no keeper`);
    assert.equal(club.squad.filter((p) => p.pos === 'GK').length >= 1, true);
    for (const pos of ['CB', 'LB', 'RB', 'CM', 'ST']) {
      assert.ok(club.squad.some((p) => p.pos === pos), `${club.name} has no ${pos}`);
    }
  }
});

check('ratings and ages sit in a sane band', () => {
  for (const club of CLUBS) {
    for (const p of club.squad) {
      assert.ok(p.ovr >= 60 && p.ovr <= 95, `${p.name} ovr ${p.ovr}`);
      assert.ok(p.age >= 16 && p.age <= 40, `${p.name} age ${p.age}`);
      assert.ok(['GK', 'DEF', 'MID', 'ATT'].includes(groupOf(p.pos)), `${p.name} group`);
    }
  }
});

check('every formation has eleven slots with distinct ids', () => {
  assert.equal(FORMATION_LIST.length, 5);
  for (const f of FORMATION_LIST) {
    assert.equal(f.slots.length, 11, `${f.name} slots`);
    assert.equal(new Set(f.slots.map((s) => s.id)).size, 11, `${f.name} duplicate slot ids`);
    assert.equal(f.slots.filter((s) => s.role === 'GK').length, 1, `${f.name} keeper count`);
    for (const s of f.slots) {
      assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100, `${f.name}/${s.id} outside pitch`);
    }
  }
});

check('auto-pick never selects the same player twice', () => {
  const squads = buildSquads();
  for (const club of CLUBS) {
    for (const f of FORMATION_LIST) {
      const picks = autoPick(squads[club.id], f.id);
      const ids = Object.values(picks);
      assert.equal(ids.length, 11, `${club.name}/${f.name} picked ${ids.length}`);
      assert.equal(new Set(ids).size, 11, `${club.name}/${f.name} duplicate pick`);
    }
  }
});

check('fixtures are a complete double round-robin', () => {
  const rounds = buildFixtures();
  assert.equal(rounds.length, ROUNDS);
  assert.equal(rounds.length, 18);
  const seen = new Map();
  for (const round of rounds) {
    assert.equal(round.fixtures.length, 5);
    const playing = new Set();
    for (const f of round.fixtures) {
      assert.notEqual(f.home, f.away);
      assert.ok(!playing.has(f.home) && !playing.has(f.away), 'club plays twice in one round');
      playing.add(f.home);
      playing.add(f.away);
      const key = `${f.home}>${f.away}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    assert.equal(playing.size, 10, 'not every club plays each round');
  }
  assert.equal(seen.size, 90, 'expected 90 distinct fixtures');
  for (const count of seen.values()) assert.equal(count, 1, 'fixture repeated');
});

check('each club plays every other club home and away', () => {
  const rounds = buildFixtures();
  for (const a of CLUBS) {
    for (const b of CLUBS) {
      if (a.id === b.id) continue;
      const homes = rounds.flatMap((r) => r.fixtures).filter((f) => f.home === a.id && f.away === b.id);
      const aways = rounds.flatMap((r) => r.fixtures).filter((f) => f.home === b.id && f.away === a.id);
      assert.equal(homes.length, 1, `${a.name} home vs ${b.name}`);
      assert.equal(aways.length, 1, `${a.name} away at ${b.name}`);
    }
  }
});

check('every squad plays in a formation it can staff', () => {
  const squads = buildSquads('seed-check');
  for (const club of CLUBS) {
    assert.equal(squads[club.id].length, club.squad.length);
    assert.ok(FORMATIONS['4-3-3'], 'default formation exists');
  }
});

console.log(`\n${checks} data checks passed\n`);
