/** Club picker / title screen. */
import { CLUBS, CLUB_BY_ID, CLUB_STARS, DATA_SNAPSHOT, groupOf } from '../data/league.js';
import { crest } from './crest.js';
import { escapeHtml } from './dom.js';

const ROUNDS = (CLUBS.length - 1) * 2;

function expectation(club) {
  const sorted = CLUBS.slice().sort((a, b) => b.rating - a.rating);
  const rank = sorted.findIndex((c) => c.id === club.id) + 1;
  if (rank <= 2) return { label: 'Win the title', difficulty: 'Pressure job', tone: 'bad' };
  if (rank <= 4) return { label: 'Top four', difficulty: 'Ambitious', tone: 'warn' };
  if (rank <= 8) return { label: 'European push', difficulty: 'Balanced', tone: 'good' };
  if (rank <= 14) return { label: 'Mid-table', difficulty: 'Steady', tone: 'accent' };
  return { label: 'Survive', difficulty: 'Underdog', tone: 'accent' };
}

const ordinal = (n) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

export function renderLanding(store) {
  const pickedId = store.pickedClub || store.hoverClub || CLUBS[0].id;
  const club = CLUB_BY_ID[pickedId];
  const existing = store.loadedSave;
  const total = existing ? existing.fixtures.length : ROUNDS - 9;
  const tableOrder = CLUBS; // snapshot order = current table order

  return `
    <div class="landing">
      <div class="landing__left">
        <div class="brand" style="border:0;padding:0">
          <span class="brand__mark">T</span>
          <span class="brand__text">
            <span class="brand__name">TOUCHLINE</span>
            <span class="brand__sub">Premier League 2026/27</span>
          </span>
        </div>

        <div class="stack" style="gap:16px">
          <div class="eyebrow" style="color:var(--muted)">Snapshot · ${DATA_SNAPSHOT.date} · matchweek 9 played</div>
          <h1 class="landing__title">The season<br />is <em>yours</em>.</h1>
          <p class="landing__lede">
            The real 2026/27 Premier League, nine matchweeks in. Take over a club, pick your eleven,
            and play out the remaining twenty-nine weekends exactly as they happen in your head.
          </p>
        </div>

        <div class="landing__stats">
          <div class="landing__stat"><b>${CLUBS.length}</b><span>Clubs</span></div>
          <div class="landing__stat"><b>38</b><span>Game season</span></div>
          <div class="landing__stat"><b>${(CLUBS.length * (CLUBS.length - 1))}</b><span>Fixtures</span></div>
          <div class="landing__stat"><b>9</b><span>Played for real</span></div>
        </div>

        ${existing
          ? `<div class="card card--accent">
              <div class="card__body" style="padding:15px">
                <div class="row" style="gap:12px">
                  ${crest(existing.clubId, 38)}
                  <div style="flex:1;min-width:0">
                    <div class="eyebrow" style="color:var(--accent)">Career in progress</div>
                    <div style="font-weight:600;margin-top:2px">${escapeHtml(CLUB_BY_ID[existing.clubId].name)} · ${escapeHtml(existing.manager || 'The Gaffer')}</div>
                    <div class="tiny dim">Matchday ${Math.min(existing.round + 1, total)} of ${total} · season ${existing.season}</div>
                  </div>
                  <button class="btn btn--primary" data-action="continue-career">Continue</button>
                </div>
                <button class="btn btn--ghost btn--sm" style="margin-top:10px" data-action="forget-career">Delete this career</button>
              </div>
            </div>`
          : ''}

        <div>
          <div class="pick-label"><span>Choose your club</span><span>${CLUBS.length} to choose from</span></div>
          <div class="club-grid">
            ${tableOrder
              .map((c, i) => {
                const e = expectation(c);
                return `
              <button class="club-card ${c.id === store.pickedClub ? 'is-picked' : ''}" style="--c:${c.colors.primary}" data-club="${c.id}">
                ${crest(c.id, 30)}
                <span class="club-card__body">
                  <span class="club-card__name">${c.name}</span>
                  <span class="club-card__meta">${ordinal(i + 1)} · ${e.label}</span>
                </span>
                <span class="club-card__ovr">${c.rating}</span>
              </button>`;
              })
              .join('')}
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

        <p class="landing__note">
          Unofficial fan project. The 20 clubs, crests, grounds, live standings, form and the closed 2026 summer
          transfer window are real as of ${DATA_SNAPSHOT.date}; ratings, attributes and every simulated result are
          TOUCHLINE’s own estimates. Not affiliated with the Premier League, any club, or Sports Interactive/SEGA.
        </p>
      </div>

      <div class="landing__right">${renderDossier(store, club.id)}</div>
    </div>`;
}

