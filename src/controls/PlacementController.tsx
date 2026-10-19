import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { engine, useWorld } from '../stores/worldStore';
import { useUI } from '../stores/uiStore';
import { createBodyData, getCatalogEntry, BLACK_HOLE_RADIUS_PER_MASS } from '../celestial/catalog';
import { AU_PER_YR_IN_KM_S, RENDER_SCALE } from '../simulation/constants';
import { circularOrbitVelocity, circularSpeed, dominantBody, escapeSpeed } from '../simulation/orbits';
import type { BodyKind, Vec3 } from '../simulation/types';
import { effectiveRadius, type SimBody } from '../simulation/body';
import { Ribbon } from '../rendering/ribbon';
import { previewPath, type PredictBody } from '../rendering/prediction';
import { frame } from '../rendering/frameState';
import { unitSphere } from '../rendering/geometries';
import { FRAGMENT_OUTRO, LOGDEPTH_FRAGMENT_PARS, LOGDEPTH_VERTEX_PARS } from '../shaders/common';
import { audio } from '../effects/audio';
import { hexToLinear } from '../utils/color';

const GRID_VERT = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const GRID_FRAG = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform float uSpacing;
uniform vec2 uCursor;
uniform float uCursorR;
varying vec2 vLocal;
float line(float v, float w) {
  float d = abs(fract(v - 0.5) - 0.5) / fwidth(v);
  return 1.0 - smoothstep(w - 0.5, w + 0.5, d);
}
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  float rings = line(r / uSpacing, 0.6);
  float major = line(r / (uSpacing * 4.0), 0.9);
  float ang = atan(vLocal.y, vLocal.x) / 6.2831853 * 24.0;
  float spokes = line(ang, 0.5) * smoothstep(0.02, 0.2, r);
  float fade = smoothstep(1.0, 0.25, r);
  float cursor = exp(-pow((length(vLocal - uCursor) - uCursorR) / (uCursorR * 0.12 + 0.002), 2.0));
  vec3 col = vec3(0.26, 0.85, 1.0) * (rings * 0.16 + major * 0.3 + spokes * 0.08) * fade + vec3(0.6, 0.95, 1.0) * cursor * 0.8;
  col += vec3(0.25, 0.5, 0.9) * 0.025 * fade;
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

const GHOST_FRAG = /* glsl */ `
${LOGDEPTH_FRAGMENT_PARS}
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float f = pow(1.0 - abs(dot(normalize(vWorldNormal), V)), 2.2);
  float scan = 0.5 + 0.5 * sin(vWorldPos.y * 0.0 + uTime * 3.0);
  vec3 col = mix(uColor * 0.35, vec3(0.35, 0.9, 1.0), f) * (0.45 + f * 1.6) * (0.85 + 0.15 * scan);
  gl_FragColor = vec4(col, 1.0);
  ${FRAGMENT_OUTRO}
}
`;

