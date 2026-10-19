import { useUI } from '../../stores/uiStore';
import { useSettings, type TrailLength } from '../../stores/settingsStore';
import { engine, useWorld } from '../../stores/worldStore';
import { Dialog, Segmented, Slider, Toggle } from '../ui/primitives';
import type { GraphicsQuality } from '../../rendering/quality';
import type { CollisionMode } from '../../simulation/types';
import { audio } from '../../effects/audio';

export function SettingsDialog() {
  const open = useUI((s) => s.dialog === 'settings');
  const s = useSettings();
  useWorld((w) => w.propertyVersion);
  const close = () => useUI.getState().openDialog(null);
  if (!open) return null;
  const mode = engine.settings.collisionMode;
  const scale = engine.settings.sizeScale.bodies;

  return (
    <Dialog title="Settings" subtitle="Graphics, simulation rules and audio." onClose={close} testId="settings-dialog">
      <div className="space-y-5">
        <section>
          <div className="label-caps mb-2">Graphics quality</div>
          <Segmented<GraphicsQuality>
            value={s.quality}
            onChange={(v) => s.set('quality', v)}
            testId="quality"
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'ultra', label: 'Ultra' },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-mute">Controls pixel ratio, bloom, texture resolution, particle counts and lensing.</p>
          <Toggle label="Reduced effects" description="No bloom, dust, lensing or camera shake; fewer particles." checked={s.reducedEffects} onChange={(v) => s.set('reducedEffects', v)} />
          <Toggle label="Camera shake on impacts" checked={s.cameraShake} onChange={(v) => s.set('cameraShake', v)} />
        </section>

        <section>
          <div className="label-caps mb-1">Visualisation</div>
          <Toggle label="Orbit trails" checked={s.showTrails} onChange={(v) => s.set('showTrails', v)} />
          {s.showTrails && (
            <div className="pb-2">
              <Segmented<TrailLength>
                value={s.trailLength}
                onChange={(v) => s.set('trailLength', v)}
                size="sm"
                options={[
                  { value: 'short', label: 'Short' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'long', label: 'Long' },
                ]}
              />
            </div>
          )}
          <Toggle label="Predicted path of selected body" description="Integrated forward from the live simulation state." checked={s.showPrediction} onChange={(v) => s.set('showPrediction', v)} />
          <Toggle label="Body labels" checked={s.showLabels} onChange={(v) => s.set('showLabels', v)} />
          <Toggle label="Gravity field grid" description="Visualises potential wells (√mass-scaled for readability)." checked={s.showGravityGrid} onChange={(v) => s.set('showGravityGrid', v)} />
        </section>

        <section>
          <div className="label-caps mb-2">Collisions</div>
          <Segmented<CollisionMode>
            value={mode}
            onChange={(v) => useWorld.getState().setWorldSettings({ collisionMode: v })}
            testId="collision-mode"
            options={[
              { value: 'fragment', label: 'Realistic', title: 'Merge gentle impacts, fragment energetic ones' },
              { value: 'merge', label: 'Always merge' },
              { value: 'off', label: 'Pass through' },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-mute">Simplified rules that conserve mass and momentum. Black holes always absorb what crosses their absorption radius.</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[13px] text-ink">Planet size exaggeration</span>
            <span className="num text-[12px] text-mute">×{scale}</span>
          </div>
          <Segmented<string>
            value={String(scale)}
            onChange={(v) => useWorld.getState().setWorldSettings({ sizeScale: { bodies: Number(v), stars: Number(v) === 1 ? 1 : 6 } })}
            size="sm"
            options={[
              { value: '1', label: '×1 true' },
              { value: '10', label: '×10' },
              { value: '30', label: '×30' },
              { value: '60', label: '×60' },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] leading-snug text-mute">Real planets are tiny next to their orbits. Exaggeration enlarges displayed <em>and</em> collision radii; large values can make moons touch their planets.</p>
        </section>

        <section>
          <div className="label-caps mb-1">Simulation frame</div>
          <Toggle
            label="Barycentric positioning"
            description="Recentre the world on its centre of mass (applies now and when worlds load)."
            checked={s.barycentric}
            onChange={(v) => {
              s.set('barycentric', v);
              if (v) engine.toBarycentricFrame();
            }}
          />
        </section>

        <section>
          <div className="label-caps mb-1">Audio</div>
          <Toggle
            label="Sound"
            description="Synthesised ambience and effects."
            checked={!s.audioMuted}
            onChange={(v) => {
              audio.start();
              s.set('audioMuted', !v);
            }}
          />
          <div className="flex items-center gap-3 pt-1">
            <span className="w-16 text-[12px] text-mute">Volume</span>
            <Slider value={s.volume} min={0} max={1} step={0.01} onChange={(v) => s.set('volume', v)} label="Volume" />
          </div>
        </section>
      </div>
    </Dialog>
  );
}
