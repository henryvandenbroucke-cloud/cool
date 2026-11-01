/** Application chrome: sidebar, top bar and the right-hand rail. */
import { CLUB_BY_ID, DATA_SNAPSHOT, groupOf } from '../data/league.js';
import { fixtureFor, formationOf, leaguePosition, seasonComplete, sortTable, squadOf, totalRounds, userProgress, xiStrength } from '../engine/state.js';
import { crest, clubColorVars } from './crest.js';
import { escapeHtml, formDots, momentum } from './dom.js';

const ICONS = {
  squad: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4"/><path d="M16 5.2a3 3 0 0 1 0 5.6"/><path d="M18.2 20c0-2.4-.7-4-2-5"/></svg>',
  tactics: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3.2"/></svg>',
  match: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.6 15.6 10l-1.3 4.2H9.7L8.4 10Z"/><path d="M12 3v4.6M20.4 9.4l-4.8.6M17.4 20l-3-3.4M6.6 20l3-3.4M3.6 9.4l4.8.6"/></svg>',
  table: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v18" opacity=".35"/></svg>',
  guide: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.5 5 8.5 4.4 5 4.6v13c3.5-.2 5.5.4 7 1.9 1.5-1.5 3.5-2.1 7-1.9v-13c-3.5-.2-5.5.4-7 1.9Z"/><path d="M12 6.5v13"/></svg>',
};

const TITLES = {
  squad: { eyebrow: 'First team', title: 'Squad' },
  tactics: { eyebrow: 'Match preparation', title: 'Tactics' },
  match: { eyebrow: 'Match centre', title: 'Matchday' },
  table: { eyebrow: 'Competition', title: 'Premier League table' },
  guide: { eyebrow: 'Manual', title: 'How to play' },
};

export function renderNav(store) {
  const game = store.game;
  const club = CLUB_BY_ID[game.clubId];
  const items = [
    ['squad', 'Squad'],
    ['tactics', 'Tactics'],
    ['match', 'Match'],
    ['table', 'Table'],
    ['guide', 'Guide'],
  ];
  return `
    <nav class="nav" aria-label="Main" data-tour="nav">
      <a class="brand" href="#squad" data-nav="squad">
        <span class="brand__mark">T</span>
        <span class="brand__text"><span class="brand__name">TOUCHLINE</span><span class="brand__sub">2026/27</span></span>
      </a>
      <div class="club-chip">
        ${crest(game.clubId, 32)}
        <div class="club-chip__meta">
          <div class="club-chip__name">${escapeHtml(club.name)}</div>
          <div class="club-chip__sub">${escapeHtml(game.manager)}</div>
        </div>
      </div>
      <div class="nav__items">
        <div class="nav__label">Club</div>
        ${items
          .map(
            ([id, label]) => `
          <button class="nav__item ${store.view === id ? 'is-active' : ''}" data-nav="${id}"
                  aria-label="${label}" ${store.view === id ? 'aria-current="page"' : ''}>
            ${ICONS[id]}<span>${label}</span>
            ${id === 'match' && !store.match && game.round < totalRounds(game) ? '<i class="nav__dot" aria-hidden="true"></i>' : ''}
          </button>`,
          )
          .join('')}
      </div>
      <div class="nav__spacer"></div>
      <div class="nav__foot">
        <button class="btn btn--ghost btn--sm" data-action="start-tour" title="Replay the guided tour">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8.5v4l2.5 1.5"/></svg>
          <span>Tour</span>
        </button>
        <button class="btn btn--ghost btn--sm" data-action="new-career" title="Start a new career">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 20v-4h4"/></svg>
          <span>New career</span>
        </button>
      </div>
    </nav>`;
}

export function renderTopbar(store) {
  const game = store.game;
  const meta = TITLES[store.view] || TITLES.squad;
  const pos = leaguePosition(game);
  const progress = userProgress(game);
  return `
    <header class="topbar">
      <div class="topbar__titles">
        <div class="eyebrow">${meta.eyebrow}</div>
        <h1>${meta.title}</h1>
      </div>
      <div class="topbar__spacer"></div>
      <div class="snapshot" data-tour="snapshot" title="Real 2026/27 data, frozen on ${DATA_SNAPSHOT.date}">
        <span class="snapshot__dot"></span>
        <span>Real season · <b>${DATA_SNAPSHOT.date}</b></span>
      </div>
      <div class="round-pill">
        <span>Matchday <b>${Math.min(progress.done + 1, progress.total)}</b>/${progress.total}</span>
        <span class="dim">·</span>
        <span>${pos}${superscript(pos)}</span>
      </div>
      <button class="btn btn--primary btn--sm" data-nav="match">${store.match && !store.match.finished ? 'Live match' : seasonComplete(game) ? 'Season review' : 'Matchday →'}</button>
    </header>`;
}

function superscript(n) {
  const map = { 1: 'st', 2: 'nd', 3: 'rd' };
  return map[n] || 'th';
}

