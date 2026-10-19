import { create } from 'zustand';
import { SimulationEngine, type BodyPatch } from '../simulation/engine';
import type { BodyData, WorldSettings } from '../simulation/types';
import { getPreset, type CameraSpec } from '../presets';
import { cloneBodyData } from '../simulation/body';
import { createWorldFile, type WorldFile } from '../simulation/serialization';
import { dominantBody } from '../simulation/orbits';
import { useSettings } from './settingsStore';
import { useUI } from './uiStore';

/** The one simulation instance. Lives outside React so the render loop never re-renders components. */
export const engine = new SimulationEngine();

interface HistoryEntry {
  label: string;
  undo: () => boolean;
  redo: () => boolean;
}

interface Snapshot {
  bodies: BodyData[];
  settings: WorldSettings;
  time: number;
}

export interface WorldState {
  presetId: string | null;
  worldName: string;
  /** Increments whenever a new world is loaded (resets trails, VFX, camera). */
  epoch: number;
  structureVersion: number;
  propertyVersion: number;
  paused: boolean;
  timeScale: number;
  simTime: number;
  speedLimited: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  followId: string | null;
  camera: CameraSpec;
  galaxy: boolean;
  disclosure: string;
  canUndo: boolean;
  canRedo: boolean;
  /** Bumps when the user asks the camera to return to the world's default view. */
  cameraResetToken: number;
  /** Request to focus the camera on a body (id + counter so repeated requests fire). */
  focusRequest: { id: string; token: number } | null;
  frameAllToken: number;

  loadPreset: (id: string) => void;
  loadWorldFile: (file: WorldFile) => void;
  resetSimulation: () => void;
  exportWorld: (name?: string) => WorldFile;
  addBody: (data: Omit<BodyData, 'id'>, label?: string) => string | null;
  removeBody: (id: string) => void;
  duplicateBody: (id: string) => string | null;
  updateBody: (id: string, patch: BodyPatch) => void;
  recordEdit: (id: string, before: BodyPatch, after: BodyPatch, label: string) => void;
  shatterBody: (id: string) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  follow: (id: string | null) => void;
  focus: (id: string) => void;
  resetCamera: () => void;
  frameAll: () => void;
  setPaused: (p: boolean) => void;
  togglePause: () => void;
  setTimeScale: (t: number) => void;
  setWorldSettings: (s: Partial<WorldSettings>) => void;
  undo: () => void;
  redo: () => void;
  syncFromEngine: () => void;
}

const past: HistoryEntry[] = [];
const future: HistoryEntry[] = [];
let initial: Snapshot | null = null;
let focusToken = 1;

function takeSnapshot(): Snapshot {
  return { bodies: engine.snapshot(), settings: { ...engine.settings, sizeScale: { ...engine.settings.sizeScale } }, time: engine.time };
}

function toast(title: string, body?: string, tone: 'info' | 'success' | 'warning' | 'impact' = 'info') {
  useUI.getState().pushToast({ title, body, tone });
}

