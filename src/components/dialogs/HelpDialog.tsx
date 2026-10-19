import { useUI } from '../../stores/uiStore';
import { Dialog, Kbd } from '../ui/primitives';

const CONTROLS: [string, string][] = [
  ['Left drag', 'Orbit camera'],
  ['Mouse wheel', 'Zoom'],
  ['Right drag', 'Pan (stops following)'],
  ['Click', 'Select a body'],
  ['Double-click', 'Fly to and follow a body'],
  ['F', 'Focus selected body'],
  ['R', 'Reset camera view'],
  ['Space', 'Pause / resume'],
  ['+ / −', 'Faster / slower time'],
  ['Esc', 'Deselect or leave a tool'],
  ['Delete', 'Delete selected (with confirmation)'],
  ['Ctrl Z / Ctrl ⇧ Z', 'Undo / redo'],
  ['1 – 7', 'Select tool / creation tools'],
  ['T  L  G', 'Trails, labels, gravity grid'],
  ['C', 'Cinematic camera'],
  ['H', 'Hide interface (screenshot mode)'],
  ['[ / ]', 'Lower / raise placement plane'],
  ['Alt + drag', 'Orbit camera while placing'],
];

export function HelpDialog() {
  const open = useUI((s) => s.dialog === 'help');
  if (!open) return null;
  const close = () => useUI.getState().openDialog(null);
  return (
    <Dialog title="Controls & science" subtitle="How to drive the universe — and what is (and isn’t) simulated." onClose={close} width="max-w-2xl" testId="help-dialog">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="label-caps mb-2">Controls</div>
          <ul className="space-y-1.5">
            {CONTROLS.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-mute">{v}</span>
                <span className="flex shrink-0 gap-1">
                  {k.split('  ').map((p) => (
                    <Kbd key={p}>{p}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4 text-[12.5px] leading-relaxed text-mute">
          <div>
            <div className="label-caps mb-1.5">Physics</div>
            <p>
              A real <span className="text-ink">Newtonian N-body</span> simulation: every body pulls on every other. Units are AU, solar masses and years (G = 4π²).
              Integration uses a fixed-timestep <span className="text-ink">leapfrog (kick-drift-kick)</span> scheme with adaptive, bounded substeps for close
              encounters, so results don’t depend on frame rate. At extreme speeds the simulation slows down rather than taking unstable steps.
            </p>
          </div>
          <div>
            <div className="label-caps mb-1.5">Simplifications</div>
            <ul className="list-disc space-y-1 pl-4">
              <li>Planet sizes are exaggerated by default (×30) so worlds are visible; collisions use those enlarged radii.</li>
              <li>Collisions use simplified merge / fragment rules that conserve mass and momentum — no material deformation.</li>
              <li>Black holes are Newtonian point masses with stylised visuals: the absorption radius, disk, photon ring and lensing are artistic approximations, not general relativity.</li>
              <li>Lighting falls off more gently than 1/d² so distant worlds stay visible.</li>
              <li>The galaxy’s 100k stars are decorative; only named bodies are simulated.</li>
              <li>“Shatter” is a creative effect, not a model of a real planetary explosion.</li>
            </ul>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
