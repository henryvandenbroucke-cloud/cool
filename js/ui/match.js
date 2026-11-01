/** Match centre: pre-match hub, live commentary, post-match analysis. */
import { CLUB_BY_ID, groupOf } from '../data/league.js';
import { ROUNDS, fixtureFor, formationOf, selectedXI, squadOf, xiStrength, sortTable } from '../engine/state.js';
import { autoPick } from '../core/formations.js';
import { MENTALITY_LIST } from '../engine/match.js';
import { crest } from './crest.js';
import { escapeHtml, formDots } from './dom.js';
import { shortName } from './tactics.js';

const clubName = (id) => CLUB_BY_ID[id].name;
const clubShort = (id) => CLUB_BY_ID[id].short;

function strength(game, clubId) {
  return clubId === game.clubId ? xiStrength(game, clubId) : CLUB_BY_ID[clubId].rating * 0.985;
}

function predictedXI(game, clubId) {
  const squad = squadOf(game, clubId).slice().sort((a, b) => b.ovr - a.ovr);
  const picks = autoPick(squad, '4-3-3');
  return Object.values(picks)
    .map((id) => squad.find((p) => p.id === id))
    .filter(Boolean);
}

function dangerMan(game, clubId) {
  const squad = squadOf(game, clubId).slice();
  return squad
    .filter((p) => groupOf(p.pos) === 'ATT' || p.pos === 'AM' || p.pos === 'CM')
    .sort((a, b) => b.ovr + (b.goals || 0) * 2 - (a.ovr + (a.goals || 0) * 2))[0] || squad[0];
}

