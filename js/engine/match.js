/**
 * Match engine.
 *
 * A possession-and-chance model: each side's expected goals come from its XI
 * strength against the opponent's, tilted by home advantage and mentality.
 * Goals and colour events are then sampled deterministically, so the same
 * fixture always produces the same 90 minutes.
 */
import { CLUB_BY_ID, groupOf } from '../data/league.js';
import { makeRng } from '../core/rng.js';
import { autoPick, slotStrength } from '../core/formations.js';
import { formationOf, squadOf, xiStrength, ROUNDS } from './state.js';

const MENTALITY = {
  defensive: { name: 'Defensive', for: 0.86, against: 0.84, blurb: 'Sit deep, soak pressure, strike on the break.' },
  balanced: { name: 'Balanced', for: 1, against: 1, blurb: 'Keep the shape and take what the game gives you.' },
  attacking: { name: 'Attacking', for: 1.15, against: 1.16, blurb: 'Push the line high and commit bodies forward.' },
};

export const MENTALITY_LIST = Object.entries(MENTALITY).map(([id, m]) => ({ id, ...m }));

/** Poisson-ish lambda for one side. */
function expectedGoals(attack, defence, isHome, mentality, opponentMentality) {
  const gap = (attack - defence) / 10;
  const base = 1.38 * Math.exp(gap * 0.46);
  const venue = isHome ? 1.1 : 0.92;
  const style = MENTALITY[mentality] || MENTALITY.balanced;
  const opponentStyle = MENTALITY[opponentMentality] || MENTALITY.balanced;
  return Math.max(0.18, base * venue * style.for * opponentStyle.against);
}

/** A side's effective XI, for clubs the user isn't managing. */
function effectiveXI(game, clubId) {
  if (clubId === game.clubId) {
    const formation = formationOf(game);
    const squad = squadOf(game, clubId);
    const xi = formation.slots.map((slotDef) => {
      const player = squad.find((p) => p.id === game.lineup[slotDef.id]);
      return { slotDef, player, strength: player ? slotStrength(player, slotDef) : 0 };
    });
    if (xi.some((s) => !s.player)) {
      const picks = autoPick(squad, game.formation);
      return formation.slots.map((slotDef) => {
        const player = squad.find((p) => p.id === picks[slotDef.id]) || null;
        return { slotDef, player, strength: player ? slotStrength(player, slotDef) : 0 };
      });
    }
    return xi;
  }
  const squad = squadOf(game, clubId).slice().sort((a, b) => b.ovr - a.ovr);
  const formation = formationOf({ formation: '4-3-3' });
  const picks = autoPick(squad, '4-3-3');
  return formation.slots.map((slotDef) => {
    const player = squad.find((p) => p.id === picks[slotDef.id]) || squad[0];
    return { slotDef, player, strength: player ? slotStrength(player, slotDef) : 0 };
  });
}

const firstName = (name) => name.split(' ').slice(0, -1).join(' ') || name;

function pickScorer(rng, xi) {
  const weights = xi
    .filter((s) => s.player && s.slotDef.role !== 'GK')
    .map((s) => {
      const roleWeight = s.slotDef.role === 'ATT' ? 5.4 : s.slotDef.role === 'MID' ? 2.1 : 0.8;
      return { value: s.player, weight: roleWeight * Math.pow(s.player.ovr / 78, 1.6) };
    });
  return rng.weighted(weights);
}

function pickAssister(rng, xi, scorerId) {
  const weights = xi
    .filter((s) => s.player && s.player.id !== scorerId && s.slotDef.role !== 'GK')
    .map((s) => {
      const roleWeight = s.slotDef.role === 'ATT' ? 3 : s.slotDef.role === 'MID' ? 3.2 : 1.2;
      return { value: s.player, weight: roleWeight * Math.pow(s.player.ovr / 78, 1.4) };
    });
  return rng.chance(0.76) ? rng.weighted(weights) : null;
}

