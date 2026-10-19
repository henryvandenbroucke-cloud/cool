import { useEffect, useState } from 'react';
import { X, MousePointer2, ZoomIn, Hand, Focus, Space, Globe2 } from 'lucide-react';
import { useUI } from '../stores/uiStore';
import { Kbd } from './ui/primitives';
import { safeStorage } from '../stores/settingsStore';

const KEY = 'godmode.hints.v1';

/** First-run onboarding card explaining the core controls. */
export function Hints() {
  const introDone = useUI((s) => s.introDone);
  const dismissed = useUI((s) => s.hintsDismissed);
  const dismiss = useUI((s) => s.dismissHints);
  const [seen] = useState(() => {
    try {
      return safeStorage().getItem(KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!introDone || seen || dismissed) return;
    const t = window.setTimeout(() => {
      dismiss();
      try {
        safeStorage().setItem(KEY, '1');
      } catch {
        /* storage unavailable */
      }
    }, 22000);
    return () => window.clearTimeout(t);
  }, [introDone, seen, dismissed, dismiss]);

  if (!introDone || seen || dismissed) return null;
  const close = () => {
    dismiss();
    try {
      safeStorage().setItem(KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };
  const rows: [typeof MousePointer2, React.ReactNode, string][] = [
    [MousePointer2, <Kbd key="a">Drag</Kbd>, 'Orbit the camera'],
    [ZoomIn, <Kbd key="b">Scroll</Kbd>, 'Zoom'],
    [Hand, <Kbd key="c">Right-drag</Kbd>, 'Pan'],
    [Focus, <Kbd key="d">Double-click</Kbd>, 'Fly to a body'],
    [Space, <Kbd key="e">Space</Kbd>, 'Pause / resume'],
    [Globe2, <Kbd key="f">2–7</Kbd>, 'Create planets, stars, black holes…'],
  ];
  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 w-[268px] anim-rise" data-testid="hints" style={{ animationDelay: '0.4s' }}>
      <div className="glass rounded-2xl p-4" data-ui-panel>
        <div className="mb-2 flex items-center justify-between">
          <span className="label-caps">Getting started</span>
          <button type="button" aria-label="Dismiss hints" onClick={close} className="rounded-md p-1 text-mute transition-colors hover:bg-white/10 hover:text-ink">
            <X size={14} />
          </button>
        </div>
        <ul className="space-y-1.5">
          {rows.map(([Icon, key, text], i) => (
            <li key={i} className="flex items-center gap-2.5 text-[12px] text-mute">
              <Icon size={13} className="shrink-0 text-cyan" />
              <span className="w-[86px] shrink-0">{key}</span>
              <span className="text-ink/85">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
