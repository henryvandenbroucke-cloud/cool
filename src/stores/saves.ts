import { parseWorld, type WorldFile } from '../simulation/serialization';
import { safeStorage } from './settingsStore';

const KEY = 'godmode.saves.v1';
const MAX_SLOTS = 24;

export interface SaveSlot {
  id: string;
  name: string;
  savedAt: string;
  bodyCount: number;
  presetId: string | null;
  simTime: number;
  data: WorldFile;
}

function readAll(): SaveSlot[] {
  try {
    const raw = safeStorage().getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    // Validate every slot: corrupted or tampered entries are skipped, not trusted.
    const out: SaveSlot[] = [];
    for (const s of list) {
      if (!s || typeof s !== 'object') continue;
      const parsed = parseWorld((s as { data: unknown }).data);
      if (!parsed.ok) continue;
      const slot = s as SaveSlot;
      out.push({ id: String(slot.id), name: parsed.world.name, savedAt: parsed.world.savedAt, bodyCount: parsed.world.bodies.length, presetId: parsed.world.presetId, simTime: parsed.world.simTime, data: parsed.world });
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(list: SaveSlot[]): { ok: true } | { ok: false; error: string } {
  try {
    safeStorage().setItem(KEY, JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, error: quota ? 'Browser storage is full — delete an older save or export to a file.' : 'Could not write to browser storage.' };
  }
}

export const saves = {
  list(): SaveSlot[] {
    return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  save(world: WorldFile): { ok: true; slot: SaveSlot } | { ok: false; error: string } {
    const list = readAll();
    const slot: SaveSlot = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: world.name,
      savedAt: world.savedAt,
      bodyCount: world.bodies.length,
      presetId: world.presetId,
      simTime: world.simTime,
      data: world,
    };
    const next = [slot, ...list].slice(0, MAX_SLOTS);
    const res = writeAll(next);
    return res.ok ? { ok: true, slot } : res;
  },
  remove(id: string): void {
    writeAll(readAll().filter((s) => s.id !== id));
  },
  get(id: string): SaveSlot | undefined {
    return readAll().find((s) => s.id === id);
  },
};

export function downloadJSON(world: WorldFile): void {
  const blob = new Blob([JSON.stringify(world, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${world.name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'universe'}.godmode.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