const FLAVOUR = {
  save: [
    '{shooter} works space on the edge of the box but {keeper} gets down well.',
    'Fierce drive from {shooter} — {keeper} pushes it wide.',
    '{shooter} meets the cross, {keeper} claims at the second attempt.',
  ],
  miss: [
    '{shooter} drags it wide from twelve yards. Should have hit the target.',
    'Header from {shooter} glances off the top of the crossbar.',
    '{shooter} is through — and lifts it over the bar. The bench can\'t believe it.',
    'Cleared off the line! {shooter} had beaten the keeper.',
  ],
  chance: [
    'Sustained pressure from {team}. The away end is getting twitchy.',
    '{team} are queueing up here — another corner won.',
    '{shooter} rattles the post. Inches away.',
  ],
  card: [
    '{shooter} goes into the book for a late one in midfield.',
    'Cynical trip by {shooter}. Yellow card, no complaints.',
    '{shooter} catches his man on the turn — booked.',
  ],
};

function fill(template, map) {
  return template.replace(/\{(\w+)\}/g, (_, key) => map[key] ?? '');
}

function pickText(rng, kind, map) {
  return fill(rng.pick(FLAVOUR[kind]), map);
}

/**
 * Simulate one fixture. Returns a self-contained result object.
 * `seedKey` keeps repeat simulations identical.
 */
