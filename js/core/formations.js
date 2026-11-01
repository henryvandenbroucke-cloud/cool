/**
 * Formations and player roles.
 *
 * Slot coordinates are percentages on the tactics board: x runs left → right
 * (0 = left touchline), y runs top → bottom (0 = opponent goal line,
 * 100 = your own goal line). Both teams attack towards the top of the pitch,
 * which matches the reversed "your half at the bottom" convention used by most
 * tactics creators.
 */
import { groupOf } from '../data/league.js';

const slot = (id, label, role, x, y, positions) => ({ id, label, role, x, y, positions });

export const FORMATIONS = {
  '4-3-3': {
    id: '4-3-3',
    name: '4-3-3',
    blurb: 'Width from the wingers, a holding midfielder screening the back four.',
    slots: [
      slot('gk', 'GK', 'GK', 50, 92, ['GK']),
      slot('lb', 'LB', 'DEF', 14, 74, ['LB', 'LWB']),
      slot('cb1', 'CB', 'DEF', 36, 80, ['CB']),
      slot('cb2', 'CB', 'DEF', 64, 80, ['CB']),
      slot('rb', 'RB', 'DEF', 86, 74, ['RB', 'RWB']),
      slot('dm', 'DM', 'MID', 50, 62, ['DM', 'CM']),
      slot('cm1', 'CM', 'MID', 30, 48, ['CM', 'DM']),
      slot('cm2', 'CM', 'MID', 70, 48, ['CM', 'AM']),
      slot('lw', 'LW', 'ATT', 16, 22, ['LW', 'LM']),
      slot('st', 'ST', 'ATT', 50, 14, ['ST']),
      slot('rw', 'RW', 'ATT', 84, 22, ['RW', 'RM']),
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    name: '4-2-3-1',
    blurb: 'A double pivot protects the back line while a free 10 pulls the strings.',
    slots: [
      slot('gk', 'GK', 'GK', 50, 92, ['GK']),
      slot('lb', 'LB', 'DEF', 14, 76, ['LB', 'LWB']),
      slot('cb1', 'CB', 'DEF', 36, 82, ['CB']),
      slot('cb2', 'CB', 'DEF', 64, 82, ['CB']),
      slot('rb', 'RB', 'DEF', 86, 76, ['RB', 'RWB']),
      slot('dm1', 'DM', 'MID', 36, 62, ['DM', 'CM']),
      slot('dm2', 'DM', 'MID', 64, 62, ['DM', 'CM']),
      slot('lw', 'LW', 'ATT', 16, 36, ['LW', 'LM']),
      slot('am', 'AM', 'MID', 50, 36, ['AM', 'CM']),
      slot('rw', 'RW', 'ATT', 84, 36, ['RW', 'RM']),
      slot('st', 'ST', 'ATT', 50, 14, ['ST']),
    ],
  },
  '4-4-2': {
    id: '4-4-2',
    name: '4-4-2',
    blurb: 'Two banks of four and a strike partnership. Simple, sturdy, direct.',
    slots: [
      slot('gk', 'GK', 'GK', 50, 92, ['GK']),
      slot('lb', 'LB', 'DEF', 14, 74, ['LB', 'LWB']),
      slot('cb1', 'CB', 'DEF', 36, 80, ['CB']),
      slot('cb2', 'CB', 'DEF', 64, 80, ['CB']),
      slot('rb', 'RB', 'DEF', 86, 74, ['RB', 'RWB']),
      slot('lm', 'LM', 'MID', 14, 50, ['LM', 'LW']),
      slot('cm1', 'CM', 'MID', 38, 52, ['CM', 'DM']),
      slot('cm2', 'CM', 'MID', 62, 52, ['CM', 'AM']),
      slot('rm', 'RM', 'MID', 86, 50, ['RM', 'RW']),
      slot('st1', 'ST', 'ATT', 38, 18, ['ST']),
      slot('st2', 'ST', 'ATT', 62, 18, ['ST']),
    ],
  },
  '3-4-2-1': {
    id: '3-4-2-1',
    name: '3-4-2-1',
    blurb: 'A back three, flying wing-backs and two inside forwards behind the nine.',
    slots: [
      slot('gk', 'GK', 'GK', 50, 92, ['GK']),
      slot('cb1', 'CB', 'DEF', 26, 80, ['CB']),
      slot('cb2', 'CB', 'DEF', 50, 83, ['CB']),
      slot('cb3', 'CB', 'DEF', 74, 80, ['CB']),
      slot('lwb', 'LWB', 'DEF', 11, 55, ['LWB', 'LB', 'LM']),
      slot('cm1', 'CM', 'MID', 38, 58, ['CM', 'DM']),
      slot('cm2', 'CM', 'MID', 62, 58, ['CM', 'DM']),
      slot('rwb', 'RWB', 'DEF', 89, 55, ['RWB', 'RB', 'RM']),
      slot('lf', 'AM', 'MID', 32, 30, ['AM', 'LW', 'ST']),
      slot('rf', 'AM', 'MID', 68, 30, ['AM', 'RW', 'ST']),
      slot('st', 'ST', 'ATT', 50, 12, ['ST']),
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    name: '5-3-2',
    blurb: 'Low block, five at the back, two forwards waiting to break.',
    slots: [
      slot('gk', 'GK', 'GK', 50, 92, ['GK']),
      slot('lwb', 'LWB', 'DEF', 11, 62, ['LWB', 'LB']),
      slot('cb1', 'CB', 'DEF', 28, 82, ['CB']),
      slot('cb2', 'CB', 'DEF', 50, 85, ['CB']),
      slot('cb3', 'CB', 'DEF', 72, 82, ['CB']),
      slot('rwb', 'RWB', 'DEF', 89, 62, ['RWB', 'RB']),
      slot('cm1', 'CM', 'MID', 28, 54, ['CM', 'DM']),
      slot('cm2', 'CM', 'MID', 50, 58, ['CM', 'DM']),
      slot('cm3', 'CM', 'MID', 72, 54, ['CM', 'DM']),
      slot('st1', 'ST', 'ATT', 38, 18, ['ST']),
      slot('st2', 'ST', 'ATT', 62, 18, ['ST']),
    ],
  },
};

export const FORMATION_LIST = Object.values(FORMATIONS);

export const DEFAULT_FORMATION = '4-3-3';

/**
 * How comfortable a player is in a slot: 1 = natural, 0.9 = capable,
 * 0.78 = out of position, 0.62 = badly out of position.
 */
export function slotFitness(player, slotDef) {
  if (player.pos === slotDef.positions[0]) return 1;
  if (slotDef.positions.includes(player.pos)) return 0.9;
  if (groupOf(player.pos) === slotDef.role) return 0.78;
  if (slotDef.role === 'GK' || groupOf(player.pos) === 'GK') return 0.4;
  return 0.62;
}

export const fitnessLabel = (fit) => (fit >= 1 ? 'Natural' : fit >= 0.9 ? 'Capable' : fit >= 0.78 ? 'Out of position' : 'Bad fit');

/** Effective strength a player brings to a slot. */
export function slotStrength(player, slotDef) {
  return player.ovr * slotFitness(player, slotDef);
}

/** Greedy auto-pick: best available player per slot, defence first. */
export function autoPick(squad, formationId) {
  const formation = FORMATIONS[formationId] || FORMATIONS[DEFAULT_FORMATION];
  const used = new Set();
  const picks = {};
  const order = formation.slots
    .slice()
    .sort((a, b) => rankWeight(b) - rankWeight(a));
  for (const slotDef of order) {
    let best = null;
    let bestScore = -1;
    for (const player of squad) {
      if (used.has(player.id)) continue;
      const score = slotStrength(player, slotDef) - (player.fitness || 0) * 0.18;
      if (score > bestScore) {
        bestScore = score;
        best = player;
      }
    }
    if (best) {
      used.add(best.id);
      picks[slotDef.id] = best.id;
    }
  }
  return picks;
}

const rankWeight = (s) => (s.role === 'GK' ? 100 : s.role === 'DEF' ? 50 : 10);
