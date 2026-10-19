import { useEffect, useMemo, useRef } from 'react';
import { engine, useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { useUI } from '../stores/uiStore';
import { overlay, type OverlayEntry } from '../rendering/overlay';
import { dominantBody } from '../simulation/orbits';
import type { SimBody } from '../simulation/body';

const PRIORITY: Record<string, number> = { blackHole: 6, star: 5, gasGiant: 4, rocky: 3, moon: 2, comet: 2, asteroid: 1 };

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/**
 * Body names, hover ring and the animated selection reticle, positioned every
 * frame from the scene's projection (imperatively, without React renders).
 * Labels declutter: higher-priority bodies win overlaps, moons hide until
 * they separate from their planet on screen.
 */
export function LabelsOverlay() {
  const structure = useWorld((s) => s.structureVersion);
  const props = useWorld((s) => s.propertyVersion);
  const epoch = useWorld((s) => s.epoch);
  const showLabels = useSettings((s) => s.showLabels);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const selRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const parentCache = useRef(new Map<string, { id: string | null; t: number }>());

  const bodies = useMemo(() => [...engine.bodies], [structure, props, epoch]);

  useEffect(() => {
    const placed: Rect[] = [];
    const update = (entries: ReadonlyMap<string, OverlayEntry>) => {
      const world = useWorld.getState();
      const placing = useUI.getState().tool === 'place';
      const now = performance.now();
      placed.length = 0;
      const sorted = [...engine.bodies].sort((a, b) => score(b, world) - score(a, world));
      for (const b of sorted) {
        const el = labelRefs.current.get(b.id);
        if (!el) continue;
        const e = entries.get(b.id);
        let show = Boolean(e?.visible) && showLabels && !placing;
        if (show && e) {
          const isSel = b.id === world.selectedId || b.id === world.hoveredId;
          if (b.kind === 'asteroid' && !isSel) show = false;
          if (show && (b.kind === 'moon' || b.kind === 'comet' || b.kind === 'asteroid') && !isSel) {
            let pc = parentCache.current.get(b.id);
            if (!pc || now - pc.t > 600) {
              pc = { id: dominantBody(engine.bodies, b.x, b.y, b.z, b.mass, b)?.id ?? null, t: now };
              parentCache.current.set(b.id, pc);
            }
            const pe = pc.id ? entries.get(pc.id) : undefined;
            if (pe && Math.hypot(pe.x - e.x, pe.y - e.y) < Math.max(34, pe.r + 26)) show = false;
          }
          if (show) {
            const w = el.offsetWidth || 60;
            const rect = { x: e.x + Math.max(e.r, 3) + 8, y: e.y - 9, w, h: 18 };
            if (!isSel && placed.some((p) => overlaps(p, rect))) show = false;
            else {
              placed.push(rect);
              el.style.transform = `translate3d(${rect.x}px, ${rect.y}px, 0)`;
            }
          }
        }
        el.style.opacity = show ? '1' : '0';
      }

      const sel = world.selectedId ? entries.get(world.selectedId) : undefined;
      if (selRef.current) {
        if (sel && sel.visible) {
          const d = Math.max(sel.r * 2 + 14, 26);
          selRef.current.style.opacity = '1';
          selRef.current.style.transform = `translate3d(${sel.x - d / 2}px, ${sel.y - d / 2}px, 0)`;
          selRef.current.style.width = `${d}px`;
          selRef.current.style.height = `${d}px`;
        } else selRef.current.style.opacity = '0';
      }
      const hov = world.hoveredId && world.hoveredId !== world.selectedId ? entries.get(world.hoveredId) : undefined;
      if (hoverRef.current) {
        if (hov && hov.visible) {
          const d = Math.max(hov.r * 2 + 10, 22);
          hoverRef.current.style.opacity = '1';
          hoverRef.current.style.transform = `translate3d(${hov.x - d / 2}px, ${hov.y - d / 2}px, 0)`;
          hoverRef.current.style.width = `${d}px`;
          hoverRef.current.style.height = `${d}px`;
        } else hoverRef.current.style.opacity = '0';
      }
    };
    return overlay.subscribe(update);
  }, [showLabels]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="labels-overlay">
      <div ref={hoverRef} className="absolute left-0 top-0 rounded-full border border-white/35 opacity-0 transition-opacity duration-150" />
      <div ref={selRef} className="absolute left-0 top-0 opacity-0 transition-opacity duration-200">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-cyan/90 shadow-[0_0_16px_rgb(65_217_255/0.55),inset_0_0_10px_rgb(65_217_255/0.25)]" />
        <div className="absolute -inset-[5px] rounded-full border border-dashed border-cyan/40" style={{ animation: 'gm-spin 9s linear infinite' }} />
      </div>
      {bodies.map((b) => (
        <div
          key={b.id}
          ref={(el) => {
            if (el) labelRefs.current.set(b.id, el);
            else labelRefs.current.delete(b.id);
          }}
          className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap opacity-0 transition-opacity duration-300"
        >
          <span className="h-px w-2.5 bg-white/30" />
          <span className={`text-[11px] font-medium tracking-[0.06em] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] ${b.kind === 'star' ? 'text-gold/90' : b.kind === 'blackHole' ? 'text-ember' : 'text-ink/80'}`}>{b.name}</span>
        </div>
      ))}
    </div>
  );
}

function score(b: SimBody, world: { selectedId: string | null; hoveredId: string | null }): number {
  if (b.id === world.selectedId) return 100;
  if (b.id === world.hoveredId) return 90;
  return (PRIORITY[b.kind] ?? 0) * 10 + Math.log10(b.mass + 1e-20) * 0.01;
}
