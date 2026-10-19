import { Component, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Scene } from './Scene';
import { engine, useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { useSettings } from '../stores/settingsStore';
import { audio } from '../effects/audio';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { TopBar } from '../components/TopBar';
import { Toolbar } from '../components/Toolbar';
import { TimeBar } from '../components/TimeBar';
import { PropertiesPanel } from '../components/PropertiesPanel';
import { PlacementPanel } from '../components/PlacementPanel';
import { LabelsOverlay } from '../components/LabelsOverlay';
import { Intro } from '../components/Intro';
import { Hints } from '../components/Hints';
import { Toasts } from '../components/Toasts';
import { ConfirmDelete } from '../components/ConfirmDelete';
import { PresetsDialog } from '../components/dialogs/PresetsDialog';
import { SettingsDialog } from '../components/dialogs/SettingsDialog';
import { SaveLoadDialog } from '../components/dialogs/SaveLoadDialog';
import { HelpDialog } from '../components/dialogs/HelpDialog';
import { ScreenshotBar } from '../components/ScreenshotBar';
import { Logo } from '../components/TopBar';

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2'));
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error) return <Fallback title="The renderer crashed" detail={this.state.error} />;
    return this.props.children;
  }
}

function Fallback({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="glass max-w-md rounded-2xl p-6 text-center">
        <div className="mb-4 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-[16px] font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-mute">{detail}</p>
        <p className="mt-3 text-[12px] text-faint">GOD MODE needs WebGL 2 — try an up-to-date Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p>
      </div>
    </div>
  );
}

function Disclosure() {
  const text = useWorld((s) => s.disclosure);
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto absolute left-4 top-[78px] anim-fade" data-testid="disclosure" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-[#0b1020]/60 px-2.5 py-1 text-[10.5px] text-mute ring-1 ring-white/[0.07] backdrop-blur-md transition-colors hover:text-ink"
        aria-expanded={open}
      >
        <Info size={11} className="text-cyan" />
        Newtonian N-body gravity
        {text && <span className="text-faint">· notes</span>}
      </button>
      {open && text && (
        <div className="glass mt-2 w-[330px] rounded-xl px-3.5 py-3 text-[11.5px] leading-relaxed text-mute anim-rise" data-ui-panel>
          {text}
        </div>
      )}
    </div>
  );
}

function FollowBadge() {
  const followId = useWorld((s) => s.followId);
  useWorld((s) => s.propertyVersion);
  const body = engine.getBody(followId);
  if (!followId || !body) return null;
  return (
    <div className="pointer-events-auto absolute bottom-[92px] left-1/2 -translate-x-1/2 anim-rise" data-testid="follow-badge">
      <div className="glass flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-[11.5px]">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan shadow-[0_0_8px_rgb(65_217_255)]" style={{ animation: 'gm-pulse 1.6s ease-in-out infinite' }} />
        <span className="text-mute">
          Following <span className="text-ink">{body.name}</span>
        </span>
        <button type="button" onClick={() => useWorld.getState().follow(null)} className="rounded-full px-2 py-0.5 text-mute transition-colors hover:bg-white/10 hover:text-ink">
          Release
        </button>
      </div>
    </div>
  );
}

export function App() {
  const [supported] = useState(webglAvailable);
  const hideUI = useUI((s) => s.hideUI);
  const tool = useUI((s) => s.tool);
  const cinematic = useUI((s) => s.cinematic);
  const muted = useSettings((s) => s.audioMuted);
  const volume = useSettings((s) => s.volume);

  useEffect(() => {
    if (useWorld.getState().epoch === 0) useWorld.getState().loadPreset('solar');
  }, []);

  useEffect(() => {
    audio.setMuted(muted);
    audio.setVolume(volume);
  }, [muted, volume]);

  // Pause physics while the tab is hidden so time doesn't jump when it returns.
  useEffect(() => {
    let wasPaused = false;
    const onVis = () => {
      const w = useWorld.getState();
      if (document.hidden) {
        wasPaused = w.paused;
        w.setPaused(true);
      } else if (!wasPaused) w.setPaused(false);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const screenshotMode = useCallback(() => {
    useUI.getState().setHideUI(true);
    useUI.getState().pushToast({ title: 'Screenshot mode', body: 'Frame your shot, then capture. Press H to show the interface.', tone: 'info' });
  }, []);
  useKeyboardShortcuts(screenshotMode);

  if (!supported) return <Fallback title="WebGL 2 is not available" detail="Your browser or device could not create a WebGL 2 context." />;

  const showPanels = !hideUI && !cinematic;
  return (
    <div className="relative h-full w-full select-none" onPointerDown={() => audio.start()}>
      <SceneErrorBoundary>
        <Scene />
      </SceneErrorBoundary>
      <div className="pointer-events-none absolute inset-0 z-10">
        {!hideUI && <LabelsOverlay />}
        {!hideUI && (
          <>
            <TopBar />
            {showPanels && tool !== 'place' && <Disclosure />}
            <Toolbar onScreenshot={screenshotMode} />
            {tool === 'place' && <PlacementPanel />}
            {showPanels && <PropertiesPanel />}
            <TimeBar />
            <Hints />
            <FollowBadge />
          </>
        )}
        {hideUI && <ScreenshotBar />}
        <Toasts />
      </div>
      <ConfirmDelete />
      <PresetsDialog />
      <SettingsDialog />
      <SaveLoadDialog />
      <HelpDialog />
      <Intro />
    </div>
  );
}
