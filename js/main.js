/** TOUCHLINE — boot, routing, match clock and all interaction handlers. */
import { CLUB_BY_ID } from './data/league.js';
import { FORMATIONS, autoPick } from './core/formations.js';
import { fixtureFor, seasonComplete, squadOf, totalRounds } from './engine/state.js';
import { applyResult, simulateFixture } from './engine/match.js';
import { store, load, save, clearSave, newCareer, navigate, startNextSeason, subscribe } from './store.js';
import { renderLanding, renderDossier } from './ui/landing.js';
import { renderNav, renderTopbar, renderRail, shellStyles } from './ui/shell.js';
import { renderSquad, renderPlayerDrawer } from './ui/squad.js';
import { renderTactics, mountTactics } from './ui/tactics.js';
import { renderMatch } from './ui/match.js';
import { renderTable } from './ui/table.js';
import { renderGuide } from './ui/guide.js';
import { startTour, tourAfterRender, tourSeen, tourRunning, handleTourKey, endTour } from './ui/tour.js';

const root = document.querySelector('#app');
const TICK_MS = 150;

/* ------------------------------------------------------------------ render */

function render() {
  const scrollY = window.scrollY;
  const railScroll = document.querySelector('.rail')?.scrollTop || 0;

  if (!store.game) {
    document.documentElement.style.cssText = '';
    root.innerHTML = renderLanding(store);
    bindLanding();
    window.scrollTo(0, scrollY);
    return;
  }

  const club = CLUB_BY_ID[store.game.clubId];
  document.documentElement.style.cssText = shellStyles(store.game);
  document.title = `${titleFor(store.view)} · ${club.name} · TOUCHLINE`;

  const view = renderView();
  root.innerHTML = `
    <div class="app">
      ${renderNav(store)}
      <div class="main">
        ${renderTopbar(store)}
        <main class="view" id="view">${view}</main>
      </div>
      ${renderRail(store)}
    </div>
    ${store.drawerPlayerId ? renderPlayerDrawer(store, store.drawerPlayerId) : ''}
  `;

  if (store.view === 'tactics') mountTactics(root, store, actions);
  if (store.view === 'landing') bindLanding();
  tourAfterRender(store, tourActions);
  window.scrollTo(0, scrollY);
  const rail = document.querySelector('.rail');
  if (rail) rail.scrollTop = railScroll;
}

/** Cheap update while the clock runs: repaint the match view only. */
function tickRender() {
  if (!store.match || store.match.finished) return;
  if (store.view !== 'match') return;
  const view = document.querySelector('#view');
  if (!view) {
    render();
    return;
  }
  const scrollY = window.scrollY;
  view.innerHTML = renderView();
  view.classList.add('no-anim');
  window.scrollTo(0, scrollY);
}

function titleFor(view) {
  return { squad: 'Squad', tactics: 'Tactics', match: 'Matchday', table: 'League table' }[view] || 'Club';
}

function renderView() {
  switch (store.view) {
    case 'squad':
      return renderSquad(store);
    case 'tactics':
      return renderTactics(store);
    case 'match':
      return renderMatch(store);
    case 'table':
      return renderTable(store);
    case 'guide':
      return renderGuide(store);
    default:
      return renderSquad(store);
  }
}

/* ---------------------------------------------------------------- actions  */

const tourActions = {
  navigate(view) {
    store.view = view;
    store.selectedSlot = null;
    store.drawerPlayerId = null;
    render();
  },
};

const actions = {
  selectSlot(slotId) {
    store.selectedSlot = slotId;
    render();
  },
  swapSlots(a, b) {
    const lineup = { ...store.game.lineup };
    const first = lineup[a];
    lineup[a] = lineup[b];
    lineup[b] = first;
    store.game = { ...store.game, lineup };
    save();
    render();
  },
  rerender() {
    render();
  },
};

