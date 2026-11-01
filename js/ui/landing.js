/** Club picker / title screen. */
import { CLUBS, CLUB_BY_ID, CLUB_STARS, groupOf } from '../data/league.js';
import { crest } from './crest.js';
import { escapeHtml } from './dom.js';

function expectation(club) {
  const sorted = CLUBS.slice().sort((a, b) => b.rating - a.rating);
  const rank = sorted.findIndex((c) => c.id === club.id) + 1;
  if (rank <= 2) return { label: 'Win the title', difficulty: 'Pressure job', tone: 'bad' };
  if (rank <= 4) return { label: 'Top four finish', difficulty: 'Ambitious', tone: 'warn' };
  if (rank <= 7) return { label: 'Mid-table stability', difficulty: 'Balanced', tone: 'good' };
  return { label: 'Avoid relegation', difficulty: 'Underdog', tone: 'accent' };
}

export function renderLanding(store) {
  const pickedId = store.pickedClub || store.hoverClub || CLUBS[0].id;
  const club = CLUB_BY_ID[pickedId];
  const dossier = renderDossier(store, club.id);
  const existing = store.loadedSave;

  return `
    <div class="landing">
      <div class="landing__left">
        <div class="brand" style="border:0;padding:0">
          <span class="brand__mark">T</span>
          <span class="brand__text">
            <span class="brand__name">TOUCHLINE</span>
            <span class="brand__sub">Football management</span>
          </span>
        </div>

        <div class="stack" style="gap:18px">
          <div class="landing__eyebrow"><i></i> 2025/26 season · ten clubs</div>
          <h1 class="landing__title">Take the<br /><em>job</em>.</h1>
          <p class="landing__lede">Pick a club, pick your eleven, and take charge of every matchday. Real squads, invented ratings, one very long season.</p>
        </div>

        <div class="landing__stats">
          <div class="landing__stat"><b>10</b><span>Clubs</span></div>
          <div class="landing__stat"><b>18</b><span>Matchdays</span></div>
          <div class="landing__stat"><b>5</b><span>Formations</span></div>
          <div class="landing__stat"><b>90</b><span>Fixtures</span></div>
        </div>

        ${existing
          ? `<div class="card card--accent">
              <div class="card__body" style="padding:16px">
                <div class="row" style="gap:12px">
                  ${crest(existing.clubId, 36)}
                  <div style="flex:1;min-width:0">
                    <div class="upper" style="color:var(--accent)">Career in progress</div>
                    <div style="font-weight:600">${escapeHtml(CLUB_BY_ID[existing.clubId].name)} · season ${existing.season}</div>
                    <div class="tiny dim">Matchday ${Math.min(existing.round + 1, 18)} of 18</div>
                  </div>
                  <button class="btn btn--primary" data-action="continue-career">Continue</button>
                </div>
                <button class="btn btn--ghost btn--sm" style="margin-top:10px" data-action="forget-career">Start over</button>
              </div>
            </div>`
          : ''}

        <div>
          <div class="pick-label"><span>Choose your club</span><span>${club.name}</span></div>
          <div class="club-grid">
            ${CLUBS.map((c) => {
              const e = expectation(c);
              return `
              <button class="club-card ${c.id === store.pickedClub ? 'is-picked' : ''}" style="--c:${c.colors.primary}" data-club="${c.id}">
                ${crest(c.id, 34)}
                <span class="club-card__body">
                  <span class="club-card__name">${c.name}</span>
                  <span class="club-card__meta"><span class="tag" style="font-size:9px;padding:1px 6px">${e.label}</span></span>
                  <span class="club-card__star">Star man <b>${CLUB_STARS[c.id]}</b></span>
                </span>
                <span class="club-card__ovr">${c.rating}</span>
              </button>`;
            }).join('')}
          </div>
        </div>

        <div class="start-panel">
          <div class="start-panel__field">
            <span class="start-panel__label">Your name</span>
            <input type="text" maxlength="24" placeholder="The Gaffer" value="${escapeHtml(store.managerName || '')}" data-manager-input aria-label="Manager name" />
          </div>
          <button class="btn btn--primary btn--lg" data-action="start" ${store.pickedClub ? '' : 'disabled'}>
            ${store.pickedClub ? `Manage ${CLUB_BY_ID[store.pickedClub].name}` : 'Pick a club'}
          </button>
        </div>

        <p class="landing__note">An unofficial fan project. Club and player names are real; every rating, result and contract here is invented. Your career saves to this browser only.</p>
      </div>

      <div class="landing__right">${dossier}</div>
    </div>`;
}


export function renderDossier(store, clubId = store.pickedClub || store.hoverClub || CLUBS[0].id) {
  const club = CLUB_BY_ID[clubId];
  const squad = club.squad.slice().sort((a, b) => b.ovr - a.ovr);
  const expectationInfo = expectation(club);
  const depth = ['GK', 'DEF', 'MID', 'ATT'].map((g) => ({
    group: g,
    count: club.squad.filter((p) => groupOf(p.pos) === g).length,
    quality: Math.round(
      club.squad.filter((p) => groupOf(p.pos) === g).reduce((sum, p) => sum + p.ovr, 0) /
        Math.max(1, club.squad.filter((p) => groupOf(p.pos) === g).length),
    ),
  }));
  return `
    <div class="dossier">
      <div class="dossier__head">
        <div class="dossier__crest">${crest(club.id, 64)}</div>
        <div style="min-width:0">
          <div class="dossier__kicker">Club dossier · ${expectationInfo.label}</div>
          <h2 class="dossier__name">${club.name}</h2>
          <div class="dossier__sub">${club.ground} · ${club.city} · rated ${club.rating}</div>
        </div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Board expectation</div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="tag tag--${expectationInfo.tone}">${expectationInfo.label}</span>
          <span class="tag">${expectationInfo.difficulty}</span>
          <span class="tag">Squad ${Math.round(club.squad.reduce((s, p) => s + p.ovr, 0) / club.squad.length)} avg</span>
        </div>
        <p class="tiny muted" style="margin-top:12px">${
          expectationInfo.difficulty === 'Pressure job'
            ? 'Nothing less than the title will do. The board have money but no patience.'
            : expectationInfo.difficulty === 'Ambitious'
              ? 'The board want European football. A strong start buys you time.'
              : expectationInfo.difficulty === 'Underdog'
                ? 'Survival is the brief. Every point is worth double here.'
                : 'A solid mid-table season with a cup run would be welcomed.'
        }</p>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Squad by department</div>
        <div class="star-map">
          ${depth.map((d) => `<div class="star-cell"><b>${d.quality}</b><span>${d.group} · ${d.count}</span></div>`).join('')}
        </div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Key players</div>
        ${squad
          .slice(0, 5)
          .map(
            (p) => `
          <div class="mini-player">
            <span class="pos-badge pos-badge--${groupOf(p.pos)}">${p.pos}</span>
            <span class="mini-player__name">${escapeHtml(p.name)}</span>
            <span class="tiny dim">${p.age}</span>
            <span class="mini-player__ovr">${p.ovr}</span>
          </div>`,
          )
          .join('')}
      </div>

      <div class="dossier__section">
        <div class="dossier__label">How a matchday works</div>
        <ul class="intel">
          <li>Set your eleven on the tactics board — drag shirts between slots.</li>
          <li>Choose a shape and a mentality, then kick off from the match centre.</li>
          <li>Goals, cards and ratings unfold live; the table updates across the league.</li>
          <li>Play all 18 matchdays. The board judges you in May.</li>
        </ul>
      </div>
    </div>`;
}
