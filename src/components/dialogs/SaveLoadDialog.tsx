import { useRef, useState } from 'react';
import { FileDown, FileUp, Trash2, Save, Play } from 'lucide-react';
import { useUI } from '../../stores/uiStore';
import { useWorld } from '../../stores/worldStore';
import { saves, downloadJSON, type SaveSlot } from '../../stores/saves';
import { parseWorld } from '../../simulation/serialization';
import { Button, Dialog, Segmented } from '../ui/primitives';
import { formatSimTime } from '../../utils/format';

export function SaveLoadDialog() {
  const dialog = useUI((s) => s.dialog);
  const open = dialog === 'save' || dialog === 'load';
  if (!open) return null;
  return <SaveLoadInner initial={dialog === 'load' ? 'load' : 'save'} />;
}

function SaveLoadInner({ initial }: { initial: 'save' | 'load' }) {
  const [tab, setTab] = useState<'save' | 'load'>(initial);
  const worldName = useWorld((s) => s.worldName);
  const [name, setName] = useState(worldName);
  const [slots, setSlots] = useState<SaveSlot[]>(() => saves.list());
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const close = () => useUI.getState().openDialog(null);
  const toast = useUI.getState().pushToast;

  const saveNow = () => {
    const world = useWorld.getState().exportWorld(name.trim() || 'Untitled universe');
    const res = saves.save(world);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSlots(saves.list());
    setError(null);
    toast({ title: 'Universe saved', body: `${world.name} · ${world.bodies.length} bodies`, tone: 'success' });
  };

  const load = (slot: SaveSlot) => {
    useWorld.getState().loadWorldFile(slot.data);
    toast({ title: 'Universe loaded', body: slot.name, tone: 'success' });
    close();
  };

  const importFile = async (file: File) => {
    if (file.size > 5_000_000) {
      setError('File is too large (max 5 MB).');
      return;
    }
    const text = await file.text();
    const res = parseWorld(text);
    if (!res.ok) {
      setError(`Import failed: ${res.error}`);
      return;
    }
    useWorld.getState().loadWorldFile(res.world);
    toast({ title: 'Universe imported', body: `${res.world.name} · ${res.world.bodies.length} bodies`, tone: 'success' });
    close();
  };

  return (
    <Dialog title={tab === 'save' ? 'Save universe' : 'Load universe'} subtitle="Saved in this browser. Export JSON to keep or share a file." onClose={close} testId="saveload-dialog">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'save', label: 'Save' },
          { value: 'load', label: 'Load' },
        ]}
      />
      {error && <div className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[12px] text-[#ff9aa4] ring-1 ring-danger/30" data-testid="save-error">{error}</div>}
      {tab === 'save' ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="label-caps">Name</span>
            <input
              className="mt-1.5 w-full rounded-xl bg-black/30 px-3 py-2 text-[13px] text-ink outline-none ring-1 ring-white/10 focus:ring-cyan/40"
              value={name}
              maxLength={60}
              data-testid="save-name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') saveNow();
              }}
            />
          </label>
          <div className="flex gap-2">
            <Button tone="primary" icon={Save} onClick={saveNow} testId="save-confirm">
              Save to browser
            </Button>
            <Button icon={FileDown} onClick={() => downloadJSON(useWorld.getState().exportWorld(name.trim() || 'Untitled universe'))} testId="export-json">
              Export JSON
            </Button>
          </div>
          <p className="text-[11.5px] text-mute">Saves include every body’s mass, radius, position, velocity and appearance, plus time, speed and collision settings.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Button icon={FileUp} onClick={() => fileRef.current?.click()} testId="import-json">
              Import JSON…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="import-file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {slots.length === 0 ? (
            <p className="rounded-xl bg-black/20 px-4 py-6 text-center text-[12.5px] text-mute ring-1 ring-white/[0.05]">No saved universes yet.</p>
          ) : (
            <ul className="space-y-1.5" data-testid="save-slots">
              {slots.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.06]">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{s.name}</div>
                    <div className="text-[11px] text-mute">
                      {new Date(s.savedAt).toLocaleString()} · {s.bodyCount} bodies · T+{formatSimTime(s.simTime)}
                    </div>
                  </div>
                  <Button tone="default" icon={Play} onClick={() => load(s)} testId="load-slot">
                    Load
                  </Button>
                  <button
                    type="button"
                    aria-label={`Delete save ${s.name}`}
                    onClick={() => {
                      saves.remove(s.id);
                      setSlots(saves.list());
                    }}
                    className="rounded-lg p-2 text-mute transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}