function pickForSlot(playerId) {
  if (!store.selectedSlot) {
    toast('Pick a shirt on the board first');
    return;
  }
  const lineup = { ...store.game.lineup };
  lineup[store.selectedSlot] = playerId;
  store.game = { ...store.game, lineup };
  store.selectedSlot = null;
  save();
  render();
}

function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('toast--out'), 2000);
  setTimeout(() => el.remove(), 2400);
}

function flash() {
  const el = document.createElement('div');
  el.className = 'match-flash';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

/* ------------------------------------------------------------- match clock */

function kickoff() {
  const game = store.game;
  const fixture = fixtureFor(game, game.clubId, game.round + 1);
  if (!fixture) return;
  const result = simulateFixture(game, fixture, `round-${game.round}`);
  store.match = { result, clock: 0, speed: 1, finished: false, goalCount: 0 };
  store.view = 'match';
  startClock();
  render();
}

function startClock() {
  clearInterval(store.timer);
  store.timer = setInterval(() => {
    const match = store.match;
    if (!match || match.finished) return;
    match.clock = Math.min(90, match.clock + 0.9 * match.speed);
    const goals = match.result.events.filter((e) => e.type === 'goal' && e.minute <= match.clock).length;
    if (goals > match.goalCount) {
      match.goalCount = goals;
      flash();
    }
    if (match.clock >= 90) {
      clearInterval(store.timer);
      match.clock = 90;
      finalizeMatch();
      render();
      return;
    }
    tickRender();
  }, TICK_MS);
}

function finalizeMatch() {
  const match = store.match;
  if (!match || match.finished) return;
  clearInterval(store.timer);
  store.timer = null;
  let next = applyResult(store.game, match.result);
  const matchday = next.fixtures.find((f) => f.round === next.round + 1);
  if (matchday) {
    for (const fixture of matchday.fixtures) {
      if (fixture.home === match.result.home && fixture.away === match.result.away) continue;
      next = applyResult(next, simulateFixture(next, fixture, `round-${next.round}`));
    }
  }
  next = { ...next, round: Math.min(totalRounds(next), next.round + 1) };
  store.game = next;
  match.finished = true;
  match.clock = 90;
  save();
}

function skipToFullTime() {
  const match = store.match;
  if (!match || match.finished) return;
  match.clock = 90;
  match.goalCount = match.result.events.filter((e) => e.type === 'goal').length;
  finalizeMatch();
  flash();
  render();
}

function leaveMatch() {
  clearInterval(store.timer);
  store.match = null;
  render();
}

/* ----------------------------------------------------------- landing bind  */

function bindLanding() {
  const cards = root.querySelectorAll('[data-club]');
  cards.forEach((card) => {
    card.addEventListener('mouseenter', () => {
      const id = card.dataset.club;
      if (store.hoverClub === id) return;
      store.hoverClub = id;
      const right = root.querySelector('.landing__right');
      if (right) right.innerHTML = renderDossier(store, store.pickedClub || id);
    });
  });
  const input = root.querySelector('[data-manager-input]');
  if (input) {
    input.addEventListener('input', () => {
      store.managerName = input.value;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      root.querySelector('[data-action="start"]')?.click();
    });
  }
}

/* --------------------------------------------------------------- delegation */

document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }

  const closeSheet = event.target.closest('[data-close-sheet]');
  if (closeSheet) {
    store.drawerPlayerId = null;
    render();
    return;
  }

  const clubCard = event.target.closest('[data-club]');
  if (clubCard) {
    store.pickedClub = clubCard.dataset.club;
    store.hoverClub = store.pickedClub;
    render();
    root.querySelector('[data-action="start"]')?.focus();
    return;
  }

  const playerRow = event.target.closest('[data-player]');
  if (playerRow && store.view === 'squad') {
    store.drawerPlayerId = playerRow.dataset.player;
    render();
    return;
  }

  const sort = event.target.closest('[data-sort]');
  if (sort) {
    const key = sort.dataset.sort;
    store.sort = { key, dir: store.sort.key === key ? -store.sort.dir : key === 'name' ? 1 : -1 };
    render();
    return;
  }

  const filter = event.target.closest('[data-filter]');
  if (filter) {
    store.filter = filter.dataset.filter;
    render();
    return;
  }

  const formation = event.target.closest('[data-formation]');
  if (formation) {
    const id = formation.dataset.formation;
    if (!FORMATIONS[id]) return;
    const lineup = autoPick(squadOf(store.game, store.game.clubId), id);
    store.game = { ...store.game, formation: id, lineup };
    store.selectedSlot = null;
    save();
    toast(`Shape set to ${id} — XI auto-picked`);
    render();
    return;
  }

  const mentality = event.target.closest('[data-mentality]');
  if (mentality) {
    store.game = { ...store.game, mentality: mentality.dataset.mentality };
    save();
    render();
    return;
  }

  const bench = event.target.closest('[data-bench]');
  if (bench) {
    pickForSlot(bench.dataset.bench);
    return;
  }

  const speed = event.target.closest('[data-speed]');
  if (speed) {
    if (store.match) store.match.speed = Number(speed.dataset.speed);
    render();
    return;
  }

  const action = event.target.closest('[data-action]');
  if (action) {
    handleAction(action.dataset.action);
  }
});

