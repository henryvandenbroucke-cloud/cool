import { ArrowRight } from 'lucide-react';
import { PRESETS } from '../../presets';
import { useUI } from '../../stores/uiStore';
import { useWorld } from '../../stores/worldStore';
import { Dialog, cx } from '../ui/primitives';
import { audio } from '../../effects/audio';

const ART: Record<string, string> = {
  solar: 'radial-gradient(circle at 30% 50%, #fff6d8 0 6%, #ffd27a 9%, #ff9a3c22 22%, transparent 34%), radial-gradient(circle at 62% 46%, #4f9bff 0 2.4%, transparent 3%), radial-gradient(circle at 78% 58%, #d6b088 0 4%, transparent 4.6%), radial-gradient(ellipse at 30% 50%, transparent 30%, #ffffff10 31%, transparent 32%, transparent 46%, #ffffff10 47%, transparent 48%)',
  blackhole: 'radial-gradient(circle at 50% 50%, #000 0 12%, #ffe1b5 13.5%, #ff9a3c 17%, #a03a0a 24%, transparent 32%), radial-gradient(ellipse 52% 9% at 50% 52%, #ffb066 0%, #ff7a2a66 45%, transparent 70%)',
  binary: 'radial-gradient(circle at 40% 50%, #fff4d6 0 6%, #ffd27a66 10%, transparent 20%), radial-gradient(circle at 60% 50%, #ffe0bd 0 4.5%, #ff9a5a55 9%, transparent 17%), radial-gradient(circle at 82% 40%, #d8ad74 0 2.6%, transparent 3.2%)',
  collision: 'radial-gradient(circle at 44% 52%, #3b6fd6 0 15%, transparent 15.5%), radial-gradient(circle at 60% 46%, #fff3d0 0 3%, #ffb347 7%, #ff5a1a88 14%, transparent 26%), radial-gradient(circle at 66% 42%, #2b1d18 0 7%, transparent 7.5%)',
  empty: 'radial-gradient(ellipse at 70% 40%, #9065ff26 0%, transparent 45%), radial-gradient(ellipse at 25% 70%, #41d9ff1f 0%, transparent 40%)',
  galaxy: 'radial-gradient(ellipse 38% 22% at 50% 50%, #ffe7c2 0%, #ffb46b55 18%, #9065ff33 45%, transparent 70%), conic-gradient(from 20deg at 50% 50%, transparent, #6aa8ff22, transparent 30%, #9065ff22, transparent 60%)',
};

export function PresetsDialog() {
  const open = useUI((s) => s.dialog === 'presets');
  const close = () => useUI.getState().openDialog(null);
  const current = useWorld((s) => s.presetId);
  if (!open) return null;
  return (
    <Dialog title="Universes" subtitle="Each preset is a fully simulated starting point. Switching resets time, trails and effects." onClose={close} width="max-w-3xl" testId="presets-dialog">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid={`preset-${p.id}`}
            onClick={() => {
              audio.start();
              audio.click(1.2);
              useWorld.getState().loadPreset(p.id);
              useUI.getState().setTool('select');
              close();
            }}
            className={cx(
              'group relative overflow-hidden rounded-2xl p-4 text-left ring-1 transition-all duration-300 hover:-translate-y-0.5',
              current === p.id ? 'ring-cyan/50' : 'ring-white/[0.08] hover:ring-white/20',
            )}
            style={{ background: `${ART[p.id] ?? ''}, linear-gradient(160deg, #0f1730, #070b17)` }}
          >
            <div className="h-16" />
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold text-ink">{p.name}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: p.accent }}>
                  {p.tagline}
                </div>
                <p className="mt-1.5 text-[11.5px] leading-snug text-mute">{p.description}</p>
              </div>
              <ArrowRight size={16} className="mb-1 shrink-0 text-mute transition-all group-hover:translate-x-1 group-hover:text-cyan" />
            </div>
            {current === p.id && <span className="absolute right-3 top-3 rounded-full bg-cyan/15 px-2 py-0.5 text-[10px] font-medium tracking-wider text-cyan ring-1 ring-cyan/30">CURRENT</span>}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
