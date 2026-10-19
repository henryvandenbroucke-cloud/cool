/**
 * Bridge between the WebGL scene and the DOM overlay (labels, selection
 * rings). The scene projects every body once per frame into `entries`; the
 * overlay subscribes and moves its elements imperatively — no React renders.
 */
export interface OverlayEntry {
  id: string;
  x: number;
  y: number;
  /** Projected body radius in CSS pixels. */
  r: number;
  /** Distance to camera (scene units). */
  depth: number;
  visible: boolean;
}

type Listener = (entries: ReadonlyMap<string, OverlayEntry>) => void;

const entries = new Map<string, OverlayEntry>();
const listeners = new Set<Listener>();

export const overlay = {
  entries,
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  publish(): void {
    for (const fn of listeners) fn(entries);
  },
};
