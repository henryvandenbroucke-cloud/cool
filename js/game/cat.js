// The shop cat. Wanders between cozy spots, naps, and purrs when petted.

import * as THREE from 'three';
import { placeable } from './assets.js';
import { audio } from './audio.js';
import { damp } from './tween.js';
import { LAYER_NO_INK } from './render.js';

export class Cat {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.state = 'nap';
    this.timer = 6;
    this.target = null;
    this.yaw = 0;
    this.hearts = [];
  }

  async build() {
    this.root = await placeable('pets/animal-cat.glb', { height: 0.42 });
    const spots = this.world.shop.anchors.catSpots;
    this.root.position.copy(spots[0]);
    this.scene.add(this.root);
    this.mixer = new THREE.AnimationMixer(this.root.userData.model);
    this.actions = {};
    for (const clip of this.root.userData.animations || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.play('idle');
    const hb = this.world.hit(new THREE.BoxGeometry(0.5, 0.45, 0.5), new THREE.Vector3(0, 0.22, 0), { type: 'cat' });
    this.root.add(hb);
    const tex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'); g.fillStyle = '#ff8a8a'; g.font = '52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♥', 32, 36);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    this.heartMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }

  play(name) {
    const a = this.actions[name] || this.actions.idle;
    if (!a || this.current === a) return;
    a.reset().play();
    if (this.current) a.crossFadeFrom(this.current, 0.3, false);
    this.current = a;
  }

  pet() {
    audio.play('cat_mewpurr', { pos: this.root.position, volume: 0.8 });
    this.purr = audio.loop('purr_loop', { volume: 0.55, pos: this.root.position });
    this.purrT = 4;
    this.state = 'petted';
    this.timer = 4;
    this.play('gesture-positive');
    for (let i = 0; i < 4; i++) {
      const h = new THREE.Sprite(this.heartMat.clone());
      h.layers.set(LAYER_NO_INK);
      h.scale.setScalar(0.13);
      h.position.copy(this.root.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.45, (Math.random() - 0.5) * 0.3));
      h.userData.life = 1.4 + i * 0.25;
      h.userData.vx = (Math.random() - 0.5) * 0.15;
      this.scene.add(h);
      this.hearts.push(h);
    }
  }

  update(dt, playerPos, nearLamp = false) {
    if (!this.root) return;
    this.mixer.update(dt);
    this.timer -= dt;
    const pos = this.root.position;
    if (this.state === 'walk' && this.target) {
      const wp = this.path?.length ? this.path[0] : this.target;
      const to = new THREE.Vector3(wp.x - pos.x, 0, wp.z - pos.z);
      const d = to.length();
      if (d < 0.05 && this.path?.length > 1) {
        this.path.shift();
      } else if (d < 0.05) {
        this.state = Math.random() < 0.6 ? 'nap' : 'sit';
        this.timer = 8 + Math.random() * 14;
        this.play(this.state === 'nap' ? 'idle' : 'idle');
      } else {
        to.normalize();
        pos.addScaledVector(to, Math.min(d, dt * 0.55));
        const want = Math.atan2(to.x, to.z);
        let dy = want - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-8 * dt));
        this.root.rotation.y = this.yaw;
      }
    } else if (this.timer <= 0) {
      const spots = this.world.shop.anchors.catSpots;
      // sometimes come and sit near you
      const nearPlayer = Math.random() < 0.25 && playerPos.z < 3.8;
      this.target = nearPlayer ? new THREE.Vector3(playerPos.x + 0.6, 0, playerPos.z + 0.3) : spots[Math.floor(Math.random() * spots.length)].clone();
      this.target.x = Math.max(-4.5, Math.min(4.4, this.target.x));
      this.target.z = Math.max(-3.0, Math.min(3.5, this.target.z));
      this.path = this.nav ? this.nav.find(pos, this.target) : [this.target];
      this.state = 'walk';
      this.play('walk');
      if (Math.random() < 0.25) audio.play('cat_mew', { pos, volume: 0.5 });
    }
    if (this.state === 'nap') this.root.scale.y = damp(this.root.scale.y, 0.92 + Math.sin(performance.now() / 900) * 0.015, 3, dt);
    else this.root.scale.y = damp(this.root.scale.y, 1, 6, dt);
    if (this.purr) {
      this.purr.move(pos);
      this.purrT -= dt;
      if (this.purrT <= 0) { this.purr.stop(1.2); this.purr = null; }
    }
    for (const h of this.hearts) {
      h.userData.life -= dt;
      h.position.y += dt * 0.35;
      h.position.x += h.userData.vx * dt;
      h.material.opacity = Math.max(0, Math.min(1, h.userData.life));
    }
    this.hearts = this.hearts.filter((h) => { if (h.userData.life <= 0) { this.scene.remove(h); return false; } return true; });
    void nearLamp;
  }
}
