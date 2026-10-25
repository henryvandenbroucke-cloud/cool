// First-person body: soft acceleration, circle-vs-box collision, gentle head
// bob with real footsteps, and a springy hand that carries boxes.

import * as THREE from 'three';
import { damp, clamp, ease, tween } from './tween.js';
import { audio } from './audio.js';

const EYE = 1.62;
const RADIUS = 0.28;

export class Player {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.pos = new THREE.Vector3(3.4, 0, 2.6);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.85;
    this.pitch = -0.08;
    this.bob = 0;
    this.bobAmp = 0;
    this.stepPhase = 0;
    this.headBob = true;
    this.frozen = false;
    this.override = null;   // { pos, look } when focusing a bench
    this.overrideK = 0;
    this.hand = new THREE.Group();
    this.hand.position.set(0.0, -0.42, -0.62);
    camera.add(this.hand);
    this.handSway = new THREE.Vector2();
    this.handLift = 0;
    this.camPos = new THREE.Vector3();
    this.camQuat = new THREE.Quaternion();
  }

  get inside() { return this.pos.z < 4.05 && this.pos.x > -5 && this.pos.x < 5; }
  get inStudio() { return this.pos.z < -4.1 && this.pos.x > 1.3 && this.pos.x < 5.1; }

  update(dt, input) {
    const look = input.consumeLook();
    if (!this.frozen && !this.override) {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch - look.y, -1.35, 1.25);
    }
    const speed = input.sprint ? 3.4 : 2.3;
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3();
    if (!this.frozen && !this.override) want.addScaledVector(f, -input.move.z).addScaledVector(r, input.move.x).multiplyScalar(speed);
    this.vel.x = damp(this.vel.x, want.x, 10, dt);
    this.vel.z = damp(this.vel.z, want.z, 10, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();

    const moving = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmp = damp(this.bobAmp, moving > 0.3 ? Math.min(1, moving / 2.3) : 0, 8, dt);
    if (moving > 0.3) {
      const prev = this.stepPhase;
      this.stepPhase += dt * moving * 2.15;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPhase / Math.PI)) {
        const wood = this.inside || (this.pos.z < 6.4 && this.pos.x > 0.9 && this.pos.x < 5.3);
        audio.play(wood ? 'step_wood' : 'step_grass', { volume: wood ? 0.32 : 0.4, jitter: 0.08 });
        if (wood && Math.random() < 0.08) audio.play('creak', { volume: 0.18, pos: this.pos });
      }
    }
    const bobY = this.headBob ? Math.abs(Math.sin(this.stepPhase)) * 0.035 * this.bobAmp : 0;
    const bobX = this.headBob ? Math.sin(this.stepPhase) * 0.018 * this.bobAmp : 0;

    // camera pose, optionally blended toward a workbench focus
    const free = new THREE.Vector3(this.pos.x, EYE + bobY, this.pos.z);
    const qFree = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, bobX * 0.6, 'YXZ'));
    this.overrideK = damp(this.overrideK, this.override ? 1 : 0, 5, dt);
    if (this.overrideK > 0.001 && (this.override || this.lastOverride)) {
      const o = this.override || this.lastOverride;
      const m = new THREE.Matrix4().lookAt(o.pos, o.look, new THREE.Vector3(0, 1, 0));
      const qO = new THREE.Quaternion().setFromRotationMatrix(m);
      const k = ease.inOutSine(this.overrideK);
      this.camera.position.lerpVectors(free, o.pos, k);
      this.camera.quaternion.slerpQuaternions(qFree, qO, k);
      if (this.override) this.lastOverride = this.override;
    } else {
      this.camera.position.copy(free);
      this.camera.quaternion.copy(qFree);
    }

    // springy hand: lags behind look motion a touch
    this.handSway.x = damp(this.handSway.x, clamp(look.x * 3, -0.08, 0.08), 9, dt);
    this.handSway.y = damp(this.handSway.y, clamp(look.y * 3, -0.06, 0.06), 9, dt);
    this.hand.position.set(this.handSway.x + bobX * 0.6, -0.42 - bobY * 0.4 + this.handSway.y - (1 - this.handLift) * 0.5, -0.62);
    this.hand.rotation.set(0.04 + this.handSway.y, this.handSway.x * 2, 0);
    this.hand.visible = this.handLift > 0.02 && this.overrideK < 0.5;
  }

  liftHand(on) {
    const from = this.handLift;
    const to = on ? 1 : 0;
    tween({ duration: on ? 0.34 : 0.22, easing: on ? ease.outBack : ease.outCubic, update: (k) => { this.handLift = from + (to - from) * k; } });
  }

  collide() {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of this.world.colliders) {
        const cx = clamp(this.pos.x, c.minX, c.maxX);
        const cz = clamp(this.pos.z, c.minZ, c.maxZ);
        const dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < RADIUS * RADIUS) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            this.pos.x = cx + (dx / d) * RADIUS;
            this.pos.z = cz + (dz / d) * RADIUS;
          } else {
            // centre inside the box: push out along the shallowest axis
            const pushes = [[c.minX - RADIUS - this.pos.x, 0], [c.maxX + RADIUS - this.pos.x, 0], [0, c.minZ - RADIUS - this.pos.z], [0, c.maxZ + RADIUS - this.pos.z]];
            pushes.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
            this.pos.x += pushes[0][0];
            this.pos.z += pushes[0][1];
          }
        }
      }
    }
    // never leave the yard
    this.pos.x = clamp(this.pos.x, -6.8, 6.8);
    const studioColumn = this.pos.x > 1.5 && this.pos.x < 4.9 && this.world.studioOpen;
    this.pos.z = clamp(this.pos.z, studioColumn ? -7.55 : -3.75, 10.3);
  }

  focus(view) { this.override = view; }
  unfocus() { this.override = null; }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }
}
