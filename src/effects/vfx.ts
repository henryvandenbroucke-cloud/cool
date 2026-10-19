import * as THREE from 'three';
import { DEBRIS_FRAGMENT, DEBRIS_VERTEX, GHOST_FRAGMENT, SHOCK_FRAGMENT, SHOCK_VERTEX } from '../shaders/fx';
import { BILLBOARD_VERTEX, FLASH_FRAGMENT } from '../shaders/star';
import { SIMPLE_VERTEX } from '../shaders/planet';
import { RENDER_SCALE } from '../simulation/constants';
import type { SimEvent } from '../simulation/types';
import { frame } from '../rendering/frameState';
import { flares, impactDirs, impactSizes, surfaceMeshes } from '../rendering/registry';
import { unitQuad, unitSphere } from '../rendering/geometries';
import { hexToLinear } from '../utils/color';

const MAX_ANCHORS = 16;

interface Anchor {
  bodyId: string | null;
  pos: THREE.Vector3;
  /** Ballistic velocity (scene units per simulated year) when not attached to a body. */
  vel: THREE.Vector3;
}

interface Timed {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  start: number;
  duration: number;
  anchor: number;
  offset: THREE.Vector3;
  size: number;
  active: boolean;
}

interface Ghost extends Timed {
  from: THREE.Vector3;
  targetId: string;
}

const tmp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

function randomUnit(out: THREE.Vector3): THREE.Vector3 {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(t), u, s * Math.sin(t));
}

/**
 * Event-driven, pooled visual effects. Nothing here touches the physics: it
 * only reacts to engine events (collisions, absorptions, shatters).
 */
export class VFXSystem {
  readonly group = new THREE.Group();
  private capacity: number;
  private cursor = 0;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;
  private material: THREE.ShaderMaterial;
  private aStart: THREE.BufferAttribute;
  private aVel: THREE.BufferAttribute;
  private aParams: THREE.BufferAttribute;
  private aKind: THREE.BufferAttribute;
  private anchors: Anchor[] = [];
  private anchorCursor = 0;
  private flashes: Timed[] = [];
  private shocks: Timed[] = [];
  private ghosts: Ghost[] = [];
  private dirty: [number, number][] = [];

