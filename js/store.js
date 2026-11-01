/** Tiny state container: one game object, a view name, and UI prefs. */

import { createGame, SAVE_KEY, advanceSeason } from './engine/state.js';
import { advanceToUserFixture } from './engine/match.js';

export const store = {
  game: null,
  view: 'squad',
  filter: 'ALL',
  sort: { key: 'ovr', dir: -1 },
  selectedSlot: null,
  drawerPlayerId: null,
  pickedClub: null,
  hoverClub: null,
  managerName: '',
  match: null,
  timer: null,
  lastSave: null,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  for (const fn of listeners) fn(store);
}

export function navigate(view) {
  store.view = view;
  store.selectedSlot = null;
  store.drawerPlayerId = null;
  emit();
}

export function newCareer(clubId, managerName) {
  store.game = advanceToUserFixture(createGame(clubId, managerName || 'The Gaffer'));
  store.view = 'squad';
  store.match = null;
  store.selectedSlot = null;
  save();
  emit();
}

export function setGame(game) {
  store.game = game;
  save();
  emit();
}

export function startNextSeason() {
  store.game = advanceSeason(store.game);
  store.match = null;
  store.view = 'squad';
  save();
  emit();
}

export function save() {
  if (!store.game) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(store.game));
    store.lastSave = Date.now();
  } catch {
    /* storage full or blocked — the career still works in memory */
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const game = JSON.parse(raw);
    if (!game || !game.clubId || !game.squads) return null;
    return game;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
