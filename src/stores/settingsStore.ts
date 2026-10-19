import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GraphicsQuality } from '../rendering/quality';

export type TrailLength = 'short' | 'medium' | 'long';

export interface SettingsState {
  quality: GraphicsQuality;
  reducedEffects: boolean;
  showTrails: boolean;
  trailLength: TrailLength;
  showLabels: boolean;
  showPrediction: boolean;
  showGravityGrid: boolean;
  showOrbitPlane: boolean;
  cameraShake: boolean;
  audioMuted: boolean;
  volume: number;
  barycentric: boolean;
  set: <K extends keyof Omit<SettingsState, 'set'>>(key: K, value: SettingsState[K]) => void;
}

function defaultQuality(): GraphicsQuality {
  if (typeof navigator === 'undefined') return 'high';
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency ?? 4;
  if (mobile) return 'low';
  if (cores <= 4) return 'medium';
  return 'high';
}

const memoryStorage = (() => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
})();

export function safeStorage(): Storage | typeof memoryStorage {
  try {
    const k = '__godmode_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return memoryStorage;
  }
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: defaultQuality(),
      reducedEffects: false,
      showTrails: true,
      trailLength: 'medium',
      showLabels: true,
      showPrediction: true,
      showGravityGrid: false,
      showOrbitPlane: true,
      cameraShake: true,
      audioMuted: false,
      volume: 0.55,
      barycentric: false,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: 'godmode.settings.v1',
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => {
        const { set: _set, ...rest } = s;
        void _set;
        return rest;
      },
    },
  ),
);
