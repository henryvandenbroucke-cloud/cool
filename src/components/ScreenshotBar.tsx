import { useState } from 'react';
import { Aperture, Eye, Loader2 } from 'lucide-react';
import { useUI } from '../stores/uiStore';
import { requestScreenshot } from '../rendering/Screenshot';
import { cx } from './ui/primitives';

/** Minimal floating controls shown while the interface is hidden. */
export function ScreenshotBar() {
  const setHideUI = useUI((s) => s.setHideUI);
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(2);

  const capture = async () => {
    setBusy(true);
    const url = await requestScreenshot(scale);
    setBusy(false);
    if (!url) {
      useUI.getState().pushToast({ title: 'Screenshot failed', body: 'The GPU could not render at that resolution.', tone: 'warning' });
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `godmode-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className={cx('pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 transition-opacity duration-300', busy ? 'opacity-0' : 'opacity-40 hover:opacity-100')} data-testid="screenshot-bar">
      <div className="glass flex items-center gap-2 rounded-2xl p-1.5">
        <div className="flex rounded-xl bg-black/30 p-1">
          {[1, 2, 4].map((s) => (
            <button key={s} type="button" onClick={() => setScale(s)} className={cx('rounded-lg px-2.5 py-1 text-[11.5px] font-medium', scale === s ? 'bg-white/10 text-ink' : 'text-mute hover:text-ink')}>
              {s}×
            </button>
          ))}
        </div>
        <button type="button" data-testid="capture" onClick={() => void capture()} className="flex items-center gap-2 rounded-xl bg-cyan/90 px-3.5 py-2 text-[12.5px] font-semibold text-[#03101a] shadow-[0_0_24px_-6px_rgb(65_217_255/0.9)] hover:brightness-110">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Aperture size={15} />} Capture PNG
        </button>
        <button type="button" onClick={() => setHideUI(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] text-mute hover:bg-white/5 hover:text-ink">
          <Eye size={15} /> Show UI <span className="font-mono text-[10px] text-faint">H</span>
        </button>
      </div>
    </div>
  );
}
