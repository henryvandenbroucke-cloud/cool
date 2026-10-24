// Townsfolk: walk in from the lane, browse lit shelves, pick things up, queue
// at the counter and pay. Regulars remember you; everyone is gentle.

import * as THREE from 'three';
import { placeable } from './assets.js';
import { audio } from './audio.js';
import { NavGrid } from './nav.js';
import { damp, rng, tween, ease } from './tween.js';
import { productMesh } from './products.js';
import { litMat } from './render.js';
import {
  REGULARS, GENERIC_MODELS, GENERIC_NAMES, GENERIC_WANTS, WEATHERS, SHIFT_SECONDS, LAST_ARRIVAL_HOUR,
} from './config.js';
import { keyMatches, buyChance, priceFor, marketPrice, productCategory, levelFor, addWish, clockHour, wishLabel, productName, coziness, cozyBonus, seasonFor } from './state.js';
import { LAYER_NO_INK } from './render.js';

const SPEED = 1.35;
const WALK_CLIP_SPEED = 1.15;   // ground speed the walk clip was animated for
const BAG_COLORS = ['#c9a77a', '#b85a4c', '#5f8f6c', '#d9c49e', '#6a7fa8', '#a8754c'];
const HEIGHT = 1.5;

function bubbleTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fffaf0';
  g.strokeStyle = '#d9c49e';
  g.lineWidth = 6;
  g.beginPath(); g.roundRect(10, 10, 236, 84, 34); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(112, 92); g.lineTo(128, 118); g.lineTo(144, 92); g.closePath(); g.fill();
  g.fillStyle = '#3b2a20';
  g.font = '600 46px Fredoka, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Customer {
  constructor(mgr, model, info) {
    this.mgr = mgr;
    this.root = model;
    this.info = info;          // { id?, name, regular, wants[] }
    this.basket = [];          // { key, price }
    this.path = [];
    this.state = 'arrive';
    this.timer = 0;
    this.speed = SPEED * (0.9 + Math.random() * 0.2);
    this.yaw = 0;
    this.mixer = new THREE.AnimationMixer(model.userData.model);
    this.actions = {};
    for (const clip of model.userData.animations || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.current = null;
    this.play('idle');
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    this.bubble.scale.set(0.5, 0.25, 1);
    this.bubble.position.y = HEIGHT + 0.25;
    this.bubble.layers.set(LAYER_NO_INK);
    this.root.add(this.bubble);
    this.bubbleT = 0;
    this.patience = 0;
    this.v = 0;
    this.t = Math.random() * 10;
    // a tote bag on the shoulder; what they pick up goes in here
    this.bag = makeBag(BAG_COLORS[Math.floor(Math.random() * BAG_COLORS.length)]);
    const half = (model.userData.size?.x ?? 0.4) / 2;
    this.bag.position.set(Math.min(0.32, half * 0.85 + 0.05), HEIGHT * 0.36, 0.02);
    this.root.add(this.bag);
  }

  get pos() { return this.root.position; }

  play(name, { fade = 0.25, once = false } = {}) {
    const a = this.actions[name];
    if (!a || this.current === a) return a;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.setEffectiveWeight(1);
    if (this.current) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    return a;
  }

  say(text, secs = 2.2) {
    this.bubble.material.map?.dispose();
    this.bubble.material.map = bubbleTexture(text);
    this.bubble.material.needsUpdate = true;
    this.bubbleT = secs;
  }

  walkTo(target, then) {
    this.path = this.mgr.nav.find(this.pos, target);
    this.onArrive = then;
    this.play('walk');
  }

  walkPoints(points, then) {
    this.path = points.map((p) => p.clone());
    this.onArrive = then;
    this.play('walk');
  }

  face(target, dt, rate = 6) {
    const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    let d = want - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-rate * dt));
    this.root.rotation.y = this.yaw;
  }

  update(dt) {
    this.t += dt;
    const walking = this.current === this.actions.walk;
    if (!walking || !this.path.length) this.v = damp(this.v, 0, 8, dt);
    if (this.actions.walk) this.actions.walk.timeScale = Math.max(0.4, this.v / WALK_CLIP_SPEED);
    this.bag.rotation.z = Math.sin(this.t * 8.5) * 0.09 * Math.min(1, this.v);
    if (this.bag.userData.bounce > 0) { this.bag.userData.bounce = Math.max(0, this.bag.userData.bounce - dt * 4); this.bag.position.y = HEIGHT * 0.36 - Math.sin(this.bag.userData.bounce * Math.PI) * 0.03; }
    this.bag.rotation.x = Math.sin(this.t * 4.25) * 0.05 * Math.min(1, this.v);
    this.mixer.update(dt);
    if (this.bubbleT > 0) {
      this.bubbleT -= dt;
      this.bubble.material.opacity = damp(this.bubble.material.opacity, this.bubbleT > 0.3 ? 1 : 0, 10, dt);
      this.bubble.position.y = HEIGHT + 0.25 + Math.sin(this.bubbleT * 3) * 0.015;
    } else this.bubble.material.opacity = damp(this.bubble.material.opacity, 0, 10, dt);

    if (this.path.length) {
      const target = this.path[0];
      const to = new THREE.Vector3(target.x - this.pos.x, 0, target.z - this.pos.z);
      const dist = to.length();
      if (dist < 0.08) {
        this.path.shift();
        if (!this.path.length) {
          this.play('idle');
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        // pause politely if the player is right in the way
        const p = this.mgr.playerPos;
        const ahead = to.clone().normalize();
        const toP = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
        const blockedByPlayer = toP.length() < 0.62 && toP.dot(ahead) > 0.25;
        if (blockedByPlayer) {
          this.play('idle');
          this.blockedT = (this.blockedT || 0) + dt;
          if (this.blockedT > 1.2 && this.bubbleT <= 0) { this.say('Excuse me!', 1.6); this.blockedT = -3; }
        } else {
          this.play('walk');
          this.blockedT = 0;
          // ease into a stroll and slow down for the final step instead of snapping
          const want = Math.min(this.speed, 0.35 + dist * 2.2 * (this.path.length > 1 ? 4 : 1));
          this.v = damp(this.v, want, 5, dt);
          const step = Math.min(dist, this.v * dt);
          this.pos.addScaledVector(ahead, step);
          this.face(target, dt, 7);
        }
      }
    }
    this.mgr.think(this, dt);
  }
}