  constructor(capacity: number) {
    this.capacity = capacity;
    this.geometry = new THREE.BufferGeometry();
    this.aStart = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aVel = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const params = new Float32Array(capacity * 4);
    for (let i = 0; i < capacity; i++) params[i * 4] = -1e9; // long dead
    this.aParams = new THREE.BufferAttribute(params, 4).setUsage(THREE.DynamicDrawUsage);
    this.aKind = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    this.geometry.setAttribute('aStart', this.aStart);
    this.geometry.setAttribute('aVel', this.aVel);
    this.geometry.setAttribute('aParams', this.aParams);
    this.geometry.setAttribute('aKind', this.aKind);
    for (let i = 0; i < MAX_ANCHORS; i++) this.anchors.push({ bodyId: null, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    this.material = new THREE.ShaderMaterial({
      vertexShader: DEBRIS_VERTEX,
      fragmentShader: DEBRIS_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uAnchors: { value: this.anchors.map((a) => a.pos) },
        uPixelRatio: { value: 1 },
        uViewport: { value: 1000 },
        uIntensity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.group.add(this.points);

    for (let i = 0; i < 10; i++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: BILLBOARD_VERTEX,
        fragmentShader: FLASH_FRAGMENT,
        uniforms: { uSize: { value: 1 }, uColor: { value: new THREE.Vector3(1, 0.7, 0.35) }, uIntensity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(unitQuad(), m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, material: m, start: 0, duration: 1, anchor: 0, offset: new THREE.Vector3(), size: 1, active: false });
    }
    for (let i = 0; i < 8; i++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: SHOCK_VERTEX,
        fragmentShader: SHOCK_FRAGMENT,
        uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Vector3(1, 0.5, 0.2) }, uSeed: { value: Math.random() * 10 } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(unitQuad(), m);
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      mesh.visible = false;
      this.group.add(mesh);
      this.shocks.push({ mesh, material: m, start: 0, duration: 1.6, anchor: 0, offset: new THREE.Vector3(), size: 1, active: false });
    }
    for (let i = 0; i < 4; i++) {
      const m = new THREE.ShaderMaterial({
        vertexShader: SIMPLE_VERTEX,
        fragmentShader: GHOST_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Vector3(1, 1, 1) }, uT: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(unitSphere(32), m);
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.group.add(mesh);
      this.ghosts.push({ mesh, material: m, start: 0, duration: 1.3, anchor: 0, offset: new THREE.Vector3(), size: 1, active: false, from: new THREE.Vector3(), targetId: '' });
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    for (const f of [...this.flashes, ...this.shocks, ...this.ghosts]) f.material.dispose();
  }

  reset(): void {
    const params = this.aParams.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) params[i * 4] = -1e9;
    this.aParams.clearUpdateRanges();
    this.aParams.needsUpdate = true;
    for (const f of [...this.flashes, ...this.shocks, ...this.ghosts]) {
      f.active = false;
      f.mesh.visible = false;
    }
    for (const a of this.anchors) a.bodyId = null;
  }

  private allocAnchor(bodyId: string | null, pos: THREE.Vector3, velAuYr?: { x: number; y: number; z: number }): number {
    const i = this.anchorCursor;
    this.anchorCursor = (this.anchorCursor + 1) % MAX_ANCHORS;
    const a = this.anchors[i];
    a.bodyId = bodyId;
    a.pos.copy(pos);
    if (velAuYr) a.vel.set(velAuYr.x, velAuYr.y, velAuYr.z).multiplyScalar(RENDER_SCALE);
    else a.vel.set(0, 0, 0);
    return i;
  }

  private emit(count: number, anchor: number, fill: (i: number, start: THREE.Vector3, vel: THREE.Vector3) => { life: number; size: number; kind: number; delay?: number }): void {
    const n = Math.min(count, this.capacity);
    const start = new THREE.Vector3();
    const vel = new THREE.Vector3();
    const s = this.aStart.array as Float32Array;
    const v = this.aVel.array as Float32Array;
    const p = this.aParams.array as Float32Array;
    const k = this.aKind.array as Float32Array;
    const first = this.cursor;
    for (let i = 0; i < n; i++) {
      const idx = (first + i) % this.capacity;
      start.set(0, 0, 0);
      vel.set(0, 0, 0);
      const r = fill(i, start, vel);
      s[idx * 3] = start.x;
      s[idx * 3 + 1] = start.y;
      s[idx * 3 + 2] = start.z;
      v[idx * 3] = vel.x;
      v[idx * 3 + 1] = vel.y;
      v[idx * 3 + 2] = vel.z;
      p[idx * 4] = frame.time + (r.delay ?? 0);
      p[idx * 4 + 1] = r.life;
      p[idx * 4 + 2] = r.size;
      p[idx * 4 + 3] = anchor;
      k[idx] = r.kind;
    }
    this.cursor = (first + n) % this.capacity;
    if (first + n <= this.capacity) this.dirty.push([first, n]);
    else {
      this.dirty.push([first, this.capacity - first]);
      this.dirty.push([0, first + n - this.capacity]);
    }
  }

  private flash(anchor: number, offset: THREE.Vector3, size: number, color: [number, number, number], duration: number): void {
    const f = this.flashes.find((x) => !x.active) ?? this.flashes[0];
    f.active = true;
    f.mesh.visible = true;
    f.start = frame.time;
    f.duration = duration;
    f.anchor = anchor;
    f.offset.copy(offset);
    f.size = size;
    f.material.uniforms.uColor.value.set(...color);
  }

  private shock(anchor: number, offset: THREE.Vector3, normal: THREE.Vector3, size: number, color: [number, number, number], duration = 1.6, delay = 0): void {
    const s = this.shocks.find((x) => !x.active) ?? this.shocks[0];
    s.active = true;
    s.mesh.visible = false;
    s.start = frame.time + delay;
    s.duration = duration;
    s.anchor = anchor;
    s.offset.copy(offset);
    s.size = size;
    s.mesh.quaternion.setFromUnitVectors(Z, normal);
    s.material.uniforms.uColor.value.set(...color);
  }

  /** Reacts to physics events. Returns a 0..1 "drama" value for camera shake & audio. */
  handle(ev: SimEvent, budget: number, cameraPos: THREE.Vector3): number {
    const contact = new THREE.Vector3(ev.position.x, ev.position.y, ev.position.z).multiplyScalar(RENDER_SCALE);
    const normal = new THREE.Vector3(ev.normal.x, ev.normal.y, ev.normal.z);
    if (normal.lengthSq() < 1e-8) normal.set(0, 1, 0);
    normal.normalize();
    const victim = Math.max(ev.victimScale, ev.scale * 0.2) * RENDER_SCALE;
    const big = ev.scale * RENDER_SCALE;
    const k = Math.min(3, Math.max(0.15, ev.intensity * 2 + 0.3));
    const dist = cameraPos.distanceTo(contact);
    const closeness = Math.min(1, (big * 25) / Math.max(dist, 1e-6));

    if (ev.type === 'absorb') {
      const bhPos = ev.survivorId ? frame.positions.get(ev.survivorId) : undefined;
      if (!bhPos) return 0;
      const anchor = this.allocAnchor(ev.survivorId, bhPos);
      const rel = contact.clone().sub(bhPos);
      const axis = rel.clone().cross(new THREE.Vector3(0, 1, 0)).lengthSq() > 1e-10 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const color = hexToLinear(ev.colors[0]);
      const n = Math.round(budget * 0.05);
      this.emit(n, anchor, (_i, start, vel) => {
        randomUnit(start).multiplyScalar(victim * (0.5 + Math.random() * 2.5)).add(rel);
        vel.copy(axis);
        return { life: 1.4 + Math.random() * 1.6, size: victim * (0.08 + Math.random() * 0.25), kind: 3, delay: Math.random() * 0.4 };
      });
      const g = this.ghosts.find((x) => !x.active) ?? this.ghosts[0];
      g.active = true;
      g.mesh.visible = true;
      g.start = frame.time;
      g.duration = 1.3;
      g.from.copy(rel);
      g.targetId = ev.survivorId ?? '';
      g.size = victim;
      g.material.uniforms.uColor.value.set(...color);
      flares.set(ev.survivorId ?? '', 1);
      frame.bloomBoost += 0.5;
      return 0.35 * closeness;
    }

    const anchorBody = ev.type === 'shatter' ? null : ev.survivorId;
    const anchorPos = (anchorBody && frame.positions.get(anchorBody)) || contact;
    const anchor = this.allocAnchor(anchorBody, anchorPos, ev.type === 'shatter' ? ev.velocity : undefined);
    const offset = contact.clone().sub(anchorPos);
    const shatter = ev.type === 'shatter';
    const scale = shatter ? big : victim;
    const energy = shatter ? 2.2 : k;

    // Remember where the survivor was hit, in its own rotating frame, for the molten glow.
    if (ev.survivorId) {
      const mesh = surfaceMeshes.get(ev.survivorId);
      if (mesh) {
        mesh.getWorldQuaternion(tmpQ).invert();
        impactDirs.set(ev.survivorId, normal.clone().applyQuaternion(tmpQ));
      }
      impactSizes.set(ev.survivorId, Math.min(1.6, Math.max(0.25, (ev.victimScale / Math.max(ev.scale, 1e-12)) * 1.4 + Math.min(0.6, ev.intensity * 0.4))));
    }

    const c0 = hexToLinear(ev.colors[0]);
    const count = Math.round(budget * (shatter ? 0.4 : 0.14 + 0.12 * Math.min(1.5, energy)));
    const tangentA = new THREE.Vector3().crossVectors(normal, Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const tangentB = new THREE.Vector3().crossVectors(normal, tangentA);
    this.emit(count, anchor, (i, start, vel) => {
      const r = Math.random();
      const kind = r < 0.62 ? 0 : r < 0.92 ? 1 : 2;
      start.copy(offset);
      if (shatter) {
        randomUnit(vel);
        start.addScaledVector(vel, scale * Math.random() * 0.8);
        vel.multiplyScalar(scale * (0.4 + Math.pow(Math.random(), 0.6) * 3.2));
      } else if (i % 3 === 0) {
        // Splash sheet: debris sprays sideways along the surface.
        const a = Math.random() * Math.PI * 2;
        vel.copy(tangentA).multiplyScalar(Math.cos(a)).addScaledVector(tangentB, Math.sin(a)).addScaledVector(normal, 0.25 + Math.random() * 0.4);
        vel.normalize().multiplyScalar(scale * (0.8 + Math.random() * 2.4) * (0.6 + energy * 0.4));
      } else {
        // Ejecta plume out of the impact site.
        randomUnit(vel).addScaledVector(normal, 1.4).normalize();
        vel.multiplyScalar(scale * (0.4 + Math.pow(Math.random(), 0.7) * 3.4) * (0.6 + energy * 0.4));
      }
      const life = kind === 2 ? 2 + Math.random() * 2 : kind === 1 ? 2.5 + Math.random() * 4 : 0.8 + Math.random() * 1.8;
      const size = scale * (kind === 2 ? 0.4 + Math.random() * 0.6 : kind === 1 ? 0.05 + Math.random() * 0.12 : 0.025 + Math.random() * 0.06);
      return { life, size, kind };
    });

    const flashColor: [number, number, number] = [1, 0.62 + 0.15 * c0[1], 0.3];
    this.flash(anchor, offset, scale * (shatter ? 7 : 2.6 + 1.6 * Math.min(1.5, energy)), flashColor, shatter ? 1.1 : 0.65);
    this.shock(anchor, offset, normal, scale * (shatter ? 9 : 3 + 1.8 * Math.min(1.5, energy)), [1, 0.45, 0.14], shatter ? 1.6 : 1.15);
    if (shatter) this.shock(anchor, offset, tangentA, scale * 6.5, [1, 0.62, 0.3], 1.8, 0.08);
    frame.bloomBoost += shatter ? 1.6 : 0.4 + 0.5 * Math.min(1.5, energy);
    return Math.min(1, (shatter ? 1 : 0.35 + 0.4 * Math.min(1.5, energy)) * closeness);
  }

  update(pixelRatio: number, viewportHeight: number): void {
    // Anchors follow their body (or drift ballistically if it is gone).
    for (const a of this.anchors) {
      if (a.bodyId) {
        const p = frame.positions.get(a.bodyId);
        if (p) a.pos.copy(p);
        else a.bodyId = null;
      } else if (a.vel.lengthSq() > 0) {
        a.pos.addScaledVector(a.vel, frame.simDelta);
      }
    }
    const u = this.material.uniforms;
    u.uTime.value = frame.time;
    u.uPixelRatio.value = pixelRatio;
    u.uViewport.value = viewportHeight;

    if (this.dirty.length) {
      for (const attr of [this.aStart, this.aVel, this.aParams, this.aKind]) {
        attr.clearUpdateRanges();
        for (const [start, count] of this.dirty) attr.addUpdateRange(start * attr.itemSize, count * attr.itemSize);
        attr.needsUpdate = true;
      }
      this.dirty.length = 0;
    }

    for (const f of this.flashes) {
      if (!f.active) continue;
      const t = (frame.time - f.start) / f.duration;
      if (t >= 1) {
        f.active = false;
        f.mesh.visible = false;
        continue;
      }
      const attack = Math.min(1, t / 0.05);
      f.mesh.position.copy(this.anchors[f.anchor].pos).add(f.offset);
      f.material.uniforms.uSize.value = f.size * (0.6 + Math.sqrt(t) * 0.9);
      f.material.uniforms.uIntensity.value = attack * Math.pow(1 - t, 2.6) * 2.4;
    }
    for (const s of this.shocks) {
      if (!s.active) continue;
      const t = (frame.time - s.start) / s.duration;
      if (t < 0) continue;
      if (t >= 1) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.mesh.visible = true;
      const e = 1 - Math.pow(1 - t, 3);
      s.mesh.position.copy(this.anchors[s.anchor].pos).add(s.offset);
      s.mesh.scale.setScalar(s.size * (0.15 + e * 0.85));
      s.material.uniforms.uT.value = t;
    }
    for (const g of this.ghosts) {
      if (!g.active) continue;
      const t = (frame.time - g.start) / g.duration;
      const target = frame.positions.get(g.targetId);
      if (t >= 1 || !target) {
        g.active = false;
        g.mesh.visible = false;
        continue;
      }
      const k = t * t;
      tmp.copy(g.from).multiplyScalar(1 - k);
      g.mesh.position.copy(target).add(tmp);
      const dir = g.from.clone().normalize();
      g.mesh.quaternion.setFromUnitVectors(Z, dir);
      const stretch = 1 + t * 6;
      g.mesh.scale.set(g.size * (1 - t * 0.85), g.size * (1 - t * 0.85), g.size * stretch);
      g.material.uniforms.uT.value = t;
    }
  }
}
