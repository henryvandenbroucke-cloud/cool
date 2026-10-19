import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { engine, useWorld } from '../stores/worldStore';
import { useSettings } from '../stores/settingsStore';
import { useUI } from '../stores/uiStore';
import { frame, updateFramePositions } from '../rendering/frameState';
import { updateLights } from '../rendering/lighting';
import { VFXSystem } from '../effects/vfx';
import { audio } from '../effects/audio';
import { QUALITY } from '../rendering/quality';
import type { SimEvent } from '../simulation/types';

let lastToast = 0;

function describe(ev: SimEvent): { title: string; body: string; tone: 'impact' | 'info' } | null {
  const minor = /debris|shard/.test(ev.victimName) && (!ev.survivorName || /debris|shard/.test(ev.survivorName));
  if (minor) return null;
  switch (ev.type) {
    case 'absorb':
      return { title: `${ev.survivorName} consumed ${ev.victimName}`, body: 'Mass and momentum added to the black hole.', tone: 'impact' };
    case 'merge':
      return { title: `${ev.victimName} merged into ${ev.survivorName}`, body: 'Mass and momentum conserved.', tone: 'impact' };
    case 'fragment':
      return { title: `Impact! ${ev.victimName} hit ${ev.survivorName}`, body: `${ev.fragmentIds.length} fragments ejected.`, tone: 'impact' };
    case 'shatter':
      return { title: `${ev.victimName} shattered`, body: 'Creative effect — not a physical model.', tone: 'impact' };
  }
}

/**
 * Runs first every frame: advances physics by real time × time scale (fixed
 * steps inside), publishes render positions and lights, and turns physics
 * events into effects, sound and notifications.
 */
export function SimulationDriver() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const quality = useSettings((s) => s.quality);
  const budget = QUALITY[quality].debrisParticles;
  const epoch = useWorld((s) => s.epoch);

  const vfx = useMemo(() => new VFXSystem(budget), [budget]);
  useEffect(() => {
    scene.add(vfx.group);
    return () => {
      scene.remove(vfx.group);
      vfx.dispose();
    };
  }, [scene, vfx]);
  useEffect(() => {
    vfx.reset();
    frame.bloomBoost = 0;
    frame.shake = 0;
  }, [epoch, vfx]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 15);
    frame.time += delta;
    frame.delta = delta;
    const world = useWorld.getState();
    let limited = false;
    if (!world.paused) {
      const r = engine.advance(delta * world.timeScale);
      frame.simDelta = r.simulated;
      limited = r.limited;
    } else {
      engine.advance(0);
      frame.simDelta = 0;
    }
    updateFramePositions(engine);
    updateLights(engine);

    const events = engine.drainEvents();
    if (events.length) {
      const settings = useSettings.getState();
      let drama = 0;
      let absorbed = false;
      for (const ev of events) {
        drama = Math.max(drama, vfx.handle(ev, settings.reducedEffects ? budget * 0.35 : budget, camera.position));
        if (ev.type === 'absorb') absorbed = true;
        const d = describe(ev);
        if (d && frame.time - lastToast > 0.8) {
          lastToast = frame.time;
          useUI.getState().pushToast(d);
        }
      }
      if (settings.cameraShake && !settings.reducedEffects) frame.shake = Math.min(1.2, frame.shake + drama);
      if (absorbed) audio.absorb();
      if (drama > 0.02 || events.some((e) => e.type !== 'absorb')) audio.impact(Math.max(0.25, drama));
      world.syncFromEngine();
    } else if (world.structureVersion !== engine.structureVersion) {
      world.syncFromEngine();
    }

    vfx.update(dpr, size.height);
    frame.bloomBoost *= Math.exp(-delta * 2.2);
    frame.shake *= Math.exp(-delta * 3.5);

    // Publish slow-changing read-outs to the UI ~8 times per second.
    if (Math.floor(frame.time * 8) !== Math.floor((frame.time - delta) * 8)) {
      if (world.simTime !== engine.time || world.speedLimited !== limited) useWorld.setState({ simTime: engine.time, speedLimited: limited });
    }
  }, -3);

  return null;
}
