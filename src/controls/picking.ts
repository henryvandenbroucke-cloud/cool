import { overlay } from '../rendering/overlay';

/** Screen-space picking against the projected bodies (robust for bodies only a pixel wide). */
export function pickBody(x: number, y: number): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const e of overlay.entries.values()) {
    if (!e.visible) continue;
    const reach = Math.max(e.r + 5, 13);
    const d = Math.hypot(e.x - x, e.y - y);
    if (d > reach) continue;
    // Prefer the body whose disc we're most inside; break ties toward the camera.
    const score = d / reach + e.depth * 1e-9;
    if (score < bestScore) {
      bestScore = score;
      best = e.id;
    }
  }
  return best;
}
