/** Tactics board: drag-and-drop XI, formation and mentality. */
import { CLUB_BY_ID, groupOf } from '../data/league.js';
import { squadNumber } from '../core/attrs.js';
import { FORMATION_LIST, slotFitness, fitnessLabel } from '../core/formations.js';
import { benchOf, formationOf, selectedXI, squadOf, xiStrength } from '../engine/state.js';
import { MENTALITY_LIST } from '../engine/match.js';
import { escapeHtml } from './dom.js';

function markings() {
  return `
    <svg class="markings" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <g fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".55">
        <rect x="4" y="4" width="92" height="132" rx="1" />
        <line x1="4" y1="70" x2="96" y2="70" />
        <circle cx="50" cy="70" r="12" />
        <circle cx="50" cy="70" r=".9" fill="rgba(255,255,255,.3)" />
        <rect x="26" y="4" width="48" height="20" />
        <rect x="38" y="4" width="24" height="8" />
        <path d="M41 24a9 9 0 0 0 18 0" />
        <circle cx="50" cy="15" r=".8" fill="rgba(255,255,255,.3)" />
        <rect x="26" y="116" width="48" height="20" />
        <rect x="38" y="128" width="24" height="8" />
        <path d="M41 116a9 9 0 0 0 18 0" transform="rotate(180 50 116)" />
        <circle cx="50" cy="124" r=".8" fill="rgba(255,255,255,.3)" />
        <path d="M4 10a6 6 0 0 0 6-6M96 10a6 6 0 0 1-6-6M4 130a6 6 0 0 1 6 6M96 130a6 6 0 0 0-6 6" />
      </g>
    </svg>`;
}