export class Customers {
  constructor(scene, world, shelves, getState, hooks) {
    this.scene = scene;
    this.world = world;
    this.shelves = shelves;
    this.getState = getState;
    this.hooks = hooks;          // { onCounter(c), onSale(...), toast(text) }
    this.list = [];
    this.queue = [];
    this.nav = new NavGrid(world.colliders);
    this.schedule = [];
    this.playerPos = new THREE.Vector3();
    this.r = rng(Date.now() & 0xffff);
    this.modelCache = new Map();
    this.counterItems = [];
    this.pending = 0;
  }

  async preload() {
    const all = new Set([...GENERIC_MODELS, ...Object.values(REGULARS).map((r) => r.model)]);
    await Promise.all([...all].map((m) => placeable(`people/${m}.glb`, { height: HEIGHT })));
  }

  planNight(s) {
    const lv = levelFor(s.xp);
    const weatherBoost = s.weather === 'clear' ? 1 : 0.9;
    const festival = s.festival === 'tonight';
    const cozy = Math.floor(coziness(s) / 8);
    const base = (15 + lv * 4 + Math.min(10, s.night * 1.5) + cozy) * weatherBoost * (festival ? 1.4 : 1);
    const total = Math.min(festival ? 56 : 44, Math.round(base));
    // on festival night every regular comes by
    const regs = Object.entries(REGULARS).filter(([, r]) => festival || r.from <= s.night).map(([id]) => id).filter(() => festival || this.r() < 0.8);
    const arrivals = [];
    const last = ((LAST_ARRIVAL_HOUR + 24 - 18) / 12) * SHIFT_SECONDS;
    // the evening rush is a little busier than the small hours
    for (let i = 0; i < total; i++) arrivals.push({ at: 5 + Math.pow(this.r(), 1.15) * (last - 5), regular: null });
    regs.forEach((id, i) => { if (arrivals[i]) arrivals[i].regular = id; });
    arrivals.sort((a, b) => a.at - b.at);
    // the very first visitor of the very first night arrives promptly
    if (s.night === 1 && arrivals[0]) { arrivals[0].at = 4; arrivals[0].regular = 'mira'; }
    this.schedule = arrivals;
    this.usedNames = new Set();
  }

