/** Real club crests (local PNGs) with a monogram fallback. */
import { CLUB_BY_ID } from '../data/league.js';
import { escapeHtml } from './dom.js';

export function crest(clubId, size = 34, extraClass = '') {
  const club = CLUB_BY_ID[clubId];
  if (!club) return '';
  return `
    <span class="crest-wrap ${extraClass}" style="--size:${size}px;--club-fallback:${club.colors.primary}">
      <span class="crest-fallback" aria-hidden="true">${club.short}</span>
      <img class="crest" src="assets/crests/${clubId}.png" width="${size}" height="${size}"
           alt="${escapeHtml(club.name)} crest" loading="lazy" decoding="async" />
    </span>`;
}

/** Big hero crest used on the dossier and club cards. */
export const heroCrest = (clubId, size = 64) => crest(clubId, size, 'crest--hero');

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const shift = (v) => Math.max(0, Math.min(255, Math.round(v + (amount / 100) * 255)));
  return `#${[shift(r), shift(g), shift(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Inline CSS custom properties so each club re-themes the whole app. */
export function clubColorVars(clubId) {
  const club = CLUB_BY_ID[clubId];
  if (!club) return '';
  return `--club:${club.colors.primary};--club-2:${club.colors.secondary};`;
}