document.addEventListener('keydown', (event) => {
  if (handleTourKey(event)) {
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && store.drawerPlayerId) {
    store.drawerPlayerId = null;
    render();
  }
});

function handleAction(name) {
  switch (name) {
    case 'start': {
      if (!store.pickedClub) {
        toast('Choose a club to manage');
        return;
      }
      const input = root.querySelector('[data-manager-input]');
      const manager = (input?.value || store.managerName || '').trim() || 'The Gaffer';
      newCareer(store.pickedClub, manager);
      toast(`You're in charge at ${CLUB_BY_ID[store.pickedClub].name}`);
      if (!tourSeen()) setTimeout(() => startTour(store, tourActions, 0), 420);
      break;
    }
    case 'continue-career':
      if (store.loadedSave) {
        store.game = store.loadedSave;
        store.loadedSave = null;
        store.view = 'squad';
        render();
        if (!tourSeen()) setTimeout(() => startTour(store, tourActions, 0), 420);
      }
      break;
    case 'forget-career':
      clearSave();
      store.loadedSave = null;
      store.pickedClub = null;
      render();
      toast('Career deleted');
      break;
    case 'new-career':
      if (!window.confirm('Abandon this career and pick a new club? Your save will be deleted.')) return;
      if (tourRunning()) endTour(false);
      clearInterval(store.timer);
      clearSave();
      store.game = null;
      store.loadedSave = null;
      store.match = null;
      store.pickedClub = null;
      store.view = 'squad';
      render();
      break;
    case 'start-tour':
      startTour(store, tourActions, 0);
      break;
    case 'autopick': {
      const lineup = autoPick(squadOf(store.game, store.game.clubId), store.game.formation);
      store.game = { ...store.game, lineup };
      store.selectedSlot = null;
      save();
      toast('Best available XI picked');
      render();
      break;
    }
    case 'clear-selection':
      store.selectedSlot = null;
      render();
      break;
    case 'kickoff':
      kickoff();
      break;
    case 'skip':
      skipToFullTime();
      break;
    case 'leave-match':
      leaveMatch();
      break;
    case 'finish-match':
      store.match = null;
      store.view = 'table';
      render();
      break;
    case 'next-season':
      startNextSeason();
      toast(`Season ${store.game.season} under way`);
      break;
    default:
      break;
  }
}

/* ------------------------------------------------------------------- boot  */

subscribe(render);

if (!store.loadedSave) store.loadedSave = null;

const saved = load();
store.loadedSave = saved;
store.pickedClub = saved?.clubId || null;
render();
