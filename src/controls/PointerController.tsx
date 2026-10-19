import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { audio } from '../effects/audio';
import { pickBody } from './picking';

/**
 * Selection & hover for the select tool: click selects, click on empty space
 * deselects, double-click focuses. A small movement threshold keeps camera
 * drags from being treated as clicks.
 */
export function PointerController() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number; t: number; button: number } | null = null;
    let raf = 0;
    let lastMove: PointerEvent | null = null;

    const local = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      lastMove = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!lastMove || useUI.getState().tool !== 'select') return;
        const p = local(lastMove);
        const id = down ? null : pickBody(p.x, p.y);
        useWorld.getState().hover(id);
        el.style.cursor = id ? 'pointer' : '';
      });
    };
    const onDown = (e: PointerEvent) => {
      audio.start();
      const p = local(e);
      down = { x: p.x, y: p.y, t: performance.now(), button: e.button };
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || useUI.getState().tool !== 'select' || d.button !== 0) return;
      const p = local(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) > 5 || performance.now() - d.t > 450) return;
      const id = pickBody(p.x, p.y);
      const world = useWorld.getState();
      if (id) {
        if (world.selectedId !== id) audio.click(1.2);
        world.select(id);
      } else {
        world.select(null);
      }
    };
    const onDouble = (e: MouseEvent) => {
      if (useUI.getState().tool !== 'select') return;
      const p = local(e);
      const id = pickBody(p.x, p.y);
      if (id) {
        audio.click(0.8);
        useWorld.getState().focus(id);
      }
    };
    const onLeave = () => {
      useWorld.getState().hover(null);
      el.style.cursor = '';
    };
    const onContext = (e: Event) => e.preventDefault();

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('dblclick', onDouble);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('contextmenu', onContext);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('dblclick', onDouble);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('contextmenu', onContext);
    };
  }, [gl]);

  return null;
}