export function renderRail(store) {
  const game = store.game;
  const club = CLUB_BY_ID[game.clubId];
  const squad = squadOf(game, game.clubId);
  const total = totalRounds(game);
  const fixture = seasonComplete(game) ? null : fixtureFor(game, game.clubId, game.round + 1);
  const rows = sortTable(game);
  const myIndex = rows.findIndex((r) => r.clubId === game.clubId);
  const miniRows = rows.slice(0, 5);
  if (myIndex > 4) miniRows.push(rows[myIndex]);
  const topScorer = squad.slice().sort((a, b) => (b.goals || 0) - (a.goals || 0))[0];
  const mood = momentum(game);
  const outfield = squad.filter((p) => groupOf(p.pos) !== 'GK');
  const fittest = outfield.slice().sort((a, b) => a.fitness - b.fitness)[0];

  return `
    <aside class="rail" aria-label="Club summary" data-tour="rail">
      <div class="card rail__card">
        <div class="rail__title"><span>Next fixture</span><span>MD ${Math.min(game.round + 1, total)}</span></div>
        ${
          fixture
            ? `<div class="next-fixture">
                <div class="row" style="gap:10px">
                  ${crest(fixture.home, 30)}
                  <div class="next-fixture__team" style="flex:1"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${CLUB_BY_ID[fixture.home].name}</b></div>
                  <span class="tag">${fixture.home === game.clubId ? 'H' : 'A'}</span>
                </div>
                <div class="row" style="gap:10px">
                  ${crest(fixture.away, 30)}
                  <div class="next-fixture__team" style="flex:1"><b style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${CLUB_BY_ID[fixture.away].name}</b></div>
                  <span class="tag">${fixture.away === game.clubId ? 'A' : 'H'}</span>
                </div>
                <div class="row row--between">
                  <span class="tiny dim">${escapeHtml(CLUB_BY_ID[fixture.home].ground)}</span>
                  <span class="tiny dim">${formationOf(game).name}</span>
                </div>
                <button class="btn btn--primary btn--sm btn--block" data-nav="match">Open match centre</button>
              </div>`
            : `<div class="empty-state" style="padding:16px 6px"><b>Season complete</b><span class="tiny">Head to the match centre for the review.</span></div>`
        }
      </div>

      <div class="card rail__card">
        <div class="rail__title"><span>Your club</span><span>${club.short}</span></div>
        <div class="row" style="gap:10px">
          ${crest(game.clubId, 40)}
          <div style="min-width:0;flex:1">
            <div style="font-weight:600;font-size:13.5px">${escapeHtml(club.name)}</div>
            <div class="tiny dim">${formationOf(game).name} · ${game.mentality || 'balanced'}</div>
          </div>
          <div style="text-align:right">
            <div class="mono" style="font-size:17px;font-weight:600">${xiStrength(game).toFixed(1)}</div>
            <div class="tiny dim">XI rating</div>
          </div>
        </div>
        <div class="row row--between" style="margin-top:14px">
          <div>
            <div class="tiny dim" style="margin-bottom:5px">Form</div>
            ${formDots(game.table[game.clubId].form)}
          </div>
          <span class="tag ${mood.tone === 'good' ? 'tag--good' : mood.tone === 'bad' ? 'tag--bad' : ''}">${mood.label}</span>
        </div>
      </div>

      <div class="card rail__card">
        <div class="rail__title"><span>League</span><span>${game.table[game.clubId].pts} pts</span></div>
        <div class="rail-table">
          ${miniRows
            .map(
              (row) => `
            <div class="rail-row ${row.clubId === game.clubId ? 'is-me' : ''}">
              <span class="rail-row__pos">${rows.indexOf(row) + 1}</span>
              ${crest(row.clubId, 18)}
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${CLUB_BY_ID[row.clubId].name}</span>
              <span class="dim tiny">${row.p}</span>
              <span class="rail-row__pts">${row.pts}</span>
            </div>`,
            )
            .join('')}
        </div>
        <button class="btn btn--ghost btn--sm btn--block" data-nav="table" style="margin-top:10px">Full table</button>
      </div>

      <div class="card rail__card">
        <div class="rail__title"><span>Squad notes</span></div>
        <div class="stack" style="gap:10px">
          <div class="row" style="gap:9px">
            <span class="pos-badge pos-badge--${groupOf(topScorer.pos)}">${topScorer.pos}</span>
            <div style="flex:1;min-width:0">
              <div class="tiny" style="font-weight:600">${escapeHtml(topScorer.name)}</div>
              <div class="tiny dim">Top scorer · ${topScorer.goals || 0} goals</div>
            </div>
            <b class="mono small">${topScorer.ovr}</b>
          </div>
          <div class="row" style="gap:9px">
            <span class="pos-badge pos-badge--${groupOf(fittest.pos)}">${fittest.pos}</span>
            <div style="flex:1;min-width:0">
              <div class="tiny" style="font-weight:600">${escapeHtml(fittest.name)}</div>
              <div class="tiny dim">Needs a breather · ${Math.round(fittest.fitness)}%</div>
            </div>
            <span class="tiny" style="color:var(--${fittest.fitness < 70 ? 'bad' : 'warn'})">●</span>
          </div>
        </div>
      </div>

      <button class="btn btn--ghost btn--sm btn--block" data-action="start-tour">Replay the tour</button>
      <p class="tiny dim" style="padding:0 4px">
        Snapshot ${DATA_SNAPSHOT.date} · ratings are TOUCHLINE estimates · saved locally
      </p>
    </aside>`;
}

export function shellStyles(game) {
  return clubColorVars(game.clubId);
}