export function simulateFixture(game, fixture, seedKey = '') {
  const { home, away } = fixture;
  const rng = makeRng(`match|${seedKey}|${home}|${away}|${game.season}|${game.round}`);

  const homeXI = effectiveXI(game, home);
  const awayXI = effectiveXI(game, away);
  const homeStrength = home === game.clubId ? xiStrength(game, home) : CLUB_BY_ID[home].rating * 0.985;
  const awayStrength = away === game.clubId ? xiStrength(game, away) : CLUB_BY_ID[away].rating * 0.985;

  const homeMentality = home === game.clubId ? game.mentality || 'balanced' : 'balanced';
  const awayMentality = away === game.clubId ? game.mentality || 'balanced' : 'balanced';

  const homeAttack = homeStrength - 1.2;
  const awayAttack = awayStrength - 1.2;
  const lamHome = expectedGoals(homeAttack, awayStrength, true, homeMentality, awayMentality);
  const lamAway = expectedGoals(awayAttack, homeStrength, false, awayMentality, homeMentality);

  const hg = Math.min(7, rng.poisson(lamHome));
  const ag = Math.min(7, rng.poisson(lamAway));

  const events = [];
  const scorers = [];
  let scoreHome = 0;
  let scoreAway = 0;

  const goals = [
    ...Array.from({ length: hg }, () => ({ side: 'home' })),
    ...Array.from({ length: ag }, () => ({ side: 'away' })),
  ].sort(() => rng.next() - 0.5);

  const minutes = goals.map(() => rng.int(3, 90)).sort((a, b) => a - b);

  goals.forEach((goal, i) => {
    const xi = goal.side === 'home' ? homeXI : awayXI;
    const clubId = goal.side === 'home' ? home : away;
    const scorer = pickScorer(rng, xi);
    const assister = scorer ? pickAssister(rng, xi, scorer.id) : null;
    if (goal.side === 'home') scoreHome += 1;
    else scoreAway += 1;
    if (scorer) scorers.push({ playerId: scorer.id, clubId, minute: minutes[i] });
    const types = ['Goal', 'Goal', 'Goal', 'Header', 'Penalty', 'Screamer', 'Tap-in'];
    const type = rng.pick(types);
    const text =
      type === 'Penalty'
        ? `${scorer ? scorer.name : 'The forward'} sends the keeper the wrong way from the spot.`
        : type === 'Screamer'
          ? `Unbelievable from ${scorer ? scorer.name : 'the forward'} — struck from 25 yards into the top corner.`
          : type === 'Header'
            ? `${scorer ? scorer.name : 'The forward'} rises highest to head home${assister ? ` from ${assister.name}'s delivery` : ''}.`
            : type === 'Tap-in'
              ? `${scorer ? scorer.name : 'The forward'} taps in from close range${assister ? ` after ${assister.name} did the work` : ''}.`
              : `${scorer ? scorer.name : 'The forward'} finishes calmly${assister ? `, set up by ${assister.name}` : ''}.`;
    events.push({
      minute: minutes[i],
      type: 'goal',
      side: goal.side,
      clubId,
      title: `GOAL — ${CLUB_BY_ID[clubId].name}`,
      text,
      score: `${scoreHome}-${scoreAway}`,
      playerId: scorer ? scorer.id : null,
    });
  });

  const shotsHome = Math.max(hg, Math.round(hg * 2.4 + rng.float(3, 9)));
  const shotsAway = Math.max(ag, Math.round(ag * 2.4 + rng.float(2, 8)));

  // Colour: saves, misses, cards — no effect on the score, but they pace the feed.
  const flavourCount = rng.int(7, 12);
  for (let i = 0; i < flavourCount; i += 1) {
    const side = rng.chance(0.52) ? 'home' : 'away';
    const xi = side === 'home' ? homeXI : awayXI;
    const clubId = side === 'home' ? home : away;
    const shooter = rng.pick(xi.filter((s) => s.player && s.slotDef.role !== 'GK')).player;
    const keeper = (side === 'home' ? awayXI : homeXI).find((s) => s.slotDef.role === 'GK')?.player;
    const kind = rng.weighted([['save', 5], ['miss', 4], ['chance', 3], ['card', 2]]);
    events.push({
      minute: rng.int(2, 90),
      type: kind === 'card' ? 'card' : 'chance',
      side,
      clubId,
      title: kind === 'card' ? 'Yellow card' : 'Chance',
      text: pickText(rng, kind, {
        shooter: shooter ? shooter.name : 'The forward',
        keeper: keeper ? keeper.name : 'the keeper',
        team: CLUB_BY_ID[clubId].name,
      }),
      score: null,
    });
  }

  events.push({ minute: 0, type: 'kickoff', side: 'neutral', title: 'Kick-off', text: `${CLUB_BY_ID[home].name} get us under way at ${CLUB_BY_ID[home].ground}.`, score: '0-0' });
  events.push({ minute: 45, type: 'half', side: 'neutral', title: 'Half-time', text: `Half-time. ${CLUB_BY_ID[home].short} ${scoreAt(events, 45, 'h')} ${CLUB_BY_ID[away].short}`, score: null });
  events.push({ minute: 90, type: 'full', side: 'neutral', title: 'Full-time', text: `${CLUB_BY_ID[home].name} ${hg}–${ag} ${CLUB_BY_ID[away].name}`, score: `${hg}-${ag}` });

  events.sort((a, b) => a.minute - b.minute || (a.type === 'kickoff' ? -1 : 1));

  const possessionHome = Math.round(50 + (homeStrength - awayStrength) * 1.6 + rng.float(-4, 4));
  const clampedPossession = Math.max(30, Math.min(70, possessionHome));

  const result = {
    round: game.round + 1,
    home,
    away,
    hg,
    ag,
    events,
    scorers,
    stats: {
      home: {
        possession: clampedPossession,
        shots: shotsHome,
        onTarget: Math.max(hg, Math.round(shotsHome * rng.float(0.32, 0.5))),
        xg: Number(lamHome.toFixed(2)),
      },
      away: {
        possession: 100 - clampedPossession,
        shots: shotsAway,
        onTarget: Math.max(ag, Math.round(shotsAway * rng.float(0.32, 0.5))),
        xg: Number(lamAway.toFixed(2)),
      },
    },
  };
  result.ratings = rateSides(game, result, homeXI, awayXI);
  return result;
}

function scoreAt(events, minute, side) {
  let h = 0;
  let a = 0;
  for (const e of events) {
    if (e.type !== 'goal' || e.minute > minute) continue;
    if (e.side === 'home') h += 1;
    else a += 1;
  }
  if (side === 'h') return `${h}–${a}`;
  return `${a}–${h}`;
}