export const useWorld = create<WorldState>()((set, get) => {
  const push = (entry: HistoryEntry) => {
    past.push(entry);
    if (past.length > 100) past.shift();
    future.length = 0;
    set({ canUndo: true, canRedo: false });
  };

  const applyLoad = (bodies: BodyData[], settings: Partial<WorldSettings>, time: number, meta: Partial<WorldState>) => {
    engine.load(bodies, settings, time);
    if (useSettings.getState().barycentric) engine.toBarycentricFrame();
    engine.drainEvents();
    initial = takeSnapshot();
    past.length = 0;
    future.length = 0;
    set((s) => ({
      ...meta,
      epoch: s.epoch + 1,
      structureVersion: engine.structureVersion,
      propertyVersion: engine.propertyVersion,
      timeScale: engine.settings.timeScale,
      simTime: engine.time,
      speedLimited: false,
      selectedId: null,
      hoveredId: null,
      followId: null,
      canUndo: false,
      canRedo: false,
      cameraResetToken: s.cameraResetToken + 1,
    }));
  };

  return {
    presetId: null,
    worldName: 'Universe',
    epoch: 0,
    structureVersion: 0,
    propertyVersion: 0,
    paused: false,
    timeScale: engine.settings.timeScale,
    simTime: 0,
    speedLimited: false,
    selectedId: null,
    hoveredId: null,
    followId: null,
    camera: { target: null, distance: 4, elevation: 25, azimuth: 0 },
    galaxy: false,
    disclosure: '',
    canUndo: false,
    canRedo: false,
    cameraResetToken: 0,
    focusRequest: null,
    frameAllToken: 0,

    loadPreset: (id) => {
      const preset = getPreset(id);
      const world = preset.build();
      applyLoad(world.bodies, world.settings, 0, {
        presetId: preset.id,
        worldName: preset.name,
        camera: world.camera,
        galaxy: Boolean(world.galaxy),
        disclosure: preset.disclosure,
        paused: false,
      });
    },

    loadWorldFile: (file) => {
      const preset = file.presetId ? getPreset(file.presetId) : null;
      const target = file.bodies.find((b) => b.kind === 'star' || b.kind === 'blackHole')?.id ?? file.bodies[0]?.id ?? null;
      applyLoad(file.bodies, file.settings, file.simTime, {
        presetId: file.presetId,
        worldName: file.name,
        camera: preset && file.presetId === preset.id ? preset.build().camera : { target, distance: 4, elevation: 25, azimuth: 20 },
        galaxy: file.presetId === 'galaxy',
        disclosure: preset?.disclosure ?? '',
        paused: false,
      });
    },

    resetSimulation: () => {
      if (!initial) return;
      const snap = initial;
      const s = get();
      applyLoad(snap.bodies.map(cloneBodyData), snap.settings, snap.time, {
        presetId: s.presetId,
        worldName: s.worldName,
        camera: s.camera,
        galaxy: s.galaxy,
        disclosure: s.disclosure,
      });
      toast('Simulation reset', s.worldName);
    },

    exportWorld: (name) => createWorldFile(name ?? get().worldName, engine.snapshot(), { ...engine.settings, timeScale: get().timeScale }, engine.time, get().presetId),

    addBody: (data, label) => {
      try {
        const b = engine.addBody(data);
        const snapshot = b.toData();
        push({
          label: label ?? `Create ${snapshot.name}`,
          undo: () => engine.removeBody(snapshot.id),
          redo: () => {
            if (engine.getBody(snapshot.id)) return false;
            engine.addBody(cloneBodyData(snapshot));
            return true;
          },
        });
        get().syncFromEngine();
        return b.id;
      } catch (e) {
        toast('Cannot add body', e instanceof Error ? e.message : String(e), 'warning');
        return null;
      }
    },

    removeBody: (id) => {
      const b = engine.getBody(id);
      if (!b) return;
      const snapshot = b.toData();
      engine.removeBody(id);
      push({
        label: `Delete ${snapshot.name}`,
        undo: () => {
          if (engine.getBody(snapshot.id)) return false;
          engine.addBody(cloneBodyData(snapshot));
          return true;
        },
        redo: () => engine.removeBody(snapshot.id),
      });
      const s = get();
      set({
        selectedId: s.selectedId === id ? null : s.selectedId,
        followId: s.followId === id ? null : s.followId,
        hoveredId: s.hoveredId === id ? null : s.hoveredId,
      });
      get().syncFromEngine();
    },

    duplicateBody: (id) => {
      const b = engine.getBody(id);
      if (!b) return null;
      const data = b.toData();
      const parent = dominantBody(engine.bodies, b.x, b.y, b.z, b.mass, b);
      const copy: Omit<BodyData, 'id'> = { ...cloneBodyData(data), name: `${data.name} II` };
      if (parent) {
        // Same orbit, half a revolution away.
        copy.position = { x: 2 * parent.x - b.x, y: 2 * parent.y - b.y, z: 2 * parent.z - b.z };
        copy.velocity = { x: 2 * parent.vx - b.vx, y: 2 * parent.vy - b.vy, z: 2 * parent.vz - b.vz };
      } else {
        const off = engine.effectiveRadius(b) * 8 + 0.05;
        copy.position = { x: b.x + off, y: b.y, z: b.z };
      }
      copy.appearance = { ...copy.appearance, seed: (copy.appearance.seed * 7919 + 13) % 2147483647 };
      const newId = get().addBody(copy, `Duplicate ${data.name}`);
      if (newId) {
        get().select(newId);
        toast('Duplicated', `${copy.name} placed ${parent ? `on the opposite side of ${parent.name}` : 'nearby'}`, 'success');
      }
      return newId;
    },

    updateBody: (id, patch) => {
      engine.updateBody(id, patch);
      set({ propertyVersion: engine.propertyVersion });
    },

    recordEdit: (id, before, after, label) => {
      push({
        label,
        undo: () => Boolean(engine.updateBody(id, before)),
        redo: () => Boolean(engine.updateBody(id, after)),
      });
    },

    shatterBody: (id) => {
      const before = takeSnapshot();
      const b = engine.getBody(id);
      if (!b || b.kind === 'blackHole') return;
      const name = b.name;
      const ids = engine.shatter(id, useSettings.getState().quality === 'low' ? 10 : 16);
      if (ids.length === 0) {
        toast('Cannot shatter', 'The body limit has been reached.', 'warning');
        return;
      }
      const after = takeSnapshot();
      push({
        label: `Shatter ${name}`,
        undo: () => {
          engine.load(before.bodies.map(cloneBodyData), before.settings, before.time);
          return true;
        },
        redo: () => {
          engine.load(after.bodies.map(cloneBodyData), after.settings, after.time);
          return true;
        },
      });
      set({ selectedId: null, followId: get().followId === id ? null : get().followId });
      get().syncFromEngine();
    },

    select: (id) => set({ selectedId: id }),
    hover: (id) => {
      if (get().hoveredId !== id) set({ hoveredId: id });
    },
    follow: (id) => set({ followId: id }),
    focus: (id) => set({ focusRequest: { id, token: focusToken++ }, followId: id, selectedId: id }),
    resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1, followId: null })),
    frameAll: () => set((s) => ({ frameAllToken: s.frameAllToken + 1, followId: null })),

    setPaused: (paused) => set({ paused }),
    togglePause: () => set((s) => ({ paused: !s.paused })),
    setTimeScale: (timeScale) => {
      engine.settings.timeScale = timeScale;
      set({ timeScale });
    },
    setWorldSettings: (s) => {
      engine.setSettings(s);
      set({ propertyVersion: engine.propertyVersion, structureVersion: engine.structureVersion });
    },

    undo: () => {
      const e = past.pop();
      if (!e) return;
      const ok = e.undo();
      future.push(e);
      set({ canUndo: past.length > 0, canRedo: true });
      get().syncFromEngine();
      toast(ok ? `Undo: ${e.label}` : `Nothing to undo for “${e.label}”`, ok ? undefined : 'The body has changed since (merged, absorbed or deleted).', ok ? 'info' : 'warning');
    },

    redo: () => {
      const e = future.pop();
      if (!e) return;
      const ok = e.redo();
      past.push(e);
      set({ canUndo: true, canRedo: future.length > 0 });
      get().syncFromEngine();
      toast(ok ? `Redo: ${e.label}` : `Could not redo “${e.label}”`, undefined, ok ? 'info' : 'warning');
    },

    syncFromEngine: () => {
      const s = get();
      const patch: Partial<WorldState> = {};
      if (s.structureVersion !== engine.structureVersion) patch.structureVersion = engine.structureVersion;
      if (s.propertyVersion !== engine.propertyVersion) patch.propertyVersion = engine.propertyVersion;
      if (s.selectedId && !engine.getBody(s.selectedId)) patch.selectedId = null;
      if (s.followId && !engine.getBody(s.followId)) patch.followId = null;
      if (s.hoveredId && !engine.getBody(s.hoveredId)) patch.hoveredId = null;
      if (Object.keys(patch).length) set(patch);
    },
  };
});

if (typeof window !== 'undefined') {
  // Exposed for automated browser tests and power users poking around in the console.
  (window as unknown as { __GODMODE__: unknown }).__GODMODE__ = { engine, world: useWorld, ui: useUI, settings: useSettings };
}
