import { create } from 'zustand';

export type Tool = 'select' | 'place';
export type ToolGroup = 'planet' | 'star' | 'moon' | 'blackHole' | 'asteroid' | 'custom';
export type VelocityMode = 'circular' | 'manual' | 'stationary' | 'custom';
export type Dialog = null | 'settings' | 'save' | 'load' | 'help' | 'presets';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'impact' | 'success' | 'warning';
}

export interface CustomVelocity {
  /** Speed in km/s relative to the dominant body. */
  speedKms: number;
  /** Heading in degrees relative to the prograde circular direction (+ = outward). */
  heading: number;
  /** Inclination in degrees out of the placement plane. */
  pitch: number;
}

interface UIState {
  tool: Tool;
  toolGroup: ToolGroup;
  placementType: string;
  velocityMode: VelocityMode;
  customVelocity: CustomVelocity;
  /** Placement plane offset above the camera target (AU). */
  planeHeight: number;
  dialog: Dialog;
  introDone: boolean;
  hideUI: boolean;
  cinematic: boolean;
  confirmDelete: string | null;
  toasts: Toast[];
  hintsDismissed: boolean;
  /** Live placement read-out shown in the placement panel. */
  placementInfo: null | { parentName: string | null; speedKms: number; circularKms: number; escapeKms: number; impact: string | null; distanceAu: number };
  setTool: (tool: Tool) => void;
  startPlacement: (group: ToolGroup, type?: string) => void;
  setPlacementType: (type: string) => void;
  setVelocityMode: (m: VelocityMode) => void;
  setCustomVelocity: (v: Partial<CustomVelocity>) => void;
  setPlaneHeight: (h: number) => void;
  openDialog: (d: Dialog) => void;
  setIntroDone: (v: boolean) => void;
  setHideUI: (v: boolean) => void;
  setCinematic: (v: boolean) => void;
  setConfirmDelete: (id: string | null) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
  dismissHints: () => void;
  setPlacementInfo: (info: UIState['placementInfo']) => void;
}

const DEFAULT_TYPE: Record<ToolGroup, string> = {
  planet: 'earth',
  star: 'yellowStar',
  moon: 'moon',
  blackHole: 'blackHole',
  asteroid: 'asteroid',
  custom: 'custom',
};

let toastId = 1;

export const useUI = create<UIState>()((set, get) => ({
  tool: 'select',
  toolGroup: 'planet',
  placementType: 'earth',
  velocityMode: 'circular',
  customVelocity: { speedKms: 30, heading: 0, pitch: 0 },
  planeHeight: 0,
  dialog: null,
  introDone: false,
  hideUI: false,
  cinematic: false,
  confirmDelete: null,
  toasts: [],
  hintsDismissed: false,
  placementInfo: null,
  setTool: (tool) => set({ tool, placementInfo: tool === 'select' ? null : get().placementInfo }),
  startPlacement: (group, type) =>
    set((s) => ({
      tool: 'place',
      toolGroup: group,
      placementType: type ?? (s.toolGroup === group && s.tool === 'place' ? s.placementType : DEFAULT_TYPE[group]),
      cinematic: false,
      velocityMode: group === 'star' || group === 'blackHole' ? (s.velocityMode === 'circular' ? 'circular' : s.velocityMode) : s.velocityMode,
    })),
  setPlacementType: (placementType) => set({ placementType }),
  setVelocityMode: (velocityMode) => set({ velocityMode }),
  setCustomVelocity: (v) => set((s) => ({ customVelocity: { ...s.customVelocity, ...v } })),
  setPlaneHeight: (planeHeight) => set({ planeHeight }),
  openDialog: (dialog) => set({ dialog }),
  setIntroDone: (introDone) => set({ introDone }),
  setHideUI: (hideUI) => set({ hideUI }),
  setCinematic: (cinematic) => set({ cinematic }),
  setConfirmDelete: (confirmDelete) => set({ confirmDelete }),
  pushToast: (t) => {
    const id = toastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
    window.setTimeout(() => get().dismissToast(id), t.tone === 'impact' ? 4200 : 3200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  dismissHints: () => set({ hintsDismissed: true }),
  setPlacementInfo: (placementInfo) => set({ placementInfo }),
}));
