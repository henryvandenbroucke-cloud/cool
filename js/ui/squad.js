/** Squad list: sortable, filterable, with a player dossier drawer. */
import { CLUB_BY_ID, groupOf } from '../data/league.js';
import { displayAttributes, marketValue, squadNumber, contribution } from '../core/attrs.js';
import { formationOf, squadOf, xiStrength } from '../engine/state.js';
import { slotFitness, fitnessLabel as fitLabel } from '../core/formations.js';
import { crest } from './crest.js';
import { escapeHtml, momentum } from './dom.js';

const COLUMNS = [
  { key: 'name', label: 'Player' },
  { key: 'pos', label: 'Pos' },
  { key: 'age', label: 'Age' },
  { key: 'ovr', label: 'Ovr' },
  { key: 'fitness', label: 'Condition' },
  { key: 'morale', label: 'Morale' },
  { key: 'goals', label: 'G' },
  { key: 'assists', label: 'A' },
  { key: 'value', label: 'Value' },
];

export function squadTotals(game) {
  const squad = squadOf(game, game.clubId);
  const avgAge = squad.reduce((s, p) => s + p.age, 0) / squad.length;
  const avgOvr = squad.reduce((s, p) => s + p.ovr, 0) / squad.length;
  const fitness = squad.reduce((s, p) => s + p.fitness, 0) / squad.length;
  return { size: squad.length, avgAge, avgOvr, fitness, strength: xiStrength(game) };
}

export function renderSquad(store) {
  const game = store.game;
  const squad = squadOf(game, game.clubId);
  const starters = new Set(Object.values(game.lineup));
  const totals = squadTotals(game);
  const mood = momentum(game);

  let rows = squad.filter((p) => store.filter === 'ALL' || (store.filter === 'XI' ? starters.has(p.id) : groupOf(p.pos) === store.filter));
  const { key, dir } = store.sort;
  rows = rows.slice().sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name) * dir;
    if (key === 'pos') return grp(a.pos).localeCompare(grp(b.pos)) * dir || b.ovr - a.ovr;
    return (a[key] - b[key]) * dir;
  });

  const header = COLUMNS.map((col) => {
    const active = store.sort.key === col.key;
    return `<th class="is-sortable ${active ? 'is-active' : ''}" data-sort="${col.key}">${col.label}${active ? (store.sort.dir === 1 ? ' ↑' : ' ↓') : ''}</th>`;
  }).join('');

  return `
    <div class="stats">
      <div class="stat">
        <span class="stat__label">Squad</span>
        <span class="stat__value">${totals.size}</span>
        <span class="stat__sub">Avg age ${totals.avgAge.toFixed(1)} · ${totals.avgOvr.toFixed(1)} ovr</span>
      </div>
      <div class="stat">
        <span class="stat__label">XI strength</span>
        <span class="stat__value">${totals.strength.toFixed(1)}</span>
        <span class="stat__sub">${formationOf(game).name} · ${game.mentality || 'balanced'}</span>
      </div>
      <div class="stat">
        <span class="stat__label">Condition</span>
        <span class="stat__value">${Math.round(totals.fitness)}</span>
        <span class="stat__sub">${fitLabel(totals.fitness)} squad average</span>
      </div>
      <div class="stat">
        <span class="stat__label">Momentum</span>
        <span class="stat__value" style="color:var(--${mood.tone === 'good' ? 'good' : mood.tone === 'bad' ? 'bad' : 'ink'})">${mood.label}</span>
        <span class="stat__sub">${game.table[game.clubId].w}W ${game.table[game.clubId].d}D ${game.table[game.clubId].l}L this season</span>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div>
          <div class="card__title"><b>First team</b></div>
        </div>
        <div class="card__spacer"></div>
        <div class="filters">
          ${['ALL', 'XI', 'GK', 'DEF', 'MID', 'ATT']
            .map((f) => `<button class="chip ${store.filter === f ? 'is-active' : ''}" data-filter="${f}">${f === 'ALL' ? 'All' : f === 'XI' ? 'Starting XI' : f}</button>`)
            .join('')}
        </div>
      </div>
      <div class="card__body table-wrap">
        <table class="squad">
          <thead><tr>${header}</tr></thead>
          <tbody>
            ${rows
              .map((p) => {
                const fit = Math.round(p.fitness);
                const mor = Math.round(p.morale);
                return `
                  <tr data-player="${p.id}" class="${starters.has(p.id) ? 'is-starter' : ''}">
                    <td>
                      <div class="player-cell">
                        <span class="shirt mono">${squadNumber(p)}</span>
                        <div>
                          <div class="player-name">${escapeHtml(p.name)}</div>
                          <div class="player-meta">${starters.has(p.id) ? 'Starting XI' : 'Bench'}${p.lastRating ? ` · last ${p.lastRating.toFixed(1)}` : ''}</div>
                        </div>
                      </div>
                    </td>
                    <td><span class="pos-badge pos-badge--${groupOf(p.pos)}">${p.pos}</span></td>
                    <td class="num">${p.age}</td>
                    <td><span class="ovr ${p.ovr >= 85 ? 'ovr--elite' : p.ovr >= 78 ? 'ovr--good' : 'ovr--ok'}">${p.ovr}</span></td>
                    <td>
                      <div class="fit-bar">
                        <div class="row row--between tiny" style="margin-bottom:3px">
                          <span class="dim">${fitLabel(fit)}</span><span class="mono">${fit}</span>
                        </div>
                        <div class="meter meter--thin"><i class="${fit >= 90 ? 'elite' : fit >= 78 ? 'good' : fit >= 68 ? 'ok' : 'low'}" style="width:${fit}%"></i></div>
                      </div>
                    </td>
                    <td>
                      <div class="row tiny" style="gap:6px">
                        <div class="meter meter--thin" style="width:44px"><i class="${mor >= 78 ? 'good' : mor >= 60 ? 'ok' : 'low'}" style="width:${mor}%"></i></div>
                        <span class="mono dim">${mor}</span>
                      </div>
                    </td>
                    <td class="num">${p.goals || 0}</td>
                    <td class="num">${p.assists || 0}</td>
                    <td class="num muted">${marketValue(p)}</td>
                  </tr>`;
              })
              .join('')}
          </tbody>
        </table>
        ${rows.length ? '' : '<div class="empty-state"><b>No players match that filter</b>Try another position group.</div>'}
      </div>
    </div>
  `;
}

