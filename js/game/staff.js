// Hired helpers. Wren minds the register; Bramble carries delivery boxes to
// matching shelves. Both only work during the night shift.

import * as THREE from 'three';
import { placeable } from './assets.js';
import { audio } from './audio.js';
import { STAFF } from './config.js';
import { parseKey, productName } from './state.js';
import { deliveryBox } from './products.js';

const HEIGHT = 1.5;

class Helper {
  constructor(game, id, root) {
    this.game = game;
    this.id = id;
    this.info = STAFF[id];
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root.userData.model);
    this.actions = {};
    for (const clip of root.userData.animations || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.path = [];
    this.yaw = 0;
    this.state = 'idle';
    this.timer = 1 + Math.random() * 2;
    this.play('idle');
  }

  get pos() { return this.root.position; }

  play(name, once = false) {
    const a = this.actions[name];
    if (!a || this.current === a) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.play();
    if (this.current) a.crossFadeFrom(this.current, 0.25, false);
    this.current = a;
  }

  walkTo(target, then) {
    this.path = this.game.customers.nav.find(this.pos, target);
    this.onArrive = then;
    this.play(this.carry ? 'holding-both' : 'walk');
  }

  face(target, dt) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-8 * dt));
    this.root.rotation.y = this.yaw;
  }

  update(dt) {
    this.mixer.update(dt);
    if (!this.path.length) return;
    const t = this.path[0];
    const to = new THREE.Vector3(t.x - this.pos.x, 0, t.z - this.pos.z);
    const d = to.length();
    if (d < 0.08) {
      this.path.shift();
      if (!this.path.length) { this.play(this.carry ? 'holding-both' : 'idle'); const cb = this.onArrive; this.onArrive = null; cb?.(); }
      return;
    }
    to.normalize();
    this.pos.addScaledVector(to, Math.min(d, 1.25 * dt));
    this.face(t, dt);
  }
}

export class Staff {
  constructor(game) {
    this.game = game;
    this.helpers = new Map();
  }

  async sync(state) {
    for (const [id, h] of this.helpers) if (!state.staff.includes(id)) { h.root.parent?.remove(h.root); this.helpers.delete(id); }
    for (const id of state.staff) {
      if (this.helpers.has(id)) continue;
      const root = await placeable(`people/${STAFF[id].model}.glb`, { height: HEIGHT });
      const h = new Helper(this.game, id, root);
      root.position.copy(id === 'wren' ? this.game.world.shop.anchors.playerBehindCounter : new THREE.Vector3(0.4, 0, -2.4));
      root.rotation.y = id === 'wren' ? -Math.PI / 2 : 0;
      h.yaw = root.rotation.y;
      this.game.scene.add(root);
      this.helpers.set(id, h);
    }
  }

  clear() { for (const h of this.helpers.values()) h.root.parent?.remove(h.root); this.helpers.clear(); }

  update(dt) {
    const s = this.game.state;
    for (const h of this.helpers.values()) {
      h.update(dt);
      if (h.id === 'wren') this.cashier(h, dt, s);
      else this.restocker(h, dt, s);
    }
  }

  // ---------- Wren: rings up whoever is at the counter ----------
  cashier(h, dt, s) {
    const spot = this.game.world.shop.anchors.playerBehindCounter;
    if (!h.path.length && h.pos.distanceTo(spot) > 0.2) h.walkTo(spot.clone());
    if (h.path.length) return;
    h.face(this.game.world.shop.anchors.counterDrop, dt);
    const c = this.game.customers.current();
    if (!c || s.phase !== 'shift') { h.serving = null; h.timer = 1.2; return; }
    if (h.serving !== c) { h.serving = c; h.timer = 2.2; }
    // the player is busy elsewhere: Wren takes over after a short pause
    const playerAtCounter = this.game.player.pos.distanceTo(spot) < 1.2 || this.game.ui.panelOpen;
    if (playerAtCounter) return;
    h.timer -= dt;
    const items = this.game.customers.counterItems.filter((x) => x.customer === c && !x.scanned);
    if (h.timer <= 0) {
      if (items.length) { this.game.scanItem(items[0].mesh, true); h.play('interact-right', true); h.timer = 0.7; }
      else { h.play('emote-yes', true); this.game.completeSale(c, { by: 'Wren' }); h.serving = null; h.timer = 1.5; }
    }
  }