function opponentIntel(game, opponentId) {
  const table = sortTable(game);
  const row = table.find((r) => r.clubId === opponentId);
  const pos = table.indexOf(row) + 1;
  const star = dangerMan(game, opponentId);
  const xi = predictedXI(game, opponentId);
  const avg = xi.reduce((s, p) => s + p.ovr, 0) / (xi.length || 1);
  const attack = xi.filter((p) => groupOf(p.pos) === 'ATT').reduce((s, p) => s + p.ovr, 0) / Math.max(1, xi.filter((p) => groupOf(p.pos) === 'ATT').length);
  const defence = xi.filter((p) => groupOf(p.pos) === 'DEF').reduce((s, p) => s + p.ovr, 0) / Math.max(1, xi.filter((p) => groupOf(p.pos) === 'DEF').length);
  const shape = autoPick(squadOf(game, opponentId), '4-3-3') && '4-3-3';

  return `
    <div class="stack">
      <div class="card">
        <div class="card__head">
          <div class="card__title"><b>Opposition report</b></div>
          <div class="card__spacer"></div>
          <span class="tag">${pos}${ordinal(pos)} in the table</span>
        </div>
        <div class="card__body stack">
          <div class="row" style="gap:14px">
            ${crest(opponentId, 42)}
            <div style="flex:1">
              <div class="row row--between">
                <b>${clubName(opponentId)}</b>
                <span class="mono small muted">${row.w}W ${row.d}D ${row.l}L</span>
              </div>
              <div class="row" style="margin-top:6px;gap:8px">
                ${formDots(row.form)}
                <span class="tiny dim">last five</span>
              </div>
            </div>
          </div>

          <div class="danger">
            <span class="danger__ovr">${star.ovr}</span>
            <div style="min-width:0">
              <div class="tiny upper" style="color:var(--bad)">Danger man</div>
              <div style="font-weight:600;font-size:13px">${escapeHtml(star.name)}</div>
              <div class="tiny dim">${star.pos} · ${star.goals || 0} goals this season</div>
            </div>
          </div>

          <div class="grid-3">
            <div class="star-cell"><b>${avg.toFixed(0)}</b><span>XI avg</span></div>
            <div class="star-cell"><b>${attack.toFixed(0)}</b><span>Attack</span></div>
            <div class="star-cell"><b>${defence.toFixed(0)}</b><span>Defence</span></div>
          </div>

          <div>
            <div class="dossier__label">Predicted XI · ${shape}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${xi.map((p) => `<span class="tag" style="${p.id === star.id ? 'border-color:rgba(255,107,107,.4);color:#ffb3b3' : ''}">${escapeHtml(shortName(p.name))}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function ordinal(n) {
  if (n % 10 === 1 && n !== 11) return 'st';
  if (n % 10 === 2 && n !== 12) return 'nd';
  if (n % 10 === 3 && n !== 13) return 'rd';
  return 'th';
}

function scoreboard(game, fixture, opts = {}) {
  const { home, away } = fixture;
  const isHome = home === game.clubId;
  return `
    <div class="scoreboard">
      <div class="scoreboard__team">
        ${crest(home, opts.size || 52)}
        <div class="scoreboard__name">${clubName(home)}</div>
        <div class="scoreboard__venue">${isHome ? 'Home' : 'Away'}${home === game.clubId ? ' · You' : ''}</div>
      </div>
      <div class="scoreboard__centre">
        ${opts.score !== undefined
          ? `<div class="scoreboard__score">${opts.score}</div>`
          : `<div class="scoreboard__score" style="font-size:26px;letter-spacing:-0.03em">${clubShort(home)} <span style="font-family:var(--serif);font-style:italic;font-weight:400;color:var(--dim)">v</span> ${clubShort(away)}</div>`}
        ${opts.clock
          ? `<div class="scoreboard__clock"><span class="live-dot"></span>${opts.clock}</div>`
          : `<div class="scoreboard__clock">${CLUB_BY_ID[home].ground}</div>`}
      </div>
      <div class="scoreboard__team scoreboard__team--away">
        ${crest(away, opts.size || 52)}
        <div class="scoreboard__name">${clubName(away)}</div>
        <div class="scoreboard__venue">${away === game.clubId ? 'Away · You' : 'Away'}</div>
      </div>
    </div>`;
}

export function renderMatch(store) {
  const game = store.game;
  const match = store.match;

  if (game.round >= ROUNDS) return renderSeasonComplete(store);

  const fixture = fixtureFor(game, game.clubId, game.round + 1);
  if (!fixture) return `<div class="empty-state"><b>No fixture this round</b></div>`;

  if (match && !match.finished) return renderLive(store, fixture);
  if (match && match.finished) return renderPost(store, match.result);
  return renderPrematch(store, fixture);
}

function renderPrematch(store, fixture) {
  const game = store.game;
  const isHome = fixture.home === game.clubId;
  const opponentId = isHome ? fixture.away : fixture.home;
  const formation = formationOf(game);
  const xi = selectedXI(game);
  const myStrength = xiStrength(game);
  const opp = strength(game, opponentId);
  const mentality = MENTALITY_LIST.find((m) => m.id === (game.mentality || 'balanced'));
  const gap = myStrength - opp;
  const verdict = gap > 5 ? 'Favourites' : gap > 1 ? 'Slight edge' : gap > -3 ? 'Coin flip' : 'Underdogs';
  const table = sortTable(game);
  const myPos = table.findIndex((r) => r.clubId === game.clubId) + 1;

  return `
    <div class="section-head">
      <h2>Matchday ${game.round + 1} <span class="serif italic dim" style="font-size:0.8em">of ${ROUNDS}</span></h2>
      <p>${CLUB_BY_ID[game.clubId].name} are ${myPos}${ordinal(myPos)} · ${isHome ? 'at home' : 'on the road'} at ${CLUB_BY_ID[fixture.home].ground}</p>
    </div>

    <div class="prematch">
      <div class="stack">
        <div class="card">
          ${scoreboard(game, fixture)}
          <div class="card__body" style="padding-top:18px">
            <div class="row" style="gap:12px;flex-wrap:wrap">
              <span class="tag ${verdict === 'Favourites' ? 'tag--good' : verdict === 'Underdogs' ? 'tag--bad' : ''}">${verdict}</span>
              <span class="tag">${formation.name}</span>
              <span class="tag">${mentality.name}</span>
              <span class="tag">XI ${myStrength.toFixed(1)}</span>
              <span class="tag">Opp ${opp.toFixed(1)}</span>
            </div>
            <div class="row" style="margin-top:18px;gap:16px">
              <div style="flex:1">
                <div class="row row--between tiny"><span class="dim">Your XI</span><b class="mono">${myStrength.toFixed(1)}</b></div>
                <div class="meter" style="margin-top:6px"><i class="elite" style="width:${Math.min(100, myStrength)}%"></i></div>
              </div>
              <div style="flex:1">
                <div class="row row--between tiny"><span class="dim">${clubShort(opponentId)} XI</span><b class="mono">${opp.toFixed(1)}</b></div>
                <div class="meter" style="margin-top:6px"><i class="hot" style="width:${Math.min(100, opp)}%"></i></div>
              </div>
            </div>
            <div class="row" style="margin-top:20px;gap:10px;flex-wrap:wrap">
              <button class="btn btn--primary btn--lg" data-action="kickoff">Kick off <span aria-hidden="true">→</span></button>
              <button class="btn btn--ghost btn--lg" data-nav="tactics">Adjust tactics</button>
              <span class="tiny dim" style="margin-left:auto">${xi.filter((s) => s.player && s.player.fitness < 75).length} players below 75% condition</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title"><b>Your XI</b></div><div class="card__spacer"></div><span class="tag">${formation.name}</span></div>
          <div class="card__body">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:6px">
              ${xi
                .map(
                  (s) => `
                <div class="row" style="padding:7px 8px;border-radius:8px;background:rgba(255,255,255,.025);gap:8px">
                  <span class="pos-badge pos-badge--${s.slotDef.role === 'GK' ? 'GK' : s.slotDef.role}">${s.slotDef.label}</span>
                  <div style="min-width:0;flex:1">
                    <div class="tiny" style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.player ? escapeHtml(shortName(s.player.name)) : 'Empty'}</div>
                    <div class="tiny dim">${s.player ? `${s.player.ovr} ovr · ${Math.round(s.player.fitness)}%` : '—'}</div>
                  </div>
                </div>`,
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>

      ${opponentIntel(game, opponentId)}
    </div>`;
}