export function renderTactics(store) {
  const game = store.game;
  const formation = formationOf(game);
  const club = CLUB_BY_ID[game.clubId];
  const xi = selectedXI(game);
  const bench = benchOf(game);
  const strength = xiStrength(game);
  const selected = store.selectedSlot;
  const selectedPlayer = selected ? xi.find((s) => s.slotDef.id === selected)?.player : null;
  const average = xi.reduce((sum, s) => sum + (s.player ? s.player.ovr : 0), 0) / xi.length;
  const warnings = [];

  for (const s of xi) {
    if (!s.player) { warnings.push(`${s.slotDef.label} is empty`); continue; }
    const fit = slotFitness(s.player, s.slotDef);
    if (fit < 0.78) warnings.push(`${s.player.name} is badly out of position at ${s.slotDef.label}`);
    if (s.player.fitness < 72) warnings.push(`${s.player.name} is running on empty (${Math.round(s.player.fitness)}%)`);
  }

  return `
    <div class="tactics">
      <div class="card pitch-card">
        <div class="card__head" style="padding:4px 4px 14px">
          <div>
            <div class="card__title">${formation.name} · ${club.name}</div>
            <p class="tiny dim" style="margin-top:4px">Tap a shirt, then tap a teammate or a bench player to swap.</p>
          </div>
          <div class="card__spacer"></div>
          <button class="btn btn--sm btn--ghost" data-action="autopick">Auto pick</button>
        </div>
        <div class="pitch" id="pitch" data-tour="pitch">
          ${markings()}
          ${xi
            .map(
              (s, i) => `
            <div class="token ${!s.player ? 'is-empty' : ''} ${s.player && s.player.fitness < 78 ? 'is-tired' : ''} ${s.player && s.player.fitness < 66 ? 'is-knackered' : ''} ${selected === s.slotDef.id ? 'is-selected' : ''}"
                 data-slot="${s.slotDef.id}" style="left:${s.slotDef.x}%;top:${s.slotDef.y}%">
              <span class="token__slot">${s.slotDef.label}</span>
              <span class="token__shirt">${s.player ? squadNumber(s.player) : '·'}</span>
              <span class="token__name">${s.player ? escapeHtml(shortName(s.player.name)) : 'Empty'}</span>
            </div>`,
            )
            .join('')}
          <span class="pitch__hint">Drag to move · tap to swap</span>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card__head"><div class="card__title">Shape</div><div class="card__spacer"></div><span class="tag tag--accent">${average.toFixed(1)} avg ovr</span></div>
          <div class="card__body stack">
            <div class="form-toggle">
              ${FORMATION_LIST.map(
                (f) => `
                <button class="form-toggle__opt ${f.id === formation.id ? 'is-active' : ''}" data-formation="${f.id}">
                  <span style="flex:1">
                    <b>${f.name}</b>
                    <small>${f.blurb}</small>
                  </span>
                </button>`,
              ).join('')}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title">Mentality</div><div class="card__spacer"></div><span class="tag">Risk</span></div>
          <div class="card__body">
            <div class="seg" style="width:100%;justify-content:space-between" data-tour="mentality">
              ${MENTALITY_LIST.map(
                (m) => `<button class="${(game.mentality || 'balanced') === m.id ? 'is-active' : ''}" data-mentality="${m.id}" title="${m.blurb}">${m.name}</button>`,
              ).join('')}
            </div>
            <div class="row" style="margin-top:12px;gap:16px">
              <div style="flex:1">
                <div class="row row--between tiny"><span class="dim">Attack</span><span class="mono">${(strength * 1.02).toFixed(0)}</span></div>
                <div class="meter meter--thin" style="margin-top:4px"><i class="elite" style="width:${Math.min(100, strength + 6)}%"></i></div>
              </div>
              <div style="flex:1">
                <div class="row row--between tiny"><span class="dim">Defence</span><span class="mono">${(strength * 0.99).toFixed(0)}</span></div>
                <div class="meter meter--thin" style="margin-top:4px"><i class="hot" style="width:${Math.min(100, strength + 3)}%"></i></div>
              </div>
            </div>
            <p class="tiny dim" style="margin-top:12px">${MENTALITY_LIST.find((m) => m.id === (game.mentality || 'balanced')).blurb}</p>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">${selectedPlayer ? `Swapping ${escapeHtml(shortName(selectedPlayer.name))}` : 'Bench'}</div>
            <div class="card__spacer"></div>
            ${selectedPlayer ? '<button class="btn btn--sm btn--ghost" data-action="clear-selection">Cancel</button>' : `<span class="tag">${bench.length}</span>`}
          </div>
          <div class="card__body">
            <div class="form-list" style="max-height:330px;overflow-y:auto;padding-right:2px">
              ${bench
                .slice()
                .sort((a, b) => b.ovr - a.ovr)
                .map(
                  (p) => `
                <button class="form-row" data-bench="${p.id}" ${selected ? '' : 'disabled style="cursor:default"'}>
                  <div>
                    <div class="form-row__name"><span class="pos-badge pos-badge--${groupOf(p.pos)}">${p.pos}</span>${escapeHtml(p.name)}</div>
                    <div class="form-row__meta">${p.ovr} ovr · ${Math.round(p.fitness)}% · ${fitnessLabel(p.fitness)}</div>
                  </div>
                  <span class="tag ${p.ovr >= 82 ? 'tag--accent' : ''}">${p.ovr}</span>
                </button>`,
                )
                .join('')}
            </div>
          </div>
        </div>

        <div class="card ${warnings.length ? 'card--accent' : ''}">
          <div class="card__head"><div class="card__title">Team report</div></div>
          <div class="card__body">
            ${
              warnings.length
                ? `<ul class="intel">${warnings.slice(0, 6).map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
                : `<p class="small muted">No selection issues. Everyone is in a natural slot with legs left.</p>`
            }
            <div class="row" style="margin-top:14px;gap:10px">
              <div class="stat" style="flex:1;padding:10px 12px">
                <span class="stat__label">XI rating</span>
                <span class="stat__value" style="font-size:20px">${strength.toFixed(1)}</span>
              </div>
              <button class="btn btn--primary" style="flex:1" data-nav="match">To matchday →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function shortName(name) {
  const parts = name.split(' ');
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name;
}

/**
 * Drag-and-drop + tap-to-swap. Drop targets are the formation's fixed slots;
 * dropping anywhere near one swaps the two players.
 */
export function mountTactics(root, store, actions) {
  const pitch = root.querySelector('#pitch');
  if (!pitch) return;
  const formation = formationOf(store.game);
  const tokens = Array.from(pitch.querySelectorAll('.token'));
  let drag = null;

  const slotAt = (clientX, clientY) => {
    const rect = pitch.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    let best = null;
    let bestDist = 14;
    for (const slot of formation.slots) {
      const dist = Math.hypot(slot.x - x, slot.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    return best;
  };

  for (const token of tokens) {
    token.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      token.setPointerCapture(event.pointerId);
      drag = { token, slotId: token.dataset.slot, moved: false };
      const rect = pitch.getBoundingClientRect();
      drag.offsetX = event.clientX - rect.left - (parseFloat(token.style.left) / 100) * rect.width;
      drag.offsetY = event.clientY - rect.top - (parseFloat(token.style.top) / 100) * rect.height;
      drag.rect = rect;
    });

    token.addEventListener('pointermove', (event) => {
      if (!drag || drag.token !== token) return;
      const dx = event.clientX - (drag.rect.left + drag.rect.width * (parseFloat(token.style.left) / 100) + drag.offsetX);
      if (Math.abs(dx) > 3) drag.moved = true;
      if (!drag.moved) return;
      token.classList.add('is-dragging');
      pitch.classList.add('is-dragging');
      const x = ((event.clientX - drag.rect.left - drag.offsetX) / drag.rect.width) * 100;
      const y = ((event.clientY - drag.rect.top - drag.offsetY) / drag.rect.height) * 100;
      token.style.left = `${Math.max(4, Math.min(96, x))}%`;
      token.style.top = `${Math.max(4, Math.min(96, y))}%`;
    });

    token.addEventListener('pointerup', (event) => {
      if (!drag || drag.token !== token) return;
      const wasMoved = drag.moved;
      const from = drag.slotId;
      token.classList.remove('is-dragging');
      pitch.classList.remove('is-dragging');
      drag = null;
      if (!wasMoved) {
        actions.selectSlot(store.selectedSlot === from ? null : from);
        return;
      }
      const target = slotAt(event.clientX, event.clientY);
      if (target && target.id !== from) actions.swapSlots(from, target.id);
      else actions.rerender();
    });

    token.addEventListener('pointercancel', () => {
      if (drag) {
        token.classList.remove('is-dragging');
        pitch.classList.remove('is-dragging');
        drag = null;
        actions.rerender();
      }
    });
  }
}
