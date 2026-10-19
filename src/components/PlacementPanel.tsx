import { AlertTriangle, MousePointerClick, Move } from 'lucide-react';
import { useUI, type VelocityMode } from '../stores/uiStore';
import { getCatalogEntry, TOOL_GROUPS } from '../celestial/catalog';
import { Orb } from './Orb';
import { Kbd, NumberField, Segmented, Slider, cx } from './ui/primitives';
import { audio } from '../effects/audio';
import { formatNumber, sci } from '../utils/format';
import { EARTH_MASS_SUN } from '../simulation/constants';

const MODES: { value: VelocityMode; label: string; title: string }[] = [
  { value: 'circular', label: 'Orbit', title: 'Automatic circular orbit around the dominant body' },
  { value: 'manual', label: 'Drag', title: 'Click-drag to throw it; no drag = co-moving with the dominant body' },
  { value: 'stationary', label: 'Still', title: 'Zero velocity — it will fall' },
  { value: 'custom', label: 'Custom', title: 'Exact speed and direction' },
];

export function PlacementPanel() {
  const group = useUI((s) => s.toolGroup);
  const type = useUI((s) => s.placementType);
  const setType = useUI((s) => s.setPlacementType);
  const mode = useUI((s) => s.velocityMode);
  const setMode = useUI((s) => s.setVelocityMode);
  const custom = useUI((s) => s.customVelocity);
  const setCustom = useUI((s) => s.setCustomVelocity);
  const height = useUI((s) => s.planeHeight);
  const setHeight = useUI((s) => s.setPlaneHeight);
  const info = useUI((s) => s.placementInfo);
  const types = TOOL_GROUPS[group] ?? [];
  const entry = getCatalogEntry(type);
  const massLabel = entry.mass >= 0.01 ? `${formatNumber(entry.mass)} M☉` : `${sci(entry.mass / EARTH_MASS_SUN, 3)} M⊕`;

  return (
    <div className="pointer-events-auto absolute left-[76px] top-1/2 w-[300px] -translate-y-1/2 anim-slide-right" data-testid="placement-panel">
      <div className="glass rounded-2xl p-4">
        <div className="label-caps mb-2.5">Create</div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, types.length))}, minmax(0, 1fr))` }}>
          {types.map((t) => {
            const e = getCatalogEntry(t);
            return (
              <button
                key={t}
                type="button"
                title={e.description}
                data-testid={`type-${t}`}
                onClick={() => {
                  audio.click(1.1);
                  setType(t);
                }}
                className={cx(
                  'flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-all duration-200',
                  type === t ? 'bg-cyan/[0.12] ring-1 ring-cyan/40' : 'hover:bg-white/[0.05]',
                )}
              >
                <Orb type={t} size={28} />
                <span className={cx('w-full truncate text-center text-[10.5px] leading-tight', type === t ? 'text-ink' : 'text-mute')}>{e.label.replace('-like', '')}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 rounded-xl bg-black/25 px-3 py-2.5 ring-1 ring-white/[0.05]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-ink">{entry.label}</span>
            <span className="num text-[11px] text-mute">{massLabel}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-mute">{entry.description}</p>
        </div>

        <div className="label-caps mb-2 mt-4">Initial velocity</div>
        <Segmented value={mode} options={MODES} onChange={setMode} size="sm" testId="velocity-mode" />
        {mode === 'custom' && (
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10.5px] text-mute">Speed</span>
              <NumberField value={custom.speedKms} unit="km/s" min={0} max={300000} onCommit={(v) => setCustom({ speedKms: v })} testId="custom-speed" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10.5px] text-mute">Heading</span>
              <NumberField value={custom.heading} unit="°" min={-360} max={360} onCommit={(v) => setCustom({ heading: v })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10.5px] text-mute">Pitch</span>
              <NumberField value={custom.pitch} unit="°" min={-90} max={90} onCommit={(v) => setCustom({ pitch: v })} />
            </label>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="label-caps">Plane height</span>
          <span className="num text-[11px] text-mute">{height >= 0 ? '+' : ''}{height.toFixed(2)} AU</span>
        </div>
        <Slider value={height} min={-3} max={3} step={0.01} onChange={setHeight} label="Placement plane height" />

        <div className="mt-3 min-h-[62px] rounded-xl bg-black/25 px-3 py-2.5 text-[11.5px] ring-1 ring-white/[0.05]" data-testid="placement-info">
          {info ? (
            <>
              <div className="flex justify-between text-mute">
                <span>{info.parentName ? <>Around <span className="text-ink">{info.parentName}</span></> : 'Free space'}</span>
                {info.parentName && <span className="num">{formatNumber(info.distanceAu)} AU</span>}
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-mute">Launch speed</span>
                <span className={cx('num', info.escapeKms > 0 && info.speedKms > info.escapeKms ? 'text-ember' : 'text-cyan')}>{formatNumber(info.speedKms)} km/s</span>
              </div>
              {info.parentName && (
                <div className="mt-0.5 flex justify-between text-[10.5px] text-faint">
                  <span>circular {formatNumber(info.circularKms)} · escape {formatNumber(info.escapeKms)} km/s</span>
                </div>
              )}
              {info.impact && (
                <div className="mt-1.5 flex items-center gap-1.5 text-ember">
                  <AlertTriangle size={12} /> Impact predicted with {info.impact}
                </div>
              )}
            </>
          ) : (
            <span className="text-mute">Move over the plane to aim…</span>
          )}
        </div>
        <div className="mt-3 space-y-1.5 text-[11px] text-mute">
          <div className="flex items-center gap-2"><MousePointerClick size={13} className="text-cyan" /> Click to place {mode === 'circular' ? 'in orbit' : ''}</div>
          <div className="flex items-center gap-2"><Move size={13} className="text-cyan" /> Drag to set launch velocity</div>
          <div className="flex items-center gap-2"><Kbd>Alt</Kbd>+ drag to orbit · <Kbd>Esc</Kbd> done</div>
        </div>
      </div>
    </div>
  );
}