  clearAll() {
    for (const c of this.list) this.scene.remove(c.root);
    this.list = [];
    this.queue = [];
    this.schedule = [];
    for (const it of this.counterItems) it.mesh.parent?.remove(it.mesh);
    this.counterItems = [];
  }

  inside() { return this.pending + this.list.filter((c) => c.state !== 'leave').length; }

  async spawn(entry) {
    const s = this.getState();
    let info;
    if (entry.regular) {
      const R = REGULARS[entry.regular];
      const wants = shuffle(R.wants.slice(), this.r).slice(0, 1 + Math.floor(this.r() * 2));
      info = { id: entry.regular, name: R.name, regular: entry.regular, wants, model: R.model };
    } else {
      let name;
      do { name = GENERIC_NAMES[Math.floor(this.r() * GENERIC_NAMES.length)]; } while (this.usedNames.has(name) && this.usedNames.size < GENERIC_NAMES.length);
      this.usedNames.add(name);
      const weather = WEATHERS[s.weather]?.demand || {};
      const season = seasonFor(s.night).demand || {};
      const pool = GENERIC_WANTS.flatMap((w) => { const k = w.split(':')[0]; return Array(Math.round((weather[k] || 1) * (season[k] || 1) * 2)).fill(w); });
      const n = 1 + Math.floor(this.r() * 2.3);
      const wants = [];
      for (let i = 0; i < n; i++) wants.push(pool[Math.floor(this.r() * pool.length)]);
      info = { name, regular: null, wants: [...new Set(wants)], model: GENERIC_MODELS[Math.floor(this.r() * GENERIC_MODELS.length)] };
    }
    this.pending++;
    const model = await placeable(`people/${info.model}.glb`, { height: HEIGHT }).finally(() => { this.pending--; });
    if (this.getState() !== s) return; // the save changed while loading
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const c = new Customer(this, model, info);
    const fromLeft = this.r() < 0.5;
    const laneZ = this.world.village.laneZ;
    c.pos.set(fromLeft ? -15 : 15, 0, laneZ + (this.r() - 0.5) * 0.8);
    this.scene.add(model);
    this.list.push(c);
    s.tonight.customers++;
    s.stats.customers++;
    c.walkPoints([new THREE.Vector3(2.9 + (this.r() - 0.5) * 0.6, 0, laneZ), new THREE.Vector3(2.9, 0, 11.3)], () => {
      c.walkTo(this.world.shop.anchors.inside.clone(), () => this.startBrowsing(c));
    });
    c.state = 'arrive';
    if (entry.regular && !s.met.includes(entry.regular)) { s.met.push(entry.regular); c.firstVisit = true; }
  }

  startBrowsing(c) {
    c.state = 'browse';
    if (c.firstVisit) c.say('Oh! It’s open!', 2.2);
    else if (c.info.regular) c.say(['Evening!', 'Hello again!', 'Lovely glow.'][Math.floor(this.r() * 3)], 1.8);
    this.nextWant(c);
  }

  nextWant(c) {
    const want = c.info.wants.shift();
    if (!want) { this.finishBrowsing(c); return; }
    const found = this.shelves.findStock((k) => keyMatches(k, want));
    if (!found.length) {
      c.missed = (c.missed || []).concat(want);
      const s = this.getState();
      s.tonight.missed++;
      if (c.info.regular || this.r() < 0.5) addWish(s, c.info.name, want);
      // wander to a random shelf to look anyway, then move on
      const any = [...this.shelves.sections.values()];
      const sec = any[Math.floor(this.r() * any.length)];
      c.walkTo(sec.customerSpot.clone(), () => {
        c.say('Hmm…', 1.6);
        c.lookAt = sec.holder.getWorldPosition(new THREE.Vector3());
        c.timer = 1.3;
        c.state = 'ponder';
        c.after = () => this.nextWant(c);
      });
      return;
    }
    // nearest matching section
    found.sort((a, b) => a.sec.customerSpot.distanceTo(c.pos) - b.sec.customerSpot.distanceTo(c.pos));
    const pick = found[0];
    c.walkTo(pick.sec.customerSpot.clone(), () => {
      c.lookAt = pick.sec.holder.getWorldPosition(new THREE.Vector3());
      c.state = 'ponder';
      c.timer = 0.9 + this.r() * 0.9;
      c.after = () => this.decide(c, pick.id);
    });
  }

