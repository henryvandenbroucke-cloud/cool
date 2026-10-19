import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { engine, useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { frame } from '../rendering/frameState';
import { RENDER_SCALE } from '../simulation/constants';
import { centerOfMass } from '../simulation/physics';
import { updateExposure } from '../rendering/lighting';

interface Transition {
  start: number;
  duration: number;
  fromTarget: THREE.Vector3;
  fromDist: number;
  fromDir: THREE.Vector3;
  toId: string | null;
  toPoint: THREE.Vector3;
  toDist: number;
  toDir: THREE.Vector3 | null;
  ease: (t: number) => number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

function dirFrom(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

/** A comfortable viewing distance for a body (scene units). */
export function viewDistanceFor(id: string): number {
  const b = engine.getBody(id);
  const r = frame.radii.get(id) ?? 0.1;
  if (!b) return r * 8;
  if (b.kind === 'blackHole') return r * 14;
  if (b.kind === 'star') return r * 7;
  if (b.appearance.rings) return r * 7;
  if (b.kind === 'asteroid' || b.kind === 'comet') return Math.max(r * 10, 0.02);
  return r * 5.5;
}

export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const tool = useUI((s) => s.tool);
  const cinematic = useUI((s) => s.cinematic);
  const introDone = useUI((s) => s.introDone);
  const rig = useRef({
    transition: null as Transition | null,
    lastFollow: new THREE.Vector3(),
    followId: null as string | null,
    shake: new THREE.Vector3(),
    firstLoad: true,
    cinematicIndex: 0,
    cinematicNext: 0,
    cinematicPhase: 0,
  });

  const startTransition = (toId: string | null, toPoint: THREE.Vector3, toDist: number, duration: number, toDir: THREE.Vector3 | null = null, ease = easeInOut) => {
    const c = controls.current;
    if (!c) return;
    const fromDir = tmp.copy(camera.position).sub(c.target);
    const fromDist = fromDir.length() || 1;
    rig.current.transition = {
      start: frame.time,
      duration,
      fromTarget: c.target.clone(),
      fromDist,
      fromDir: fromDir.clone().normalize(),
      toId,
      toPoint: toPoint.clone(),
      toDist,
      toDir,
      ease,
    };
    rig.current.followId = null;
  };

  // Reset to the world's default view (also runs on every world load, with an intro fly-in the first time).
  const resetToken = useWorld((s) => s.cameraResetToken);
  useEffect(() => {
    if (resetToken === 0) return;
    const spec = useWorld.getState().camera;
    const target = spec.target ? frame.positions.get(spec.target) ?? posOf(spec.target) : new THREE.Vector3();
    const dir = dirFrom(spec.elevation, spec.azimuth);
    const dist = spec.distance * RENDER_SCALE;
    const c = controls.current;
    if (rig.current.firstLoad && c) {
      // Intro: start far out above the system and glide in.
      rig.current.firstLoad = false;
      c.target.copy(target);
      camera.position.copy(target).addScaledVector(dirFrom(spec.elevation + 32, spec.azimuth - 70), dist * 16);
      startTransition(spec.target, target, dist, 6.5, dir, easeOut);
    } else {
      startTransition(spec.target, target, dist, 1.6, dir);
    }
  }, [resetToken]);

  // Skipping the intro also fast-forwards the opening fly-in.
  useEffect(() => {
    const t = rig.current.transition;
    if (introDone && t && t.duration > 5) {
      const elapsed = frame.time - t.start;
      const p = Math.min(1, elapsed / t.duration);
      if (p < 0.85) {
        // Restart from the current pose with a short ease so there is no jump.
        const c = controls.current;
        if (c) startTransition(t.toId, t.toPoint, t.toDist, 1.2, t.toDir);
      }
    }
  }, [introDone]);

  const focusRequest = useWorld((s) => s.focusRequest);
  useEffect(() => {
    if (!focusRequest) return;
    const p = frame.positions.get(focusRequest.id);
    if (!p) return;
    const c = controls.current;
    const current = c ? camera.position.distanceTo(c.target) : 10;
    const ideal = viewDistanceFor(focusRequest.id);
    // Keep the user's zoom if it is already a sensible close-up.
    const toDist = current < ideal * 4 && current > ideal * 0.6 && c?.target.distanceTo(p) === 0 ? current : ideal;
    startTransition(focusRequest.id, p, toDist, 1.5);
    useUI.getState().setCinematic(false);
  }, [focusRequest]);

  const frameAllToken = useWorld((s) => s.frameAllToken);
  useEffect(() => {
    if (frameAllToken === 0) return;
    const bodies = engine.bodies;
    if (!bodies.length) return;
    const com = centerOfMass(bodies).position;
    const center = new THREE.Vector3(com.x, com.y, com.z).multiplyScalar(RENDER_SCALE);
    const dists = bodies.map((b) => frame.positions.get(b.id)?.distanceTo(center) ?? 0).sort((a, b) => a - b);
    const radius = Math.max(dists[Math.floor(dists.length * 0.92)] ?? 1, 1);
    const fov = (camera.fov * Math.PI) / 180;
    startTransition(null, center, (radius / Math.sin(fov / 2)) * 1.05, 1.6, dirFrom(35, 25));
  }, [frameAllToken]);

  // Follow requests from the UI.
  const followId = useWorld((s) => s.followId);
  useEffect(() => {
    if (followId && !rig.current.transition) {
      const p = frame.positions.get(followId);
      if (p) startTransition(followId, p, camera.position.distanceTo(controls.current?.target ?? p), 1.1);
    } else if (!followId) {
      rig.current.followId = null;
    }
  }, [followId]);

  // Placement tool: the left button places bodies, so camera rotation moves to Alt+drag / middle button.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const place = tool === 'place';
    c.mouseButtons = {
      LEFT: place ? (-1 as unknown as THREE.MOUSE) : THREE.MOUSE.ROTATE,
      MIDDLE: place ? THREE.MOUSE.ROTATE : THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    const onKey = (e: KeyboardEvent) => {
      if (tool !== 'place') return;
      c.mouseButtons.LEFT = e.altKey ? THREE.MOUSE.ROTATE : (-1 as unknown as THREE.MOUSE);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [tool]);

  // Right-drag pans away from a followed body: stop following.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button === 2 && rig.current.followId) {
        rig.current.followId = null;
        useWorld.getState().follow(null);
      }
    };
    el.addEventListener('pointerdown', down);
    return () => el.removeEventListener('pointerdown', down);
  }, [gl]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.autoRotate = cinematic;
    c.autoRotateSpeed = 0.35;
    rig.current.cinematicNext = frame.time;
  }, [cinematic]);

  // Before OrbitControls.update(): undo last frame's shake, run transitions and follow.
  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const r = rig.current;
    camera.position.sub(r.shake);
    r.shake.set(0, 0, 0);

    if (useUI.getState().cinematic) runCinematic();

    const t = r.transition;
    if (t) {
      const p = Math.min(1, (frame.time - t.start) / t.duration);
      const e = t.ease(p);
      const live = t.toId ? frame.positions.get(t.toId) : null;
      const goal = live ?? t.toPoint;
      c.target.lerpVectors(t.fromTarget, goal, e);
      const dist = Math.exp(Math.log(t.fromDist) + (Math.log(t.toDist) - Math.log(t.fromDist)) * e);
      const dir = t.toDir ? tmp2.copy(t.fromDir).lerp(t.toDir, e).normalize() : tmp2.copy(t.fromDir);
      camera.position.copy(c.target).addScaledVector(dir, dist);
      if (p >= 1) {
        r.transition = null;
        r.followId = t.toId;
        if (live) r.lastFollow.copy(live);
      }
    } else if (r.followId) {
      const p = frame.positions.get(r.followId);
      if (p) {
        tmp.copy(p).sub(r.lastFollow);
        camera.position.add(tmp);
        c.target.copy(p);
        r.lastFollow.copy(p);
      } else {
        r.followId = null;
      }
    }

    updateExposure(c.target, frame.delta);
    const focusR = r.followId ? frame.radii.get(r.followId) ?? 0 : 0;
    c.minDistance = focusR > 0 ? focusR * 1.25 : 0.0005;
    c.maxDistance = 2e5;
    const dist = camera.position.distanceTo(c.target);
    c.zoomSpeed = 1.1;
    c.panSpeed = 0.9;
    c.rotateSpeed = 0.55;
    camera.near = Math.max(1e-5, Math.min(dist * 0.002, 10));
    camera.far = 5e6;
    camera.updateProjectionMatrix();
  }, -2);

  // After OrbitControls.update(): apply a decaying impact shake.
  useFrame(() => {
    const c = controls.current;
    if (!c || frame.shake < 0.002) return;
    const d = camera.position.distanceTo(c.target);
    const a = frame.shake * d * 0.012;
    rig.current.shake.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    camera.position.add(rig.current.shake);
  }, 0);

  function runCinematic() {
    const r = rig.current;
    if (frame.time < r.cinematicNext) return;
    const subjects = engine.bodies
      .filter((b) => b.kind !== 'asteroid')
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 10)
      .map((b) => b.id);
    if (!subjects.length) return;
    r.cinematicIndex = (r.cinematicIndex + 1) % subjects.length;
    const id = subjects[r.cinematicIndex];
    const p = frame.positions.get(id);
    if (!p) return;
    const el = 8 + Math.random() * 28;
    const az = Math.random() * 360;
    startTransition(id, p, viewDistanceFor(id) * (1.1 + Math.random() * 1.6), 3.2, dirFrom(el, az));
    r.cinematicNext = frame.time + 13;
  }

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      screenSpacePanning
      onStart={() => {
        rig.current.transition = null;
        if (useUI.getState().cinematic) useUI.getState().setCinematic(false);
      }}
    />
  );
}

function posOf(id: string): THREE.Vector3 {
  const b = engine.getBody(id);
  return b ? new THREE.Vector3(b.x, b.y, b.z).multiplyScalar(RENDER_SCALE) : new THREE.Vector3();
}
