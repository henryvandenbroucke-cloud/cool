import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

type Request = { scale: number; resolve: (url: string | null) => void; wait: number; prevDpr: number };

let pending: Request | null = null;

/** Renders the next frames at `scale`× pixel ratio and resolves with a PNG data URL. */
export function requestScreenshot(scale = 2): Promise<string | null> {
  return new Promise((resolve) => {
    if (pending) pending.resolve(null);
    pending = { scale, resolve, wait: 3, prevDpr: 0 };
  });
}

export function ScreenshotHelper() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const dpr = useThree((s) => s.viewport.dpr);
  const active = useRef<Request | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (pending && !active.current) {
        active.current = pending;
        pending = null;
        active.current.prevDpr = dpr;
        // Cap the capture at ~8K wide to stay within GPU limits.
        const maxDpr = 7680 / Math.max(1, gl.domElement.clientWidth);
        setDpr(Math.min(dpr * active.current.scale, maxDpr));
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [dpr, gl, setDpr]);

  // Runs after the composer has rendered (priority 1), while the drawing buffer is still valid.
  useFrame(() => {
    const req = active.current;
    if (!req) return;
    if (req.wait-- > 0) return;
    let url: string | null = null;
    try {
      url = gl.domElement.toDataURL('image/png');
    } catch {
      url = null;
    }
    active.current = null;
    setDpr(req.prevDpr);
    req.resolve(url);
  }, 2);

  return null;
}
