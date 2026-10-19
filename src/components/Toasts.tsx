import { CheckCircle2, Info, TriangleAlert, Zap } from 'lucide-react';
import { useUI } from '../stores/uiStore';
import { cx } from './ui/primitives';

const ICON = { info: Info, success: CheckCircle2, warning: TriangleAlert, impact: Zap };
const TONE = {
  info: 'text-cyan',
  success: 'text-[#5ef0b0]',
  warning: 'text-gold',
  impact: 'text-ember',
};

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none absolute left-1/2 top-4 z-40 flex w-[360px] -translate-x-1/2 flex-col items-center gap-2" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="glass pointer-events-auto flex w-full items-start gap-3 rounded-xl px-3.5 py-2.5 text-left anim-rise"
          >
            <Icon size={16} className={cx('mt-0.5 shrink-0', TONE[t.tone])} />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium text-ink">{t.title}</span>
              {t.body && <span className="mt-0.5 block text-[11.5px] leading-snug text-mute">{t.body}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
