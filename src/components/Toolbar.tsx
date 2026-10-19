import { MousePointer2, Globe2, Sun, Moon, CircleDot, Orbit, Wand2, Waves, Clapperboard, Camera, Spline, Tag } from 'lucide-react';
import { IconButton } from './ui/primitives';
import { useUI, type ToolGroup } from '../stores/uiStore';
import { useSettings } from '../stores/settingsStore';

const TOOLS: { group: ToolGroup; icon: typeof Globe2; label: string; key: string }[] = [
  { group: 'planet', icon: Globe2, label: 'Add planet', key: '2' },
  { group: 'star', icon: Sun, label: 'Add star', key: '3' },
  { group: 'moon', icon: Moon, label: 'Add moon', key: '4' },
  { group: 'blackHole', icon: CircleDot, label: 'Add black hole', key: '5' },
  { group: 'asteroid', icon: Orbit, label: 'Add asteroid / comet', key: '6' },
  { group: 'custom', icon: Wand2, label: 'Custom object', key: '7' },
];

export function Toolbar({ onScreenshot }: { onScreenshot: () => void }) {
  const tool = useUI((s) => s.tool);
  const group = useUI((s) => s.toolGroup);
  const setTool = useUI((s) => s.setTool);
  const startPlacement = useUI((s) => s.startPlacement);
  const cinematic = useUI((s) => s.cinematic);
  const setCinematic = useUI((s) => s.setCinematic);
  const showGrid = useSettings((s) => s.showGravityGrid);
  const showTrails = useSettings((s) => s.showTrails);
  const showLabels = useSettings((s) => s.showLabels);
  const set = useSettings((s) => s.set);

  return (
    <div className="pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 anim-slide-right" data-testid="toolbar">
      <div className="glass flex flex-col items-center gap-1 rounded-2xl p-1.5" data-ui-panel>
        <IconButton icon={MousePointer2} label="Select & inspect" shortcut="1" active={tool === 'select'} onClick={() => setTool('select')} tooltipSide="right" testId="tool-select" />
        <div className="my-1 h-px w-6 bg-white/10" />
        {TOOLS.map((t) => (
          <IconButton
            key={t.group}
            icon={t.icon}
            label={t.label}
            shortcut={t.key}
            active={tool === 'place' && group === t.group}
            onClick={() => (tool === 'place' && group === t.group ? setTool('select') : startPlacement(t.group))}
            tooltipSide="right"
            testId={`tool-${t.group}`}
          />
        ))}
        <div className="my-1 h-px w-6 bg-white/10" />
        <IconButton icon={Spline} label={showTrails ? 'Hide orbit trails' : 'Show orbit trails'} shortcut="T" active={showTrails} onClick={() => set('showTrails', !showTrails)} tooltipSide="right" testId="toggle-trails" />
        <IconButton icon={Tag} label={showLabels ? 'Hide labels' : 'Show labels'} shortcut="L" active={showLabels} onClick={() => set('showLabels', !showLabels)} tooltipSide="right" />
        <IconButton icon={Waves} label={showGrid ? 'Hide gravity field' : 'Show gravity field'} shortcut="G" active={showGrid} onClick={() => set('showGravityGrid', !showGrid)} tooltipSide="right" testId="toggle-grid" />
        <IconButton icon={Clapperboard} label={cinematic ? 'Stop cinematic camera' : 'Cinematic camera'} shortcut="C" active={cinematic} onClick={() => setCinematic(!cinematic)} tooltipSide="right" testId="toggle-cinematic" />
        <IconButton icon={Camera} label="Screenshot mode" shortcut="H" onClick={onScreenshot} tooltipSide="right" testId="screenshot-mode" />
      </div>
    </div>
  );
}
