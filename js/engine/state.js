/**
 * Game state: squads, selection, fixtures, league table.
 *
 * Everything lives in a plain serialisable object so a career can be saved to
 * localStorage with JSON.stringify and restored with zero migration code.
 */
import { CLUBS, CLUB_BY_ID, groupOf } from '../data/league.js';
import { makeRng } from '../core/rng.js';
import { FORMATIONS, DEFAULT_FORMATION, autoPick, slotStrength } from '../core/formations.js';

export const ROUNDS = (CLUBS.length - 1) * 2; // single round-robin, played twice
export const SAVE_KEY = 'touchline.save.v2';
/** Matchweeks already played in the real world on the snapshot date. */
export const MATCHWEEK = 9;

/** Double round-robin fixtures via the circle method. */
export function buildFixtures() {
  const ids = CLUBS.map((c) => c.id);
  const n = ids.length;
  const rotation = ids.slice(1);
  const rounds = [];
  const rng = makeRng('fixtures');
  const fixed = ids[0];

  for (let r = 0; r < n - 1; r += 1) {
    const order = [fixed, ...rotation];
    const pairs = [];
    for (let i = 0; i < n / 2; i += 1) {
      const a = order[i];
      const b = order[n - 1 - i];
      // Alternate home/away so no club gets a long run of home games.
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(rng.shuffle(pairs));
    rotation.unshift(rotation.pop());
  }

  // Second half of the season: reverse fixtures.
  const reversed = rounds.map((round) => round.map((f) => ({ home: f.away, away: f.home })));
  const all = [...rounds, ...reversed];
  return all.map((round, index) => ({ round: index + 1, fixtures: round }));
}

export function buildSquads(seed = 'touchline') {
  const squad = {};
  for (const club of CLUBS) {
    const rng = makeRng(`${seed}|${club.id}`);
    squad[club.id] = club.squad.map((p, i) => ({
      id: `${club.id}-${i}`,
      clubId: club.id,
      name: p.name,
      pos: p.pos,
      ovr: p.ovr,
      age: p.age,
      fitness: 86 + Math.round(rng.next() * 12),
      morale: 62 + Math.round(rng.next() * 26),
      form: 0,
      goals: 0,
      assists: 0,
      apps: 0,
      rating: p.ovr,
    }));
  }
  return squad;
}

export function emptyTable() {
  const table = {};
  for (const club of CLUBS) {
    table[club.id] = { clubId: club.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: [] };
  }
  return table;
}

/**
 * The real 2026/27 table on 1 November 2026: nine matchweeks played, then the
 * season is yours from matchweek ten.
 */
export function realTable() {
  const table = {};
  for (const club of CLUBS) {
    const [p, w, d, l, gf, ga] = club.record || [0, 0, 0, 0, 0, 0];
    table[club.id] = {
      clubId: club.id,
      p, w, d, l, gf, ga,
      pts: w * 3 + d,
      form: (club.form || []).slice(-5),
    };
  }
  return table;
}

/**
 * The remaining 2026/27 calendar.
 *
 * Four clubs hold a game in hand after the real nine matchweeks (they have
 * played eight). They meet each other in a midweek catch-up round first, then
 * everyone plays the 29 matchweeks that are left. Clubs with a game in hand end
 * on 30 matches from here, the rest on 29 — adding up to a 38-game season.
 */
export function buildRemaining(seed = 'remaining') {
  const rng = makeRng(seed);
  const base = buildFixtures();
  const inHand = CLUBS.filter((c) => c.record[0] < MATCHWEEK).map((c) => c.id);
  const rounds = [];

  for (const matchday of base.slice(0, 29)) {
    rounds.push({ round: rounds.length + 1, fixtures: matchday.fixtures });
  }

  // The four clubs holding a game in hand meet in a final midweek round.
  if (inHand.length >= 2) {
    const shuffled = rng.shuffle(inHand);
    const fixtures = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      fixtures.push({ home: shuffled[i], away: shuffled[i + 1], catchUp: true });
    }
    if (fixtures.length) rounds.push({ round: rounds.length + 1, fixtures, catchUp: true });
  }
  return rounds;
}

/** Every matchday the user's club appears in, from here to the end. */
export function userRounds(game) {
  return game.fixtures.filter((md) => md.fixtures.some((f) => f.home === game.clubId || f.away === game.clubId));
}

/** How many of the user's matchdays are done and how many are left. */
export function userProgress(game) {
  const mine = userRounds(game);
  const done = mine.filter((md) => md.round <= game.round).length;
  return { done, total: mine.length, next: mine[done] || null };
}