function renderLive(store, fixture) {
  const { match } = store;
  const { result } = match;
  const revealed = result.events.filter((e) => e.minute <= match.clock || match.finished);
  const score = revealed.filter((e) => e.type === 'goal').reduce(
    (acc, e) => {
      if (e.side === 'home') acc[0] += 1;
      else acc[1] += 1;
      return acc;
    },
    [0, 0],
  );
  const clockLabel = match.clock >= 90 ? 'FULL TIME' : `${String(Math.min(90, match.clock)).padStart(2, '0')}:00`;
  const home = result.home === store.game.clubId;
  const possession = revealed.length > 3 ? Math.round(clamp(50 + (score[0] - score[1]) * 3 + (home ? 3 : -3), 32, 68)) : 50;

  return `
    <div class="stack">
      ${scoreboard(store.game, fixture, { score: `${score[0]} – ${score[1]}`, clock: clockLabel })}

      <div class="grid-2 layout-live">
        <div class="card">
          <div class="card__head">
            <div class="card__title"><b>Live commentary</b></div>
            <div class="card__spacer"></div>
            <div class="seg" role="group" aria-label="Playback speed">
              ${[1, 2, 4].map((s) => `<button class="${match.speed === s ? 'is-active' : ''}" data-speed="${s}">${s}×</button>`).join('')}
              <button data-action="skip">Sim</button>
            </div>
          </div>
          <div class="card__body">
            <div class="commentary no-anim" id="commentary">
              ${revealed
                .slice()
                .reverse()
                .map(
                  (e) => `
                <div class="event event--${e.type}">
                  <span class="event__minute">${e.type === 'kickoff' ? "'" : `${e.minute}'`}</span>
                  <div>
                    <div class="event__title">${e.title}${e.score ? ` · ${e.score}` : ''}</div>
                    <div class="event__text">${escapeHtml(e.text)}</div>
                  </div>
                </div>`,
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="card__head"><div class="card__title"><b>Match stats</b></div></div>
            <div class="card__body stack">
              ${statLine('Possession', possession, 100 - possession, '%')}
              ${statLine('Shots', Math.round(result.stats.home.shots * (match.clock / 90)), Math.round(result.stats.away.shots * (match.clock / 90)))}
              ${statLine('On target', Math.round(result.stats.home.onTarget * (match.clock / 90)), Math.round(result.stats.away.onTarget * (match.clock / 90)))}
              <div class="tiny dim" style="margin-top:4px;display:flex;justify-content:space-between">
                <span>${clubShort(result.home)}</span><span>${clubShort(result.away)}</span>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><div class="card__title"><b>Goals</b></div></div>
            <div class="card__body">
              ${
                revealed.filter((e) => e.type === 'goal').length
                  ? revealed
                      .filter((e) => e.type === 'goal')
                      .map(
                        (e) => `<div class="row" style="gap:8px;padding:5px 0;font-size:12px">
                          <span class="mono dim" style="width:24px">${e.minute}'</span>
                          ${crest(e.clubId, 16)}
                          <span>${escapeHtml(e.playerId ? playerName(store.game, e.clubId, e.playerId) : 'Unknown')}</span>
                          <span class="dim" style="margin-left:auto">${e.score}</span>
                        </div>`,
                      )
                      .join('')
                  : '<p class="tiny dim">No goals yet.</p>'
              }
            </div>
          </div>

          <button class="btn btn--ghost" data-action="leave-match">Leave match</button>
        </div>
      </div>
    </div>`;
}

function playerName(game, clubId, playerId) {
  const p = squadOf(game, clubId).find((x) => x.id === playerId);
  return p ? p.name : 'Unknown';
}