  // ---------- Bramble: carries boxes to shelves that match ----------
  restocker(h, dt, s) {
    if (s.phase !== 'shift' && !h.job) {
      const home = new THREE.Vector3(0.4, 0, -2.4);
      if (!h.path.length && h.pos.distanceTo(home) > 0.3) h.walkTo(home);
      return;
    }
    if (h.path.length || h.busy) return;
    h.timer -= dt;
    if (h.timer > 0) return;
    if (!h.job) {
      const box = s.boxes.find((b) => b.at !== 'held' && parseKey(b.key).kind === 'stock' && b.count > 0 && !b.claimed && this.targetFor(b.key));
      if (!box) { h.timer = 3; return; }
      box.claimed = true;
      h.job = { box };
      const mesh = this.game.boxMeshes.get(box.id);
      const where = mesh ? mesh.position.clone() : new THREE.Vector3(4, 0, 5);
      h.walkTo(where.setY(0), () => this.pickUp(h));
      return;
    }
  }

  targetFor(key) {
    const sh = this.game.shelves;
    for (const [id] of sh.sections) if (sh.data(id)?.key === key && sh.space(id, key) > 0) return id;
    for (const [id] of sh.sections) if (!sh.data(id) && !id.startsWith('S-')) return id;
    return null;
  }

  pickUp(h) {
    const { box } = h.job;
    const mesh = this.game.boxMeshes.get(box.id);
    if (!mesh || box.at === 'held' || !this.game.state.boxes.includes(box)) { box.claimed = false; h.job = null; h.timer = 1; return; }
    mesh.parent?.remove(mesh);
    box.at = 'staff';
    h.carry = deliveryBox(box.key, { open: true });
    h.carry.scale.setScalar(0.7);
    h.carry.position.set(0, 0.62, 0.28);
    h.root.add(h.carry);
    h.play('holding-both');
    audio.play('box_soft', { pos: h.pos, volume: 0.5 });
    this.toShelf(h);
  }

  toShelf(h) {
    const { box } = h.job;
    const id = this.targetFor(box.key);
    if (!id) { this.dropBox(h); return; }
    const sec = this.game.shelves.sections.get(id);
    h.walkTo(sec.customerSpot.clone(), () => this.stock(h, id));
  }

  stock(h, id) {
    const { box } = h.job;
    const sh = this.game.shelves;
    h.busy = true;
    let n = 0;
    const step = () => {
      if (box.count > 0 && sh.add(id, box.key)) {
        box.count--; n++;
        audio.play('place_wood', { pos: h.pos, volume: 0.35 });
        setTimeout(step, 450);
        return;
      }
      h.busy = false;
      if (box.count <= 0) {
        // empty: flatten it
        h.root.remove(h.carry);
        h.carry = null;
        this.game.state.boxes = this.game.state.boxes.filter((b) => b !== box);
        this.game.boxMeshes.delete(box.id);
        audio.play('paper', { pos: h.pos, volume: 0.4 });
        h.job = null;
        h.play('idle');
        h.timer = 1.5;
        if (n) this.game.onStaffStocked?.(productName(box.key), n);
      } else this.toShelf(h);
    };
    step();
  }

  dropBox(h) {
    const { box } = h.job;
    h.root.remove(h.carry);
    h.carry = null;
    box.at = 'floor';
    box.claimed = false;
    box.pos = [h.pos.x, 0, h.pos.z, h.yaw];
    this.game.spawnBox(box, false);
    h.job = null;
    h.play('idle');
    h.timer = 6;
  }

  /** Save-safe: any box a helper is carrying goes back on the floor. */
  releaseAll() {
    for (const h of this.helpers.values()) if (h.job) { if (h.carry) this.dropBox(h); else { h.job.box.claimed = false; h.job = null; } }
  }
}

