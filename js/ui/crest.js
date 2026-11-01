/** Procedural club crests — a shield monogram in the club's colours. */
import { CLUB_BY_ID } from '../data/league.js';
import { escapeHtml } from './dom.js';

const STRIPES = new Set(['newcastle', 'everton', 'tottenham']);

export function crest(clubId, size = 34) {
  const club = CLUB_BY_ID[clubId];
  if (!club) return '';
  const { primary, secondary } = club.colors;
  const code = club.short;
  const striped = STRIPES.has(clubId);
  const ink = readableInk(primary);
  const id = `crest-${clubId}-${size}`;

  return `
    <svg class="crest" width="${size}" height="${size}" viewBox="0 0 48 52" role="img" aria-label="${escapeHtml(club.name)} crest">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${primary}" />
          <stop offset="1" stop-color="${shade(primary, -14)}" />
        </linearGradient>
        <clipPath id="clip-${id}"><path d="M24 1.5 45 8v18c0 12-9 19-21 24C12 45 3 38 3 26V8Z" /></clipPath>
      </defs>
      <path d="M24 1.5 45 8v18c0 12-9 19-21 24C12 45 3 38 3 26V8Z" fill="url(#${id})" />
      <g clip-path="url(#clip-${id})">
        ${striped
          ? `<rect x="3" y="0" width="8" height="52" fill="${secondary}" opacity=".9" />
             <rect x="19" y="0" width="8" height="52" fill="${secondary}" opacity=".9" />
             <rect x="35" y="0" width="8" height="52" fill="${secondary}" opacity=".9" />`
          : `<path d="M3 34c9-5 13 3 21-1s12 2 21-2v15c-9 5-13-2-21 1s-12 1-21 4Z" fill="${secondary}" opacity=".55" />`}
        <path d="M24 1.5 45 8v18c0 12-9 19-21 24C12 45 3 38 3 26V8Z" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1.4" />
      </g>
      <text x="24" y="30" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="14" font-weight="700" letter-spacing=".5" fill="${striped ? '#fff' : ink}" style="paint-order:stroke" stroke="rgba(0,0,0,.28)" stroke-width="1.6">${code}</text>
    </svg>`;
}

function readableInk(hex) {
  const { r, g, b } = hexToRgb(hex);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? '#0B0E11' : '#FFFFFF';
}

export function hexToRgb(hex) {
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

export function clubColorVars(clubId) {
  const club = CLUB_BY_ID[clubId];
  if (!club) return '';
  return `--club:${club.colors.primary};--club-2:${club.colors.secondary};`;
}