function statLine(label, home, away, suffix = '') {
  const total = Math.max(1, home + away);
  return `
    <div class="stat-line">
      <span class="mono" style="text-align:right">${home}${suffix}</span>
      <div>
        <div class="stat-line__bar">
          <i class="home" style="width:${(home / total) * 100}%"></i>
          <i class="away" style="width:${(away / total) * 100}%"></i>
        </div>
        <div class="stat-line__label">${label}</div>
      </div>
      <span class="mono">${away}${suffix}</span>
    </div>`;
}

function renderPost(store, result) {
  const game = store.game;
  const me = game.clubId;
  const isHome = result.home === me;
  const myGoals = isHome ? result.hg : result.ag;
  const theirGoals = isHome ? result.ag : result.hg;
  const outcome = myGoals > theirGoals ? 'Won' : myGoals < theirGoals ? 'Lost' : 'Drew';
  const myRatings = (isHome ? result.ratings.home : result.ratings.away).slice(0, 11);

  return `
    <div class="stack">
      ${scoreboard(game, result, { score: `${result.hg} – ${result.ag}`, clock: 'FULL TIME' })}

      <div class="grid-2">
        <div class="card">
          <div class="card__head">
            <div class="card__title"><b>${outcome}</b></div>
            <div class="card__spacer"></div>
            <span class="tag ${outcome === 'Won' ? 'tag--good' : outcome === 'Lost' ? 'tag--bad' : 'tag--warn'}">Matchday ${game.round}</span>
          </div>
          <div class="card__body stack">
            <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
              <div class="stat"><span class="stat__label">Expected goals</span><span class="stat__value" style="font-size:20px">${isHome ? result.stats.home.xg : result.stats.away.xg}</span><span class="stat__sub">${isHome ? result.stats.away.xg : result.stats.home.xg} against</span></div>
              <div class="stat"><span class="stat__label">Shots</span><span class="stat__value" style="font-size:20px">${isHome ? result.stats.home.shots : result.stats.away.shots}</span><span class="stat__sub">${isHome ? result.stats.home.onTarget : result.stats.away.onTarget} on target</span></div>
            </div>
            ${statLine('Possession', result.stats.home.possession, result.stats.away.possession, '%')}
            ${statLine('Shots', result.stats.home.shots, result.stats.away.shots)}
            ${statLine('On target', result.stats.home.onTarget, result.stats.away.onTarget)}
            <div class="row" style="margin-top:8px;gap:10px">
              <button class="btn btn--primary" data-action="finish-match">Continue →</button>
              <button class="btn btn--ghost" data-nav="table">League table</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title"><b>Player ratings</b></div><div class="card__spacer"></div><span class="tag">Your XI</span></div>
          <div class="card__body">
            <div class="ratings">
              ${myRatings
                .map(
                  (r) => `
                <div class="rating-row">
                  <span class="pos-badge pos-badge--${groupOf(r.pos)}">${r.pos}</span>
                  <span style="min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(r.name)}${r.goals ? ` <span class="dim tiny">${r.goals}G</span>` : ''}</span>
                  <span class="rating ${r.rating >= 7.5 ? 'is-high' : ''}">${r.rating.toFixed(1)}</span>
                </div>`,
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function renderSeasonComplete(store) {
  const game = store.game;
  const table = sortTable(game);
  const champion = table[0];
  const me = table.find((r) => r.clubId === game.clubId);
  const pos = table.indexOf(me) + 1;
  return `
    <div class="card card--accent">
      <div class="card__body" style="padding:32px 26px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px">
        <span class="upper" style="color:var(--accent)">Season ${game.season} complete</span>
        <h2 style="font-size:clamp(30px,4vw,46px);letter-spacing:-0.04em">${pos === 1 ? 'Champions.' : `${pos}${ordinal(pos)} place.`}</h2>
        <div class="row" style="gap:10px">${crest(champion.clubId, 34)}<span>${clubName(champion.clubId)} lift the title with ${champion.pts} points</span></div>
        <p class="muted small" style="max-width:52ch">${CLUB_BY_ID[game.clubId].name} finished on ${me.pts} points — ${me.w}W ${me.d}D ${me.l}L, ${me.gf} scored and ${me.ga} conceded.</p>
        <div class="row" style="gap:10px;margin-top:6px">
          <button class="btn btn--primary btn--lg" data-action="next-season">Start season ${game.season + 1}</button>
          <button class="btn btn--ghost btn--lg" data-nav="table">Final table</button>
        </div>
      </div>
    </div>`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export { ordinal };