  decide(c, sectionId) {
    const s = this.getState();
    const d = s.sections[sectionId];
    if (!d || d.count <= 0) { this.nextWant(c); return; }
    const price = priceFor(s, d.key);
    const market = marketPrice(d.key);
    const weatherMul = WEATHERS[s.weather]?.demand?.[productCategory(d.key)] || 1;
    const seasonMul = seasonFor(s.night).demand?.[productCategory(d.key)] || 1;
    const bonus = (c.info.regular ? 0.05 + (s.rep[c.info.regular] || 0) / 1000 : 0) + (weatherMul - 1) * 0.2 + (seasonMul - 1) * 0.15 + cozyBonus(s);
    if (this.r() <= buyChance(price, market, bonus)) {
      c.play('pick-up', { once: true, fade: 0.15 });
      audio.play(d.key.startsWith('lamp') || d.key.includes('jar') ? 'place_glass' : 'place_wood', { pos: c.pos, volume: 0.5 });
      const sec = this.shelves.sections.get(sectionId);
      const from = sec.holder.getWorldPosition(new THREE.Vector3());
      const taken = this.shelves.take(sectionId);
      c.basket.push({ key: taken.key, price });
      this.intoBag(c, taken.key, from);
      if (price / market <= 0.95 && this.r() < 0.5) c.say('♥', 1.4);
      c.state = 'ponder';
      c.timer = 0.9;
      c.after = () => this.nextWant(c);
    } else {
      s.tonight.pricey++;
      c.say('A bit pricey…', 2);
      c.play('emote-no', { once: true });
      c.state = 'ponder';
      c.timer = 1.4;
      c.after = () => this.nextWant(c);
    }
  }

  /** The picked item arcs from the shelf into the customer's bag. */
  intoBag(c, key, from) {
    const item = productMesh(key, { on: false });
    item.position.copy(from);
    item.scale.setScalar(0.001);
    this.scene.add(item);
    tween({
      duration: 0.6, delay: 0.25, easing: ease.inOutCubic,
      update: (k) => {
        const to = c.bag.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
        item.position.lerpVectors(from, to, k);
        item.position.y += Math.sin(k * Math.PI) * 0.25;
        item.scale.setScalar(k < 0.15 ? k / 0.15 : 1 - (k - 0.15) * 0.55);
        item.rotation.y = k * 3;
      },
      done: () => {
        item.parent?.remove(item);
        audio.play('paper', { pos: c.pos, volume: 0.35 });
        const n = c.basket.length;
        c.bag.userData.body.scale.set(1 + n * 0.05, 1, 1 + n * 0.12);
        c.bag.userData.bounce = 1;
      },
    });
  }

  finishBrowsing(c) {
    if (!c.basket.length) {
      c.say(c.missed?.length ? `No ${wishLabel(c.missed[0])}?` : 'Maybe next time', 2.4);
      this.leave(c);
      return;
    }
    c.state = 'queue';
    this.queue.push(c);
    this.advanceQueue();
  }

  advanceQueue() {
    const anchors = this.world.shop.anchors.queue;
    this.queue.forEach((c, i) => {
      const spot = anchors[Math.min(i, anchors.length - 1)].clone();
      if (i >= anchors.length) spot.x -= (i - anchors.length + 1) * 0.6;
      if (c.queueSpot && c.queueSpot.distanceTo(spot) < 0.05) return;
      c.queueSpot = spot;
      c.walkTo(spot, () => {
        if (this.queue[0] === c && c.state === 'queue') this.arriveCounter(c);
        else c.lookAt = this.world.shop.anchors.counterDrop.clone();
      });
    });
  }