/** True once the user's club has nothing left to play. */
export function seasonComplete(game) {
  return !game.fixtures.some(
    (matchday) => matchday.round > game.round && matchday.fixtures.some((f) => f.home === game.clubId || f.away === game.clubId),
  );
}

export const totalRounds = (game) => game.fixtures.length;

export function createGame(clubId, managerName = 'You') {
  const formation = DEFAULT_FORMATION;
  const squads = buildSquads();
  const lineup = autoPick(squads[clubId], formation);
  return {
    version: 3,
    manager: managerName,
    clubId,
    season: 2026,
    matchweek: MATCHWEEK,
    round: 0,
    formation,
    mentality: 'balanced',
    lineup,
    squads,
    table: realTable(),
    fixtures: buildRemaining(),
    results: [],
    history: [],
    lastMatch: null,
  };
}

export const squadOf = (game, clubId) => game.squads[clubId] || [];

export function formationOf(game) {
  return FORMATIONS[game.formation] || FORMATIONS[DEFAULT_FORMATION];
}

/** The user's XI, resolved with slot definitions and fitness penalties. */
export function selectedXI(game) {
  const formation = formationOf(game);
  const squad = squadOf(game, game.clubId);
  return formation.slots
    .map((slotDef) => {
      const player = squad.find((p) => p.id === game.lineup[slotDef.id]);
      return player ? { slotDef, player, strength: slotStrength(player, slotDef) } : { slotDef, player: null, strength: 0 };
    });
}

export function benchOf(game) {
  const used = new Set(Object.values(game.lineup));
  return squadOf(game, game.clubId).filter((p) => !used.has(p.id));
}

/** Squad strength on a 0–100 scale, used by the table/opponent previews. */
export function xiStrength(game, clubId = game.clubId) {
  if (clubId === game.clubId) {
    const xi = selectedXI(game);
    if (xi.some((s) => !s.player)) {
      const fallback = autoPick(squadOf(game, clubId), game.formation);
      const formation = formationOf(game);
      const squad = squadOf(game, clubId);
      const total = formation.slots.reduce((sum, s) => {
        const p = squad.find((pl) => pl.id === fallback[s.id]);
        return sum + (p ? slotStrength(p, s) : 0);
      }, 0);
      return total / formation.slots.length;
    }
    const healthy = xi.reduce((sum, s) => sum + s.strength * (0.72 + s.player.fitness / 300), 0);
    return healthy / xi.length;
  }
  const squad = squadOf(game, clubId);
  const best = squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 11);
  return best.reduce((sum, p) => sum + p.ovr, 0) / best.length;
}

/** Fixture for the user's club in a given round, if any. */
export function fixtureFor(game, clubId, round) {
  const matchday = game.fixtures.find((f) => f.round === round);
  if (!matchday) return null;
  return matchday.fixtures.find((f) => f.home === clubId || f.away === clubId) || null;
}

export function sortTable(game) {
  return Object.values(game.table).sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gf - b.ga - (a.gf - a.ga) ||
      b.gf - a.gf ||
      CLUB_BY_ID[a.clubId].name.localeCompare(CLUB_BY_ID[b.clubId].name),
  );
}

export function leaguePosition(game, clubId = game.clubId) {
  return sortTable(game).findIndex((row) => row.clubId === clubId) + 1;
}

/** Move the selected club to the new season and reset the competitions. */
export function advanceSeason(game) {
  const table = sortTable(game);
  const champion = table[0];
  const history = [
    ...game.history,
    {
      season: game.season,
      champion: champion.clubId,
      position: leaguePosition(game),
      points: game.table[game.clubId].pts,
    },
  ];
  const next = {
    ...game,
    season: game.season + 1,
    matchweek: 0,
    round: 0,
    table: emptyTable(),
    fixtures: buildFixtures(),
    results: [],
    history,
    lastMatch: null,
  };
  next.squads = Object.fromEntries(
    Object.entries(game.squads).map(([clubId, squad]) => [
      clubId,
      squad.map((p) => {
        const rng = makeRng(`${game.season}|${p.id}|age`);
        const age = p.age + 1;
        const drift = rng.int(-2, 2) + (age < 23 ? 1 : 0) - (age > 31 ? 1 : 0);
        return {
          ...p,
          age,
          ovr: Math.max(58, Math.min(95, p.ovr + drift)),
          fitness: 88 + rng.int(0, 10),
          morale: 66,
          form: 0,
          goals: 0,
          assists: 0,
          apps: 0,
        };
      }),
    ]),
  );
  const starter = autoPick(next.squads[next.clubId], next.formation);
  next.lineup = starter;
  return next;
}

export { groupOf, CLUBS, CLUB_BY_ID };
