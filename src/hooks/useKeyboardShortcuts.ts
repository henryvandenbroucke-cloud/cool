import { useEffect } from 'react';
import { useWorld } from '../stores/worldStore';
import { useUI, type ToolGroup } from '../stores/uiStore';
import { useSettings } from '../stores/settingsStore';
import { audio } from '../effects/audio';

const GROUP_KEYS: Record<string, ToolGroup> = { '2': 'planet', '3': 'star', '4': 'moon', '5': 'blackHole', '6': 'asteroid', '7': 'custom' };

function typingInField(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

export function useKeyboardShortcuts(onScreenshotMode: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typingInField(e)) return;
      const world = useWorld.getState();
      const ui = useUI.getState();
      const settings = useSettings.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key;

      if (mod && (key === 'z' || key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) world.redo();
        else world.undo();
        return;
      }
      if (mod && (key === 'y' || key === 'Y')) {
        e.preventDefault();
        world.redo();
        return;
      }
      if (mod && (key === 's' || key === 'S')) {
        e.preventDefault();
        ui.openDialog('save');
        return;
      }
      if (mod || e.altKey) return;
      if (ui.confirmDelete) return;

      switch (key) {
        case ' ':
          e.preventDefault();
          audio.start();
          world.togglePause();
          break;
        case 'Escape':
          if (ui.hideUI) ui.setHideUI(false);
          else if (ui.dialog) ui.openDialog(null);
          else if (ui.tool === 'place') ui.setTool('select');
          else if (ui.cinematic) ui.setCinematic(false);
          else if (world.selectedId) world.select(null);
          break;
        case 'f':
        case 'F':
          if (world.selectedId) world.focus(world.selectedId);
          break;
        case 'r':
        case 'R':
          world.resetCamera();
          break;
        case 'Delete':
        case 'Backspace':
          if (world.selectedId) {
            e.preventDefault();
            ui.setConfirmDelete(world.selectedId);
          }
          break;
        case '1':
          ui.setTool('select');
          break;
        case '+':
        case '=':
          world.setTimeScale(Math.min(100, world.timeScale * 2));
          break;
        case '-':
        case '_':
          world.setTimeScale(Math.max(1 / 8766, world.timeScale / 2));
          break;
        case 't':
        case 'T':
          settings.set('showTrails', !settings.showTrails);
          break;
        case 'l':
        case 'L':
          settings.set('showLabels', !settings.showLabels);
          break;
        case 'g':
        case 'G':
          settings.set('showGravityGrid', !settings.showGravityGrid);
          break;
        case 'c':
        case 'C':
          ui.setCinematic(!ui.cinematic);
          break;
        case 'h':
        case 'H':
          if (ui.hideUI) ui.setHideUI(false);
          else onScreenshotMode();
          break;
        case 'm':
        case 'M':
          audio.start();
          settings.set('audioMuted', !settings.audioMuted);
          break;
        case '?':
          ui.openDialog('help');
          break;
        case '[':
          ui.setPlaneHeight(Math.max(-3, ui.planeHeight - 0.1));
          break;
        case ']':
          ui.setPlaneHeight(Math.min(3, ui.planeHeight + 0.1));
          break;
        case 'Home':
          world.frameAll();
          break;
        default:
          if (GROUP_KEYS[key]) {
            const g = GROUP_KEYS[key];
            if (ui.tool === 'place' && ui.toolGroup === g) ui.setTool('select');
            else ui.startPlacement(g);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onScreenshotMode]);
}
