/**
 * Derived player attributes.
 *
 * The data file only stores name, position, overall and age — everything else
 * is generated deterministically from that, so squads stay compact and every
 * player looks like a plausible specialist (a centre-back defends, a winger
 * runs, a keeper dives).
 */
import { groupOf } from '../data/league.js';
import { hashSeed, mulberry32 } from './rng.js';

export const OUTFIELD_KEYS = ['pac', 'sho', 'pas', 'dri', 'def', 'phy'];
export const KEEPER_KEYS = ['div', 'han', 'kic', 'ref', 'spd', 'pos'];

export const ATTR_LABELS = {
  pac: 'Pace',
  sho: 'Shooting',
  pas: 'Passing',
  dri: 'Dribbling',
  def: 'Defending',
  phy: 'Physical',
  div: 'Diving',
  han: 'Handling',
  kic: 'Kicking',
  ref: 'Reflexes',
  spd: 'Speed',
  pos: 'Positioning',
};

/** Per-position offsets applied to the overall rating. */
const SHAPE = {
  GK: { div: 6, han: 5, kic: 0, ref: 7, spd: -3, pos: 4, sho: -48, pas: -10, dri: -30, def: -35, pac: -12, phy: 2 },
  CB: { def: 10, phy: 9, pac: -2, pas: -4, dri: -10, sho: -22 },
  LB: { def: 4, pac: 7, phy: 0, pas: 1, dri: 0, sho: -12 },
  RB: { def: 4, pac: 7, phy: 0, pas: 1, dri: 0, sho: -12 },
  LWB: { def: 2, pac: 8, phy: -1, pas: 2, dri: 2, sho: -11 },
  RWB: { def: 2, pac: 8, phy: -1, pas: 2, dri: 2, sho: -11 },
  DM: { def: 7, phy: 5, pas: 3, dri: -3, pac: -4, sho: -9 },
  CM: { pas: 5, phy: 2, def: 1, dri: 2, pac: -1, sho: -3 },
  AM: { pas: 5, dri: 7, sho: 3, def: -12, phy: -5, pac: 2 },
  LM: { pas: 3, dri: 5, pac: 4, def: -6, phy: -3, sho: 0 },
  RM: { pas: 3, dri: 5, pac: 4, def: -6, phy: -3, sho: 0 },
  LW: { pac: 7, dri: 8, sho: 2, pas: 1, def: -14, phy: -6 },
  RW: { pac: 7, dri: 8, sho: 2, pas: 1, def: -14, phy: -6 },
  ST: { sho: 12, pac: 4, dri: 3, phy: 4, def: -18, pas: -5 },
};

const keeperShape = (ovr) => ({
  div: ovr + 4,
  han: ovr + 3,
  kic: ovr - 2,
  ref: ovr + 5,
  spd: Math.round(ovr * 0.62),
  pos: ovr + 2,
});

export function attributesFor(player) {
  const group = groupOf(player.pos);
  const rand = mulberry32(hashSeed(`${player.name}|${player.pos}|${player.ovr}`));
  const jitter = () => Math.round(rand() * 9 - 4.5);

  if (group === 'GK') {
    const base = keeperShape(player.ovr);
    const out = {};
    for (const key of KEEPER_KEYS) {
      out[key] = clamp(Math.round(base[key] + jitter()), 24, 99);
    }
    // Keepers still need the outfield block for the engine's ball-playing term.
    out.pac = Math.round(player.ovr * 0.55);
    out.pas = clamp(player.ovr - 6 + jitter(), 30, 95);
    out.sho = 25;
    out.dri = Math.round(player.ovr * 0.45);
    out.def = 30;
    out.phy = clamp(player.ovr + 2, 30, 99);
    return out;
  }

  const shape = SHAPE[player.pos] || {};
  const out = {};
  for (const key of OUTFIELD_KEYS) {
    const offset = shape[key] || 0;
    const ageCurve = key === 'pac' && player.age > 31 ? -(player.age - 31) * 1.6 : 0;
    out[key] = clamp(Math.round(player.ovr + offset + ageCurve + jitter()), 22, 99);
  }
  return out;
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** The six attributes shown on a player card. */
export function displayAttributes(player) {
  const attrs = attributesFor(player);
  const group = groupOf(player.pos);
  const keys = group === 'GK' ? KEEPER_KEYS : OUTFIELD_KEYS;
  return keys.map((key) => ({ key, label: ATTR_LABELS[key], value: attrs[key] }));
}

/** 0–100 contribution used by the match engine for a given tactical slot. */
export function contribution(player, role) {
  const a = attributesFor(player);
  switch (role) {
    case 'GK':
      return Math.round(a.div * 0.34 + a.ref * 0.34 + a.han * 0.2 + a.pos * 0.12);
    case 'DEF':
      return Math.round(a.def * 0.46 + a.phy * 0.24 + a.pac * 0.2 + a.pas * 0.1);
    case 'MID':
      return Math.round(a.pas * 0.3 + a.def * 0.24 + a.dri * 0.2 + a.phy * 0.14 + a.sho * 0.12);
    case 'ATT':
      return Math.round(a.sho * 0.34 + a.dri * 0.26 + a.pac * 0.24 + a.pas * 0.1 + a.phy * 0.06);
    default:
      return player.ovr;
  }
}

/** Money-ish market value, purely for flavour in the squad list. */
export function marketValue(player) {
  const ageFactor =
    player.age <= 21 ? 1.45 : player.age <= 25 ? 1.25 : player.age <= 29 ? 1 : player.age <= 32 ? 0.62 : 0.34;
  const base = Math.pow(Math.max(player.ovr - 55, 4), 2.55) * 0.021;
  const value = base * ageFactor;
  if (value >= 100) return `£${(value / 100).toFixed(2)}bn`;
  return `£${Math.max(0.6, value).toFixed(value >= 10 ? 0 : 1)}m`;
}

/** Squad-number style identifier, stable per player. */
export function squadNumber(player) {
  const rand = mulberry32(hashSeed(`shirt|${player.name}`));
  return 1 + Math.floor(rand() * 39);
}