const GHOST_VERT = /* glsl */ `
${LOGDEPTH_VERTEX_PARS}
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const DRAG_THRESHOLD = 6;
/** Pixels of drag that correspond to the local circular-orbit speed. */
const PX_PER_VCIRC = 140;

function niceSpacing(range: number): number {
  const raw = range / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}

/**
 * Placement tool: hover shows a holographic ghost on the placement plane with
 * its predicted path; click places with the chosen velocity mode; click-drag
 * sets a custom launch velocity (arrow), relative to the dominant body.
 */
export function PlacementController() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const scene = useThree((s) => s.scene);
  const tool = useUI((s) => s.tool);
  const active = tool === 'place';

  const visuals = useMemo(() => {
    const grid = new THREE.Mesh(
      new THREE.CircleGeometry(1, 128),
      new THREE.ShaderMaterial({
        vertexShader: GRID_VERT,
        fragmentShader: GRID_FRAG,
        uniforms: { uSpacing: { value: 0.1 }, uCursor: { value: new THREE.Vector2() }, uCursorR: { value: 0.01 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.frustumCulled = false;
    grid.renderOrder = 2;
    const ghostMat = new THREE.ShaderMaterial({
      vertexShader: GHOST_VERT,
      fragmentShader: GHOST_FRAG,
      uniforms: { uColor: { value: new THREE.Vector3(0.4, 0.8, 1) }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ghost = new THREE.Mesh(unitSphere(48), ghostMat);
    ghost.frustumCulled = false;
    ghost.renderOrder = 9;
    const arrowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.0), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0), arrowMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 16).translate(0, 0.5, 0), arrowMat);
    const arrow = new THREE.Group();
    arrow.add(shaft, head);
    arrow.renderOrder = 9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.6, 0.8), transparent: true, opacity: 0.4, depthWrite: false }));
    const path = new Ribbon(560, { color: new THREE.Color('#41d9ff'), headColor: new THREE.Color('#d9f8ff'), width: 2, opacity: 0.9, dash: 1 });
    const group = new THREE.Group();
    group.add(grid, ghost, arrow, stem, path.mesh);
    group.visible = false;
    return { group, grid, ghost, ghostMat, arrow, shaft, head, stem, path };
  }, []);

  useEffect(() => {
    scene.add(visuals.group);
    return () => {
      scene.remove(visuals.group);
      visuals.path.dispose();
      (visuals.grid.material as THREE.Material).dispose();
      visuals.grid.geometry.dispose();
      visuals.ghostMat.dispose();
    };
  }, [scene, visuals]);

  const st = useRef({
    pointer: null as { x: number; y: number } | null,
    hit: null as THREE.Vector3 | null,
    drag: null as null | { anchor: THREE.Vector3; sx: number; sy: number; current: THREE.Vector3; px: number },
    nextPredict: 0,
    nextInfo: 0,
    velocity: { x: 0, y: 0, z: 0 } as Vec3,
    parentId: null as string | null,
  });

  const planeY = () => (controls?.target.y ?? 0) + useUI.getState().planeHeight * RENDER_SCALE;

  const intersect = (x: number, y: number): THREE.Vector3 | null => {
    const r = gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY());
    const out = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, out)) return null;
    // Avoid absurdly distant hits near the horizon.
    const maxDist = camera.position.distanceTo(controls?.target ?? out) * 25;
    if (out.distanceTo(camera.position) > maxDist) return null;
    return out;
  };

  useEffect(() => {
    if (!active) {
      visuals.group.visible = false;
      st.current.drag = null;
      useUI.getState().setPlacementInfo(null);
      return;
    }
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      st.current.pointer = { x: e.clientX, y: e.clientY };
      if (st.current.drag) {
        const p = intersect(e.clientX, e.clientY);
        if (p) st.current.drag.current.copy(p);
        st.current.drag.px = Math.hypot(e.clientX - st.current.drag.sx, e.clientY - st.current.drag.sy);
        st.current.nextPredict = 0;
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.altKey) return;
      audio.start();
      const p = intersect(e.clientX, e.clientY);
      if (!p) return;
      st.current.drag = { anchor: p.clone(), sx: e.clientX, sy: e.clientY, current: p.clone(), px: 0 };
      el.setPointerCapture(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      const d = st.current.drag;
      if (!d || e.button !== 0) return;
      st.current.drag = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      spawn(d.anchor, st.current.velocity);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && st.current.drag) {
        st.current.drag = null;
        e.stopPropagation();
      }
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
    el.style.cursor = 'crosshair';
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      el.style.cursor = '';
    };
  }, [active, gl, visuals]);

  function ghostKind(): { kind: BodyKind; mass: number; radiusAu: number; key: string } {
    const key = useUI.getState().placementType;
    const e = getCatalogEntry(key);
    const radiusAu = e.kind === 'blackHole' ? e.mass * BLACK_HOLE_RADIUS_PER_MASS : e.radiusKm / 1.495978707e8;
    return { kind: e.kind, mass: e.mass, radiusAu, key };
  }

  function computeVelocity(posAu: Vec3, mass: number): { v: Vec3; parent: SimBody | null } {
    const ui = useUI.getState();
    const parent = dominantBody(engine.bodies, posAu.x, posAu.y, posAu.z, 0);
    const d = st.current.drag;
    const base = parent ? { x: parent.vx, y: parent.vy, z: parent.vz } : { x: 0, y: 0, z: 0 };
    const r = parent ? Math.hypot(posAu.x - parent.x, posAu.y - parent.y, posAu.z - parent.z) : 1;
    const vc = parent ? circularSpeed(parent.mass + mass, Math.max(r, 1e-6)) : 2 * Math.PI;
    if (d && d.px > DRAG_THRESHOLD) {
      const dir = d.current.clone().sub(d.anchor);
      dir.y = 0;
      if (dir.lengthSq() > 0) dir.normalize();
      const speed = (Math.min(d.px, 900) / PX_PER_VCIRC) * vc;
      return { v: { x: base.x + dir.x * speed, y: base.y, z: base.z + dir.z * speed }, parent };
    }
    switch (ui.velocityMode) {
      case 'circular':
        return { v: parent ? circularOrbitVelocity(parent, posAu, mass) : { x: 0, y: 0, z: 0 }, parent };
      case 'manual':
        return { v: base, parent };
      case 'stationary':
        return { v: { x: 0, y: 0, z: 0 }, parent };
      case 'custom': {
        const cv = ui.customVelocity;
        const speed = cv.speedKms / AU_PER_YR_IN_KM_S;
        if (!parent) {
          const h = (cv.heading * Math.PI) / 180;
          return { v: { x: Math.cos(h) * speed, y: Math.sin((cv.pitch * Math.PI) / 180) * speed, z: Math.sin(h) * speed }, parent };
        }
        const rad = new THREE.Vector3(posAu.x - parent.x, 0, posAu.z - parent.z).normalize();
        const tan = new THREE.Vector3(0, 1, 0).cross(rad).normalize();
        const h = (cv.heading * Math.PI) / 180;
        const p = (cv.pitch * Math.PI) / 180;
        const dir = tan.multiplyScalar(Math.cos(h)).addScaledVector(rad, Math.sin(h)).multiplyScalar(Math.cos(p)).add(new THREE.Vector3(0, Math.sin(p), 0));
        return { v: { x: base.x + dir.x * speed, y: base.y + dir.y * speed, z: base.z + dir.z * speed }, parent };
      }
    }
  }

  function spawn(anchor: THREE.Vector3, velocity: Vec3) {
    const ui = useUI.getState();
    const pos = { x: anchor.x / RENDER_SCALE, y: anchor.y / RENDER_SCALE, z: anchor.z / RENDER_SCALE };
    const data = createBodyData(ui.placementType, { position: pos, velocity });
    // Never spawn overlapping an existing body.
    for (const b of engine.bodies) {
      const d = Math.hypot(b.x - pos.x, b.y - pos.y, b.z - pos.z);
      if (d < effectiveRadius(b, engine.settings.sizeScale) + effectiveRadius(data, engine.settings.sizeScale)) {
        ui.pushToast({ title: 'Too close', body: `That spot is inside ${b.name}.`, tone: 'warning' });
        return;
      }
    }
    const id = useWorld.getState().addBody(data);
    if (id) {
      audio.spawn();
      ui.pushToast({ title: `Created ${data.name}`, body: `${getCatalogEntry(ui.placementType).label} · Ctrl+Z to undo`, tone: 'success' });
    }
  }

  useFrame(() => {
    if (!active) return;
    const s = st.current;
    const v = visuals;
    const target = controls?.target ?? new THREE.Vector3();
    const camDist = camera.position.distanceTo(target);
    const y = planeY();
    v.group.visible = true;
    // Grid centred under the camera target.
    const gridR = camDist * 1.6;
    v.grid.position.set(target.x, y, target.z);
    v.grid.scale.setScalar(gridR);
    const gu = (v.grid.material as THREE.ShaderMaterial).uniforms;
    gu.uSpacing.value = niceSpacing(gridR) / gridR;
    // Stem from target down/up to the plane.
    const dy = y - target.y;
    v.stem.visible = Math.abs(dy) > camDist * 0.002;
    v.stem.position.copy(target);
    v.stem.scale.set(camDist * 0.0012, dy, camDist * 0.0012);

    const hit = s.drag ? s.drag.anchor : s.pointer ? intersect(s.pointer.x, s.pointer.y) : null;
    s.hit = hit;
    v.ghost.visible = Boolean(hit);
    v.arrow.visible = Boolean(s.drag && s.drag.px > DRAG_THRESHOLD);
    v.path.mesh.visible = Boolean(hit);
    if (!hit) return;
    gu.uCursor.value.set((hit.x - target.x) / gridR, -(hit.z - target.z) / gridR);

    const g = ghostKind();
    const effR = effectiveRadius({ kind: g.kind, radius: g.radiusAu }, engine.settings.sizeScale) * RENDER_SCALE;
    const minR = hit.distanceTo(camera.position) * 0.006;
    v.ghost.position.copy(hit);
    v.ghost.scale.setScalar(Math.max(effR, minR));
    v.ghostMat.uniforms.uTime.value = frame.time;
    v.ghostMat.uniforms.uColor.value.set(...hexToLinear(getCatalogEntry(g.key).appearance.colors[0]));
    gu.uCursorR.value = Math.max(effR, minR) * 2.2 / gridR;

    const posAu = { x: hit.x / RENDER_SCALE, y: hit.y / RENDER_SCALE, z: hit.z / RENDER_SCALE };
    const { v: vel, parent } = computeVelocity(posAu, g.mass);
    s.velocity = vel;

    if (s.drag && s.drag.px > DRAG_THRESHOLD) {
      const dir = s.drag.current.clone().sub(s.drag.anchor);
      dir.y = 0;
      const len = dir.length();
      if (len > 0) {
        v.arrow.position.copy(s.drag.anchor);
        v.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        const w = camDist * 0.0022;
        v.shaft.scale.set(w, len * 0.86, w);
        v.head.position.set(0, len * 0.86, 0);
        v.head.scale.set(w * 4, len * 0.14, w * 4);
      }
    }

    if (frame.time >= s.nextPredict) {
      s.nextPredict = frame.time + 0.07;
      const ghost: PredictBody = { id: '__ghost__', kind: g.kind, mass: g.mass, radius: g.radiusAu, x: posAu.x, y: posAu.y, z: posAu.z, vx: vel.x, vy: vel.y, vz: vel.z };
      const p = previewPath(engine, ghost, true, 420);
      if (p && p.count > 1) {
        v.path.setPoints(p.points, p.count);
        v.path.rebuild();
        v.path.material.uniforms.uOffset.value.copy(p.relativeTo ? frame.positions.get(p.relativeTo) ?? new THREE.Vector3() : new THREE.Vector3());
        const span = Math.hypot(p.points[0] - p.points[Math.floor(p.count / 2) * 3], p.points[2] - p.points[Math.floor(p.count / 2) * 3 + 2]);
        v.path.material.uniforms.uDash.value = Math.max(span * 0.035, 0.002);
        v.path.material.uniforms.uColor.value.set(p.impactId ? '#ff6a3d' : '#41d9ff');
      }
      if (frame.time >= s.nextInfo) {
        s.nextInfo = frame.time + 0.12;
        const rel = parent ? Math.hypot(vel.x - parent.vx, vel.y - parent.vy, vel.z - parent.vz) : Math.hypot(vel.x, vel.y, vel.z);
        const dist = parent ? Math.hypot(posAu.x - parent.x, posAu.y - parent.y, posAu.z - parent.z) : 0;
        useUI.getState().setPlacementInfo({
          parentName: parent?.name ?? null,
          speedKms: rel * AU_PER_YR_IN_KM_S,
          circularKms: parent ? circularSpeed(parent.mass + g.mass, dist) * AU_PER_YR_IN_KM_S : 0,
          escapeKms: parent ? escapeSpeed(parent.mass + g.mass, dist) * AU_PER_YR_IN_KM_S : 0,
          impact: p?.impactName ?? null,
          distanceAu: dist,
        });
      }
    }
    v.path.material.uniforms.uTime.value = frame.time;
  });

  return null;
}
