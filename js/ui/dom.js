/** Small DOM helpers shared by the views. */

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** W/D/L pills for a club's last five results. */
export function formDots(form = []) {
  const slots = Array.from({ length: 5 }, (_, i) => form[i] || null);
  return `<div class="form-dots">${slots
    .map((r) => `<span class="dot ${r ? `dot--${r}` : ''}">${r || '·'}</span>`)
    .join('')}</div>`;
}

/** Season mood, derived from points won so far. */
export function momentum(game) {
  const { w, d, l } = game.table[game.clubId];
  const played = w + d + l;
  if (!played) return { label: 'No matches played', tone: 'neutral', value: 50 };
  const value = Math.round(((w * 3 + d) / (played * 3)) * 100);
  const label = value >= 70 ? 'Flying' : value >= 50 ? 'Steady' : value >= 35 ? 'Shaky' : 'In trouble';
  const tone = value >= 55 ? 'good' : value >= 38 ? 'neutral' : 'bad';
  return { label, tone, value };
}