export function renderPlayerDrawer(store, playerId) {
  const game = store.game;
  const squad = squadOf(game, game.clubId);
  const player = squad.find((p) => p.id === playerId);
  if (!player) return '';
  const attrs = displayAttributes(player);
  const formation = formationOf(game);
  const slotFor = Object.entries(game.lineup).find(([, id]) => id === player.id);
  const slotDef = slotFor ? formation.slots.find((s) => s.id === slotFor[0]) : null;
  const fit = slotDef ? slotFitness(player, slotDef) : null;
  const club = CLUB_BY_ID[game.clubId];
  const natural = formation.slots.filter((s) => slotFitness(player, s) >= 0.9);

  return `
    <div class="sheet-backdrop" data-close-sheet></div>
    <aside class="sheet" role="dialog" aria-label="${escapeHtml(player.name)} profile">
      <div class="sheet__head">
        ${crest(game.clubId, 46)}
        <div>
          <div class="upper dim">${club.name} · ${groupOf(player.pos)}</div>
          <h2 class="sheet__name">${escapeHtml(player.name)}</h2>
          <div class="sheet__meta">
            <span class="tag">${player.pos}</span>
            <span class="tag">${player.age} yrs</span>
            <span class="tag tag--accent">${player.ovr} ovr</span>
            ${fit !== null ? `<span class="tag ${fit >= 0.9 ? 'tag--good' : fit >= 0.78 ? 'tag--warn' : 'tag--bad'}">${Math.round(fit * 100)}% ${slotDef.label}</span>` : ''}
          </div>
        </div>
        <button class="btn btn--ghost btn--sm sheet__close" data-close-sheet aria-label="Close">✕</button>
      </div>

      <div class="grid-3">
        <div class="stat" style="padding:11px 12px"><span class="stat__label">Condition</span><span class="stat__value" style="font-size:19px">${Math.round(player.fitness)}</span><span class="stat__sub">${fitLabel(player.fitness)}</span></div>
        <div class="stat" style="padding:11px 12px"><span class="stat__label">Morale</span><span class="stat__value" style="font-size:19px">${Math.round(player.morale)}</span><span class="stat__sub">${player.morale > 78 ? 'Buzzing' : player.morale > 62 ? 'Settled' : 'Unsettled'}</span></div>
        <div class="stat" style="padding:11px 12px"><span class="stat__label">Value</span><span class="stat__value" style="font-size:19px">${marketValue(player)}</span><span class="stat__sub">Estimated</span></div>
      </div>

      <div>
        <div class="dossier__label">Attributes</div>
        <div class="attr-grid">
          ${attrs
            .map(
              (a) => `
            <div class="attr">
              <div class="attr__row"><span class="muted">${a.label}</span><b>${a.value}</b></div>
              <div class="meter meter--thin"><i class="${a.value >= 85 ? 'elite' : a.value >= 76 ? 'good' : a.value >= 66 ? 'ok' : 'low'}" style="width:${a.value}%"></i></div>
            </div>`,
            )
            .join('')}
        </div>
      </div>

      <div>
        <div class="dossier__label">Season</div>
        <div class="grid-3">
          <div class="star-cell"><b>${player.apps || 0}</b><span>Apps</span></div>
          <div class="star-cell"><b>${player.goals || 0}</b><span>Goals</span></div>
          <div class="star-cell"><b>${player.assists || 0}</b><span>Assists</span></div>
        </div>
      </div>

      <div>
        <div class="dossier__label">Best positions</div>
        <div class="filters">
          ${natural.length ? natural.map((s) => `<span class="tag">${s.label}</span>`).join('') : '<span class="tag tag--warn">No natural slot in this shape</span>'}
        </div>
        <p class="tiny muted" style="margin-top:10px">Contribution in a ${slotDef ? slotDef.label : 'typical'} slot: <b style="color:var(--ink)">${contribution(player, slotDef ? slotDef.role : groupOf(player.pos))}</b></p>
      </div>

      ${slotDef ? `<button class="btn btn--ghost" data-nav="tactics">Open tactics board</button>` : `<p class="tiny dim">Not in the XI. Drag them onto the board from the bench.</p>`}
    </aside>
  `;
}