export function renderDossier(store, clubId = store.pickedClub || store.hoverClub || CLUBS[0].id) {
  const club = CLUB_BY_ID[clubId];
  const squad = club.squad.slice().sort((a, b) => b.ovr - a.ovr);
  const expectationInfo = expectation(club);
  const [p, w, d, l, gf, ga] = club.record;
  const depth = ['GK', 'DEF', 'MID', 'ATT'].map((g) => {
    const group = club.squad.filter((pl) => groupOf(pl.pos) === g);
    return {
      group: g,
      count: group.length,
      quality: Math.round(group.reduce((sum, pl) => sum + pl.ovr, 0) / Math.max(1, group.length)),
    };
  });
  const rank = CLUBS.findIndex((c) => c.id === club.id) + 1;

  return `
    <div class="dossier">
      <div class="dossier__head">
        <div>${crest(club.id, 72, 'crest--hero')}</div>
        <div style="min-width:0">
          <div class="dossier__kicker">Club dossier · ${expectationInfo.label}</div>
          <h2 class="dossier__name">${escapeHtml(club.name)}</h2>
          <div class="dossier__sub">${escapeHtml(club.ground)} · ${club.capacity.toLocaleString('en-GB')} · ${escapeHtml(club.manager)}</div>
        </div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Season so far · real</div>
        <div class="row" style="gap:18px;flex-wrap:wrap">
          <div><div class="stat__value" style="font-size:24px">${ordinal(rank)}</div><div class="tiny dim">in the table</div></div>
          <div><div class="stat__value" style="font-size:24px">${w * 3 + d}</div><div class="tiny dim">points</div></div>
          <div><div class="stat__value" style="font-size:24px">${w}–${d}–${l}</div><div class="tiny dim">W–D–L in ${p}</div></div>
          <div><div class="stat__value" style="font-size:24px">${gf}:${ga}</div><div class="tiny dim">goals</div></div>
        </div>
        <div class="row" style="gap:10px;margin-top:14px;flex-wrap:wrap">
          <span class="tag tag--${expectationInfo.tone}">${expectationInfo.label}</span>
          <span class="tag">${expectationInfo.difficulty}</span>
          ${club.form.map((r) => `<span class="dot dot--${r}">${r}</span>`).join('')}
        </div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Squad by department</div>
        <div class="star-map">
          ${depth.map((dep) => `<div class="star-cell"><b>${dep.quality}</b><span>${dep.group} · ${dep.count}</span></div>`).join('')}
        </div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">Key players</div>
        ${squad
          .slice(0, 5)
          .map(
            (pl) => `
          <div class="mini-player">
            <span class="pos-badge pos-badge--${groupOf(pl.pos)}">${pl.pos}</span>
            <span class="mini-player__name">${escapeHtml(pl.name)}</span>
            <span class="tiny dim">${pl.age}</span>
            <span class="mini-player__ovr">${pl.ovr}</span>
          </div>`,
          )
          .join('')}
        <div class="tiny dim" style="margin-top:10px">Star man: <b style="color:var(--ink-2)">${CLUB_STARS[club.id] || squad[0].name}</b></div>
      </div>

      <div class="dossier__section">
        <div class="dossier__label">What you inherit</div>
        <ul class="intel">
          <li>Their real ${ordinal(rank)}-place start, ${w * 3 + d} points from ${p} matches.</li>
          <li>A full squad, picked by us — change it before your first match.</li>
          <li>${ROUNDS - 9}+ matchdays left this season, every one of them yours.</li>
          <li>No sacking in this build. Only the table judges you.</li>
        </ul>
      </div>
    </div>`;
}