/** Simple per-player ratings for the user's XI (and everyone else's, cheaply). */
function rateSides(game, result, homeXI, awayXI) {
  const rng = makeRng(`ratings|${result.home}|${result.away}|${result.hg}|${result.ag}|${game.round}`);
  const make = (xi, clubId, scored, conceded) => {
    const rows = [];
    for (const s of xi) {
      if (!s.player) continue;
      const goals = result.scorers.filter((g) => g.playerId === s.player.id).length;
      const base = 6.2 + (scored - conceded) * 0.16 + goals * 0.85 + rng.float(-0.45, 0.55);
      const keeperBonus = s.slotDef.role === 'GK' && conceded === 0 ? 0.7 : 0;
      rows.push({
        playerId: s.player.id,
        name: s.player.name,
        pos: s.player.pos,
        goals,
        rating: Math.max(4.4, Math.min(9.9, Number((base + keeperBonus).toFixed(1)))),
      });
    }
    return rows.sort((a, b) => b.rating - a.rating);
  };
  return { home: make(homeXI, result.home, result.hg, result.ag), away: make(awayXI, result.away, result.ag, result.hg) };
}

/** Apply a result to the league table and to player fitness/morale. */
export function applyResult(game, result) {
  const table = structuredClone(game.table);
  const home = table[result.home];
  const away = table[result.away];
  home.p += 1;
  away.p += 1;
  home.gf += result.hg;
  home.ga += result.ag;
  away.gf += result.ag;
  away.ga += result.hg;

  if (result.hg > result.ag) {
    home.w += 1; home.pts += 3; away.l += 1;
    home.form.push('W'); away.form.push('L');
  } else if (result.hg < result.ag) {
    away.w += 1; away.pts += 3; home.l += 1;
    home.form.push('L'); away.form.push('W');
  } else {
    home.d += 1; away.d += 1; home.pts += 1; away.pts += 1;
    home.form.push('D'); away.form.push('D');
  }
  home.form = home.form.slice(-5);
  away.form = away.form.slice(-5);

  const squads = {};
  for (const [clubId, squad] of Object.entries(game.squads)) {
    const played = clubId === result.home || clubId === result.away;
    const rng = makeRng(`fitness|${clubId}|${game.round}`);
    let won = false;
    let lost = false;
    if (played) {
      won = (clubId === result.home && result.hg > result.ag) || (clubId === result.away && result.ag > result.hg);
      lost = (clubId === result.home && result.hg < result.ag) || (clubId === result.away && result.ag < result.hg);
    }
    squads[clubId] = squad.map((p) => {
      const isUserClub = clubId === game.clubId;
      const started = isUserClub ? Object.values(game.lineup).includes(p.id) : p.apps > 0;
      const next = { ...p };
      if (played) {
        const load = isUserClub && started ? rng.int(9, 17) : played ? rng.int(3, 9) : 0;
        next.fitness = Math.max(58, Math.min(100, p.fitness - load + rng.int(4, 8)));
        next.morale = Math.max(35, Math.min(99, p.morale + (won ? rng.int(1, 4) : lost ? -rng.int(1, 4) : 0)));
        if (isUserClub && started) next.apps = (p.apps || 0) + 1;
        if (isUserClub && started) {
          const goalsToday = result.scorers.filter((s) => s.playerId === p.id).length;
          next.goals = (p.goals || 0) + goalsToday;
        }
        const ratings = [...result.ratings.home, ...result.ratings.away].find((r) => r.playerId === p.id);
        if (ratings) next.lastRating = ratings.rating;
      } else {
        next.fitness = Math.min(100, p.fitness + rng.int(3, 6));
      }
      return next;
    });
  }

  return {
    ...game,
    table,
    squads,
    results: [...game.results, result],
    lastMatch: result,
  };
}

export function playRound(game) {
  const matchday = game.fixtures.find((f) => f.round === game.round + 1);
  if (!matchday) return game;
  let next = game;
  let userResult = null;
  for (const fixture of matchday.fixtures) {
    const result = simulateFixture(next, fixture, `round-${next.round}`);
    if (fixture.home === next.clubId || fixture.away === next.clubId) userResult = result;
    next = applyResult(next, result);
  }
  return { game: { ...next, round: Math.min(ROUNDS, next.round + 1) }, result: userResult };
}

export { groupOf };
