import { Download, FolderOpen, HelpCircle, Maximize2, Minimize2, Settings2, Volume2, VolumeX, Sparkles, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from './ui/primitives';
import { useUI } from '../stores/uiStore';
import { useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { audio } from '../effects/audio';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex select-none items-center gap-3">
      <div className="relative h-8 w-8 shrink-0">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#000_38%,#ffd9a6_46%,#ff9a3c_56%,transparent_72%)] shadow-[0_0_22px_-2px_rgb(255_154_60/0.7)]" />
        <div className="absolute left-[-5px] right-[-5px] top-1/2 h-[7px] -translate-y-1/2 rounded-[50%] border-[1.5px] border-[#ff9a3c]/80" style={{ transform: 'translateY(-50%) rotate(-12deg)' }} />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="bg-gradient-to-r from-white via-[#dff6ff] to-cyan bg-clip-text text-[15px] font-semibold tracking-[0.32em] text-transparent">GOD MODE</div>
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const openDialog = useUI((s) => s.openDialog);
  const worldName = useWorld((s) => s.worldName);
  const muted = useSettings((s) => s.audioMuted);
  const set = useSettings((s) => s.set);
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const f = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <>
      <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2 anim-slide-right" data-testid="top-left">
        <div className="glass flex items-center gap-4 rounded-2xl py-2 pl-3 pr-2">
          <Logo />
          <div className="h-6 w-px bg-white/10" />
          <button
            type="button"
            data-testid="preset-button"
            onClick={() => {
              audio.click(1);
              openDialog('presets');
            }}
            className="group flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <div className="label-caps !text-[9px] !tracking-[0.2em]">Universe</div>
              <div className="max-w-[220px] truncate text-[13px] font-medium text-ink" data-testid="world-name">
                {worldName}
              </div>
            </div>
            <ChevronDown size={14} className="text-mute transition-transform group-hover:translate-y-0.5" />
          </button>
        </div>
      </div>

      <div className="pointer-events-auto absolute right-4 top-4 anim-slide-left" data-testid="top-right">
        <div className="glass flex items-center gap-0.5 rounded-2xl p-1.5">
          <IconButton icon={Sparkles} label="Universes & presets" onClick={() => openDialog('presets')} testId="open-presets" />
          <IconButton icon={Download} label="Save universe" shortcut="Ctrl S" onClick={() => openDialog('save')} testId="open-save" />
          <IconButton icon={FolderOpen} label="Load universe" onClick={() => openDialog('load')} testId="open-load" />
          <div className="mx-1 h-5 w-px bg-white/10" />
          <IconButton
            icon={muted ? VolumeX : Volume2}
            label={muted ? 'Unmute audio' : 'Mute audio'}
            shortcut="M"
            active={false}
            onClick={() => {
              audio.start();
              set('audioMuted', !muted);
            }}
            testId="toggle-mute"
          />
          <IconButton icon={fullscreen ? Minimize2 : Maximize2} label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} />
          <IconButton icon={Settings2} label="Settings" onClick={() => openDialog('settings')} testId="open-settings" />
          <IconButton icon={HelpCircle} label="Controls & help" shortcut="?" onClick={() => openDialog('help')} testId="open-help" tooltipSide="left" />
        </div>
      </div>
    </>
  );
}
