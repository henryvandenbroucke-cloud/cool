import { ChevronsLeft, ChevronsRight, Pause, Play, RotateCcw, Gauge, Undo2, Redo2 } from 'lucide-react';
import { useWorld } from '../stores/worldStore';
import { IconButton, cx } from './ui/primitives';
import { formatRate, formatSimTime } from '../utils/format';
import { audio } from '../effects/audio';
import { getPreset } from '../presets';

const MIN_LOG = Math.log10(1 / 8766); // 1 hour per second
const MAX_LOG = 2; // 100 years per second

export function TimeBar() {
  const paused = useWorld((s) => s.paused);
  const timeScale = useWorld((s) => s.timeScale);
  const simTime = useWorld((s) => s.simTime);
  const limited = useWorld((s) => s.speedLimited);
  const presetId = useWorld((s) => s.presetId);
  const canUndo = useWorld((s) => s.canUndo);
  const canRedo = useWorld((s) => s.canRedo);
  const { togglePause, setTimeScale, resetSimulation, undo, redo } = useWorld.getState();
  const normal = (presetId ? getPreset(presetId).build().settings.timeScale : undefined) ?? 0.08;
  const logValue = Math.log10(Math.max(timeScale, 1e-6));
  const fill = `${((logValue - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100}%`;
  const ratio = timeScale / normal;
  const mode = ratio < 0.6 ? 'Slow motion' : ratio > 1.6 ? 'Fast forward' : 'Normal';

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 anim-rise" data-testid="timebar">
      <div className="glass flex items-center gap-1.5 rounded-2xl px-2 py-1.5">
        <IconButton icon={Undo2} label="Undo" shortcut="Ctrl Z" disabled={!canUndo} onClick={undo} size="sm" tooltipSide="top" testId="undo" />
        <IconButton icon={Redo2} label="Redo" shortcut="Ctrl ⇧ Z" disabled={!canRedo} onClick={redo} size="sm" tooltipSide="top" testId="redo" />
        <div className="mx-1 h-6 w-px bg-white/10" />
        <IconButton icon={RotateCcw} label="Reset simulation" onClick={resetSimulation} size="sm" tooltipSide="top" testId="reset-sim" />
        <IconButton icon={ChevronsLeft} label="Slower (½×)" shortcut="−" onClick={() => setTimeScale(Math.max(10 ** MIN_LOG, timeScale / 2))} size="sm" tooltipSide="top" testId="slower" />
        <button
          type="button"
          aria-label={paused ? 'Resume' : 'Pause'}
          data-testid="play-pause"
          onClick={() => {
            audio.start();
            audio.click(paused ? 1.2 : 0.8);
            togglePause();
          }}
          className={cx(
            'grid h-10 w-10 place-items-center rounded-full transition-all duration-200',
            paused ? 'bg-cyan text-[#03101a] shadow-[0_0_24px_-4px_rgb(65_217_255/0.9)] hover:brightness-110' : 'bg-white/[0.09] text-ink ring-1 ring-white/15 hover:bg-white/[0.14]',
          )}
        >
          {paused ? <Play size={17} fill="currentColor" strokeWidth={1.5} className="ml-0.5" /> : <Pause size={17} fill="currentColor" strokeWidth={1.5} />}
        </button>
        <IconButton icon={ChevronsRight} label="Faster (2×)" shortcut="+" onClick={() => setTimeScale(Math.min(10 ** MAX_LOG, timeScale * 2))} size="sm" tooltipSide="top" testId="faster" />

        <div className="ml-2 flex w-[210px] flex-col justify-center">
          <input
            type="range"
            className="gm-range w-full"
            aria-label="Simulation speed"
            data-testid="speed-slider"
            min={MIN_LOG}
            max={MAX_LOG}
            step={0.01}
            value={logValue}
            style={{ ['--fill' as string]: fill }}
            onChange={(e) => setTimeScale(10 ** Number(e.target.value))}
          />
          <div className="-mt-0.5 flex items-center justify-between text-[10.5px]">
            <button type="button" className="text-mute transition-colors hover:text-cyan" onClick={() => setTimeScale(normal / 4)}>
              slow
            </button>
            <button type="button" className="text-mute transition-colors hover:text-cyan" onClick={() => setTimeScale(normal)} data-testid="speed-normal">
              normal
            </button>
            <button type="button" className="text-mute transition-colors hover:text-cyan" onClick={() => setTimeScale(normal * 8)}>
              fast
            </button>
          </div>
        </div>

        <div className="mx-2 h-8 w-px bg-white/10" />
        <div className="min-w-[132px] pr-2">
          <div className="flex items-center gap-1.5">
            <span className={cx('num text-[12.5px] font-medium', paused ? 'text-mute' : 'text-ink')} data-testid="time-rate">
              {paused ? 'Paused' : formatRate(timeScale)}
            </span>
            {limited && !paused && (
              <span className="group relative flex items-center text-ember" data-testid="speed-limited">
                <Gauge size={13} />
                <span className="pointer-events-none absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-white/10 bg-[#0b1020]/95 px-2.5 py-1.5 text-[11px] leading-snug text-ink opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
                  Speed capped: the physics budget per frame is full, so the simulation runs slower than requested instead of taking unstable steps.
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px] text-mute">
            <span className="num" data-testid="sim-time">
              T+ {formatSimTime(simTime)}
            </span>
            <span className="text-faint">·</span>
            <span>{mode}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