  arriveCounter(c) {
    c.state = 'pay';
    c.lookAt = this.world.shop.anchors.counterDrop.clone();
    c.play('interact-right', { once: true });
    // put the basket on the counter
    const drop = this.world.shop.anchors.counterDrop;
    c.basket.forEach((b, i) => {
      const mesh = this.hooks.makeCounterItem(b.key);
      mesh.position.set(drop.x + (i % 2) * 0.16 - 0.05, drop.y, drop.z - Math.floor(i / 2) * 0.18 + (i % 2) * 0.05 - 0.2);
      this.scene.add(mesh);
      this.counterItems.push({ mesh, customer: c, entry: b, scanned: false });
    });
    c.payWith = this.r() < 0.55 ? 'cash' : 'card';
    c.waitT = 0;
    this.hooks.onCounter?.(c);
  }

  /** Called by checkout once payment is done. */
  paid(c) {
    for (const it of this.counterItems.filter((x) => x.customer === c)) it.mesh.parent?.remove(it.mesh);
    this.counterItems = this.counterItems.filter((x) => x.customer !== c);
    this.queue = this.queue.filter((x) => x !== c);
    c.play('emote-yes', { once: true });
    c.say(c.info.regular ? ['Thank you, dear!', 'See you soon!', 'Perfect.'][Math.floor(this.r() * 3)] : 'Thank you!', 2);
    c.state = 'thanks';
    c.timer = 1.1;
    c.after = () => this.leave(c);
    this.queue.forEach((q) => { q.queueSpot = null; });
    this.advanceQueue();
  }

  leave(c) {
    c.state = 'leave';
    const laneZ = this.world.village.laneZ;
    const out = this.r() < 0.5 ? -36 : 36;
    c.walkTo(new THREE.Vector3(2.9, 0, 11.3), () => {
      c.walkPoints([new THREE.Vector3(2.9, 0, laneZ), new THREE.Vector3(out, 0, laneZ + (this.r() - 0.5))], () => this.despawn(c));
    });
  }

  despawn(c) {
    this.scene.remove(c.root);
    this.list = this.list.filter((x) => x !== c);
  }

  think(c, dt) {
    if (c.state === 'ponder' || c.state === 'thanks') {
      if (c.lookAt) c.face(c.lookAt, dt);
      c.timer -= dt;
      if (c.timer <= 0) { const a = c.after; c.after = null; c.state = 'busy'; a?.(); }
    } else if (c.state === 'queue' || c.state === 'pay') {
      if (!c.path.length && c.lookAt) c.face(c.lookAt, dt);
      if (c.state === 'pay') {
        c.waitT += dt;
        if (c.waitT > 22 && c.bubbleT <= 0) { c.say('…', 1.5); c.waitT = 12; }
      }
    }
  }

  update(dt, s, playerPos) {
    this.playerPos.copy(playerPos);
    if (s.phase === 'shift') {
      while (this.schedule.length && this.schedule[0].at <= s.clock && this.inside() < 7) {
        const e = this.schedule.shift();
        this.spawn(e);
      }
      if (clockHour(s, SHIFT_SECONDS) > LAST_ARRIVAL_HOUR && clockHour(s, SHIFT_SECONDS) < 12) this.schedule = [];
    }
    for (const c of this.list) c.update(dt);
    // soft push so the player never clips through people
    for (const c of this.list) {
      const dx = playerPos.x - c.pos.x, dz = playerPos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 && d > 1e-4) { playerPos.x += (dx / d) * (0.5 - d); playerPos.z += (dz / d) * (0.5 - d); }
    }
  }

  nearDoor() {
    return this.list.some((c) => Math.hypot(c.pos.x - 2.9, c.pos.z - 4.1) < 1.5);
  }

  current() { return this.queue[0] && this.queue[0].state === 'pay' ? this.queue[0] : null; }

  describe(c) {
    return `${c.info.name}${c.info.regular ? ', ' + REGULARS[c.info.regular].role : ''}`;
  }

  basketLabel(c) { return c.basket.map((b) => productName(b.key)).join(', '); }
}

function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function makeBag(color) {
  const g = new THREE.Group();
  const cloth = litMat({ color, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.07), cloth);
  body.position.y = -0.1;
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 16, Math.PI), cloth);
  strap.position.y = -0.005;
  g.add(body, strap);
  g.userData.body = body;
  return g;
}
