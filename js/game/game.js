// The orchestrator: owns the save, wires the systems together, and turns
// what you look at + click into shop actions.

import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Shelves } from './shelves.js';
import { Customers } from './customers.js';
import { Crafting } from './crafting.js';
import { Cat } from './cat.js';
import { UI, money } from './ui.js';
import { audio } from './audio.js';
import { deliveryBox, setBoxOpen, productMesh, updateFlames } from './products.js';
import { tween, tickTweens, ease, damp, popIn } from './tween.js';
import { SHIFT_SECONDS, SUPPLIES, REGULARS, WEATHERS } from './config.js';
import {
  parseKey, productName, save, startShift, endShift, clockHour, formatHour, recordSale, fulfilWishes,
  levelFor, priceFor, bumpRep,
} from './state.js';

const TUTORIAL = [
  'A delivery is waiting on the porch — walk outside and <b>click a box</b> to pick it up.',
  'Carry it to a shelf and <b>click</b> to stock it, one item at a time. <b>Right-click</b> takes one back.',
  'Click a <b>price tag</b> to set prices. Carry the <b>Candle Supplies</b> box to the bench at the back to make candles.',
  'When you’re ready, flip the <b>sign on the door</b> to OPEN.',
  'Townsfolk bring things to the counter. <b>Click each item</b> to ring it up, then <b>click the register</b>.',
];

export class Game {
  constructor({ renderer, post, scene, camera, input, state }) {
    this.renderer = renderer;
    this.post = post;
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.state = state;
    this.world = new World(scene);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(2);
    this.raycaster.far = 2.7;
    this.boxMeshes = new Map();
    this.held = null;
    this.target = null;
    this.photo = { on: false, filter: 0 };
    this.saveT = 0;
    this.hourVis = 17;
    this.running = false;
  }

  async build(onProgress) {
    await this.world.build((k) => onProgress?.(k * 0.75));
    this.player = new Player(this.camera, this.world);
    this.scene.add(this.camera);
    this.ui = new UI({ getState: () => this.state, input: this.input });
    this.shelves = new Shelves(this.world, this.state);
    this.customers = new Customers(this.scene, this.world, this.shelves, () => this.state, {
      makeCounterItem: (key) => this.counterItemMesh(key),
      onCounter: (c) => this.onCounter(c),
    });
    await this.customers.preload();
    onProgress?.(0.88);
    this.crafting = new Crafting({ world: this.world, getState: () => this.state, player: this.player, input: this.input, ui: this.ui, onCrafted: (key, stars) => this.onCrafted(key, stars) });
    this.cat = new Cat(this.scene, this.world);
    await this.cat.build();
    this.cat.nav = this.customers.nav;
    onProgress?.(0.96);
    this.ui.onOrder = (boxes) => { for (const b of boxes) this.spawnBox(b, true); save(this.state); };
    this.ui.onLicence = () => { this.crafting.updateCrates(); save(this.state); };
    this.ui.onQuit = () => this.onQuit?.();
    this.ui.onPhoto = () => this.togglePhoto();
    this.ui.onSettings = () => this.saveSettings();
    this.bindInput();
    this.loadSettings();
    onProgress?.(1);
  }

  /** (Re)apply a save to the world. */
  applyState(state) {
    this.state = state;
    this.shelves.setState(state);
    for (const m of this.boxMeshes.values()) m.parent?.remove(m);
    this.boxMeshes.clear();
    this.dropHeld(true);
    for (const b of state.boxes) this.spawnBox(b, false);
    this.world.setLit(state.lit);
    this.world.setWeather(state.phase === 'shift' ? state.weather : 'clear');
    this.customers.clearAll();
    this.crafting.updateCrates();
    this.updateSign();
    this.updatePins();
    this.player.pos.copy(this.world.shop.anchors.playerStart);
    this.player.yaw = Math.PI * 0.95;
    this.player.pitch = -0.12;
    this.hourVis = 17;
    this.ui.update(state, '');
    this.refreshHint();
  }

  start() {
    this.running = true;
    this.ui.setHud(true);
    audio.loop('amb_river', { volume: 0.18, outdoor: true });
    audio.loop('clock_tick', { volume: 0.22, pos: this.world.shop.clock.pos });
    audio.loop('fire_loop', { volume: 0.08, pos: this.world.shop.stations.candle.pot });
    if (!audio.radio.el) setTimeout(() => this.ui.radioToast(audio.radioPlay(0), true), 1200);
    this.updateAmbience(true);
    this.ui.resumePointer();
  }

  stop() {
    this.running = false;
    for (const n of [...audio.loops.keys()]) audio.stopLoop(n, 0.5);
    this.customers.clearAll();
    this.crafting.close();
    this.ui.setHud(false);
  }

  // ---------------- settings ----------------
  loadSettings() {
    try {
      const raw = localStorage.getItem('lantern-lens:settings');
      if (!raw) return;
      const s = JSON.parse(raw);
      Object.assign(audio.settings, s.audio || {});
      if (s.sens) this.input.sens = s.sens;
      if (s.headBob === false) { this.player.headBob = false; this.ui.headBob = false; }
    } catch { /* defaults */ }
  }
  saveSettings() {
    this.player.headBob = this.ui.headBob !== false;
    try { localStorage.setItem('lantern-lens:settings', JSON.stringify({ audio: audio.settings, sens: this.input.sens, headBob: this.player.headBob })); } catch { /* ignore */ }
  }

  // ---------------- input ----------------
  bindInput() {
    const i = this.input;
    i.on('use', () => this.use());
    i.on('back', () => this.back());
    i.on('drop', () => this.dropHeld());
    i.on('tap', (e) => { if (!this.blocked()) this.use(e); });
    i.on('photo', () => { if (!this.ui.panelOpen && !this.crafting.isOpen) this.togglePhoto(); });
    i.on('menu', () => { if (this.photo.on || this.crafting.isOpen) return; if (this.ui.panelOpen) this.ui.closePanel(); else this.ui.menu(); });
    i.on('escape', () => {
      if (this.ui.panelOpen) this.ui.closePanel();
      else if (this.crafting.isOpen) this.crafting.close();
      else if (this.photo.on) this.togglePhoto();
    });
    i.on('click-unlocked', () => { if (!this.blocked()) i.requestLock(); });
    document.getElementById('photo-exit').addEventListener('click', () => this.togglePhoto());
    document.getElementById('photo-snap').addEventListener('click', () => this.snap());
    document.getElementById('photo-filter').addEventListener('click', (e) => {
      this.photo.filter = (this.photo.filter + 1) % 3;
      this.post.ink.uniforms.uFilter.value = this.photo.filter;
      e.target.textContent = `Filter: ${['Warm', 'Sepia', 'Moonlight'][this.photo.filter]}`;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(this.state); audio.suspend(); } else if (this.running) audio.resume();
    });
  }

  blocked() { return !this.running || this.ui.panelOpen || this.crafting.isOpen || this.photo.on; }

  // ---------------- targeting ----------------
  pick(screen) {
    const ndc = screen ? new THREE.Vector2((screen.x / innerWidth) * 2 - 1, -(screen.y / innerHeight) * 2 + 1) : new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.hits, false);
    for (const h of hits) {
      if (this.held && h.object === this.held.hit) continue;
      let o = h.object, visible = true;
      while (o) { if (o.visible === false) { visible = false; break; } o = o.parent; }
      if (!visible || !isInScene(h.object)) continue;
      return { ...h.object.userData.interact, object: h.object };
    }
    return null;
  }

  describe(t) {
    if (!t) return null;
    const s = this.state;
    const held = this.held;
    const k = (txt, key = 'Click') => `<kbd>${this.input.touch ? 'Tap' : key}</kbd>${txt}`;
    switch (t.type) {
      case 'box': {
        const b = s.boxes.find((x) => x.id === t.id);
        if (!b) return null;
        return held ? `${productName(b.key)} box` : k(`Pick up ${productName(b.key)}${parseKey(b.key).kind === 'supply' ? '' : ` ×${b.count}`}`);
      }
      case 'section': {
        const d = s.sections[t.id];
        if (held?.type === 'box') {
          const b = held.box;
          if (parseKey(b.key).kind === 'supply') return `Supplies go to the ${SUPPLIES[parseKey(b.key).id].station} bench`;
          if (this.shelves.accepts(t.id, b.key)) return k(`Place ${productName(b.key)}`) + (d?.key === b.key ? ` &nbsp;<kbd>${this.input.touch ? 'Back' : 'Right'}</kbd>Take back` : '');
          if (d?.key === b.key && b.count < 99) return `Shelf full &nbsp;<kbd>${this.input.touch ? 'Back' : 'Right'}</kbd>Take back`;
          return 'This shelf holds something else';
        }
        if (held?.type === 'crate') {
          const key = this.crateKeyFor(t.id);
          return key ? k(`Place ${productName(key)}`) : (d ? 'This shelf holds something else' : 'Crate is empty');
        }
        return d ? `${this.shelves.label(t.id)} · ${money(priceFor(s, d.key))} each` : 'Empty shelf';
      }
      case 'tag': {
        const d = s.sections[t.id];
        return d ? k(`Set price · ${productName(d.key)}`) : 'Price tag (stock this shelf first)';
      }
      case 'register': {
        const c = this.customers.current();
        if (!c) return 'The register · waiting for customers';
        const left = this.customers.counterItems.filter((x) => x.customer === c && !x.scanned).length;
        return left ? `Ring up ${left} item${left === 1 ? '' : 's'} first` : k(`Take payment · ${money(this.basketTotal(c))} (${c.payWith})`);
      }
      case 'counterItem': {
        const it = this.customers.counterItems.find((x) => x.mesh === t.mesh);
        if (!it || it.scanned) return null;
        return k(`Ring up ${productName(it.entry.key)} · ${money(it.entry.price)}`);
      }
      case 'ledger': return k('Open the shop ledger (order stock · licences)');
      case 'sign': return s.phase === 'prep' ? k(`Flip to OPEN · start night ${s.night}`) : 'Open until dawn';
      case 'station': {
        if (held?.type === 'box' && parseKey(held.box.key).kind === 'supply' && SUPPLIES[parseKey(held.box.key).id].station === t.id) return k(`Load ${productName(held.box.key)}`);
        if (held) return 'Put down what you’re carrying first (E)';
        return k(t.id === 'candle' ? `Make candles (${s.supplies.candle} left)` : `Build lamps (${s.supplies.lamp} left)`);
      }
      case 'crate': {
        const n = s.crafted.filter((x) => x.startsWith(t.id)).length;
        if (held?.type === 'crate' && held.id === t.id) return k('Put the crate back');
        if (held) return `${n} crafted ${t.id === 'candle' ? 'candles' : 'lamps'}`;
        return n ? k(`Pick up crate (${n} ${t.id === 'candle' ? 'candles' : 'lamps'})`) : `Crate is empty — craft at the ${t.id} bench`;
      }
      case 'radio': return k(audio.radio.on ? 'Next song' : 'Turn the radio on') + ` &nbsp;<kbd>${this.input.touch ? 'Back' : 'Right'}</kbd>${audio.radio.on ? 'Off' : ''}`;
      case 'board': {
        const unread = s.letters.filter((l) => !l.read).length;
        return k(`Read the corkboard${unread ? ` (${unread} new)` : ''}`);
      }
      case 'cat': return k('Pet the cat');
      default: return null;
    }
  }

  use(screen) {
    if (this.blocked()) return;
    const t = screen ? this.pick(screen) : this.target;
    if (!t) return;
    const s = this.state;
    switch (t.type) {
      case 'box': if (!this.held) this.pickUpBox(t.id); break;
      case 'section': this.placeInto(t.id); break;
      case 'tag': {
        const d = s.sections[t.id];
        if (d) this.ui.priceTag(d.key, () => this.shelves.updateTagsFor(d.key));
        break;
      }
      case 'counterItem': this.scanItem(t.mesh); break;
      case 'register': this.takePayment(); break;
      case 'ledger': audio.play('book_open', { volume: 0.6 }); this.ui.ledger(); break;
      case 'sign': if (s.phase === 'prep') this.openShop(); break;
      case 'station': {
        if (this.held?.type === 'box' && parseKey(this.held.box.key).kind === 'supply') { this.loadSupplies(t.id); break; }
        if (this.held) { this.ui.toast('Put down what you’re carrying first (E).', '📦', 2); break; }
        this.crafting.open(t.id);
        break;
      }
      case 'crate': this.crateAction(t.id); break;
      case 'radio': {
        const tr = audio.radio.on ? audio.radioNext() : (audio.radioToggle(), audio.radioPlay(audio.radio.index));
        this.ui.radioToast(tr, true);
        audio.play('key_click', { volume: 0.4 });
        break;
      }
      case 'board': this.ui.board(() => this.updatePins()); break;
      case 'cat': this.cat.pet(); s.cat.pets++; break;
    }
    this.refreshHint();
  }

  back() {
    if (this.blocked()) return;
    const t = this.target;
    if (!t) return;
    if (t.type === 'section' && this.held?.type === 'box') {
      const d = this.state.sections[t.id];
      if (d && d.key === this.held.box.key) {
        this.shelves.take(t.id);
        this.held.box.count++;
        audio.play('place_wood', { volume: 0.4, rate: 1.2 });
        this.updateHeld();
      }
    } else if (t.type === 'radio') {
      const on = audio.radioToggle();
      this.ui.radioToast(null, on);
    }
  }

  // ---------------- boxes ----------------
  spawnBox(b, fresh) {
    const mesh = deliveryBox(b.key);
    const hit = this.world.hit(new THREE.BoxGeometry(0.5, 0.34, 0.4), new THREE.Vector3(0, 0.15, 0), { type: 'box', id: b.id });
    mesh.add(hit);
    mesh.userData.hit = hit;
    this.placeBoxMesh(b, mesh);
    this.scene.add(mesh);
    this.boxMeshes.set(b.id, mesh);
    if (fresh) {
      const y = mesh.position.y;
      mesh.position.y += 1.2;
      tween({ duration: 0.55, easing: ease.outCubic, update: (k) => { mesh.position.y = y + 1.2 * (1 - k); }, done: () => { audio.play('box_drop', { pos: mesh.position, volume: 0.7 }); popIn(mesh, { from: 0.92, squash: 0.12 }); } });
    }
  }

  placeBoxMesh(b, mesh) {
    if (b.at === 'porch') {
      const spots = this.world.shop.anchors.porchDrop;
      const porch = this.state.boxes.filter((x) => x.at === 'porch');
      const idx = porch.indexOf(b);
      const spot = spots[idx % spots.length];
      mesh.position.set(spot.x, spot.y + Math.floor(idx / spots.length) * 0.31, spot.z);
      mesh.rotation.y = ((idx * 1.7) % 1) * 0.6 - 0.3;
    } else if (b.at === 'floor' && b.pos) {
      mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
      mesh.rotation.y = b.pos[3] || 0;
    }
  }

  pickUpBox(id) {
    const b = this.state.boxes.find((x) => x.id === id);
    const mesh = this.boxMeshes.get(id);
    if (!b || !mesh) return;
    b.at = 'held';
    this.scene.remove(mesh);
    mesh.position.set(0.2, -0.12, -0.08);
    mesh.rotation.set(0.32, -0.3, 0);
    mesh.scale.setScalar(0.72);
    setBoxOpen(mesh, true);
    mesh.userData.flaps?.forEach((f) => { f.visible = false; });
    this.player.hand.add(mesh);
    this.player.liftHand(true);
    this.held = { type: 'box', box: b, mesh, hit: mesh.userData.hit };
    audio.play('box_soft', { volume: 0.6 });
    audio.play('cloth', { volume: 0.3 });
    if (this.state.tutorial === 0) this.state.tutorial = 1;
    this.updateHeld();
  }

  dropHeld(silent = false) {
    if (!this.held) return;
    if (this.held.type === 'crate') {
      this.player.hand.remove(this.held.mesh);
      this.held = null;
      this.player.liftHand(false);
      this.crafting.updateCrates();
      this.updateHeld();
      return;
    }
    const { box, mesh } = this.held;
    this.player.hand.remove(mesh);
    if (silent) { this.held = null; return; }
    // put it on the floor in front of you
    const f = this.player.forward();
    f.y = 0; f.normalize();
    const p = this.player.pos.clone().addScaledVector(f, 0.75);
    p.x = Math.max(-4.7, Math.min(6.5, p.x));
    p.z = Math.max(-3.5, Math.min(10, p.z));
    box.at = 'floor';
    box.pos = [p.x, 0, p.z, this.player.yaw];
    setBoxOpen(mesh, false);
    mesh.scale.setScalar(1);
    mesh.position.set(p.x, 0.25, p.z);
    mesh.rotation.set(0, this.player.yaw, 0);
    this.scene.add(mesh);
    tween({ duration: 0.25, easing: ease.outCubic, update: (k) => { mesh.position.y = 0.25 * (1 - k); }, done: () => audio.play('box_soft', { pos: mesh.position, volume: 0.6 }) });
    this.held = null;
    this.player.liftHand(false);
    this.updateHeld();
  }

  updateHeld() {
    const h = this.held;
    if (!h) { this.ui.held(null); return; }
    if (h.type === 'box') {
      const kind = parseKey(h.box.key).kind;
      this.ui.held(kind === 'supply' ? `📦 ${productName(h.box.key)} · take it to the bench` : `📦 ${productName(h.box.key)} × <b>${h.box.count}</b>`);
    } else {
      const n = this.state.crafted.filter((x) => x.startsWith(h.id)).length;
      this.ui.held(`🧺 Crate · <b>${n}</b> ${h.id === 'candle' ? 'candles' : 'lamps'}`);
    }
  }

  placeInto(sectionId) {
    const h = this.held;
    if (!h) return;
    if (h.type === 'box') {
      const b = h.box;
      if (parseKey(b.key).kind === 'supply') { this.ui.toast(`Take this to the ${SUPPLIES[parseKey(b.key).id].station} bench at the back.`, '🧱', 2.4); return; }
      if (!this.shelves.add(sectionId, b.key)) { audio.play('cloth', { volume: 0.3 }); return; }
      b.count--;
      audio.play(b.key === 'oil' || b.key === 'bulbs' ? 'place_glass' : 'place_wood', { volume: 0.55 });
      if (this.state.tutorial === 1) { this.state.tutorial = 2; this.refreshHint(); }
      if (b.count <= 0) this.finishBox();
      this.updateHeld();
    } else {
      const key = this.crateKeyFor(sectionId);
      if (!key) return;
      this.shelves.add(sectionId, key);
      this.state.crafted.splice(this.state.crafted.indexOf(key), 1);
      audio.play(key.startsWith('lamp') ? 'place_glass' : 'place_wood', { volume: 0.55 });
      this.refreshCrateMesh();
      this.updateHeld();
    }
  }

  finishBox() {
    const { box, mesh } = this.held;
    this.state.boxes = this.state.boxes.filter((x) => x !== box);
    this.boxMeshes.delete(box.id);
    this.held = null;
    audio.play('paper', { volume: 0.5 });
    // fold the empty box flat and tuck it away
    const s0 = mesh.scale.clone();
    tween({ duration: 0.45, easing: ease.inOutCubic, update: (k) => { mesh.scale.set(s0.x * (1 + k * 0.2), s0.y * (1 - k * 0.92), s0.z * (1 + k * 0.1)); mesh.rotation.x = 0.12 + k * 0.5; }, done: () => { this.player.hand.remove(mesh); this.player.liftHand(false); this.ui.toast('Box flattened for kindling.', '♻', 1.6); } });
  }

  crateKeyFor(sectionId) {
    const id = this.held?.id;
    if (!id) return null;
    const keys = this.state.crafted.filter((x) => x.startsWith(id));
    const d = this.state.sections[sectionId];
    if (d && d.count > 0) return keys.includes(d.key) && this.shelves.accepts(sectionId, d.key) ? d.key : null;
    return keys[0] || null;
  }

  crateAction(id) {
    if (this.held?.type === 'crate' && this.held.id === id) { this.dropHeld(); audio.play('box_soft', { volume: 0.5 }); return; }
    if (this.held) return;
    const n = this.state.crafted.filter((x) => x.startsWith(id)).length;
    if (!n) return;
    const mesh = new THREE.Group();
    this.held = { type: 'crate', id, mesh };
    this.refreshCrateMesh();
    this.player.hand.add(mesh);
    this.player.liftHand(true);
    this.world.shop.crates[id].contents.clear();
    audio.play('box_soft', { volume: 0.6 });
    this.updateHeld();
  }

  refreshCrateMesh() {
    const h = this.held;
    if (h?.type !== 'crate') return;
    h.mesh.clear();
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.34), new THREE.MeshToonMaterial({ color: '#a8754c' }));
    tray.position.y = -0.02;
    h.mesh.add(tray);
    const keys = this.state.crafted.filter((x) => x.startsWith(h.id));
    keys.slice(0, 6).forEach((k, i) => {
      const m = productMesh(k, { on: false });
      m.scale.setScalar(h.id === 'lamp' ? 0.8 : 1.2);
      m.position.set(((i % 3) - 1) * 0.13, 0.04, (Math.floor(i / 3) - 0.5) * 0.12);
      h.mesh.add(m);
    });
    h.mesh.position.set(0.16, -0.16, -0.05);
    h.mesh.rotation.set(0.2, -0.25, 0);
    h.mesh.scale.setScalar(0.8);
    if (!keys.length) {
      this.player.hand.remove(h.mesh);
      this.held = null;
      this.player.liftHand(false);
      this.crafting.updateCrates();
    }
  }

  loadSupplies(stationId) {
    const b = this.held.box;
    const sup = SUPPLIES[parseKey(b.key).id];
    if (sup.station !== stationId) { this.ui.toast(`That goes to the ${sup.station} bench.`, '🧱', 2); return; }
    this.state.supplies[stationId] = (this.state.supplies[stationId] || 0) + sup.uses;
    b.count = 0;
    audio.play('latch', { volume: 0.6 });
    audio.play('box_soft', { volume: 0.4, delay: 0.1 });
    this.finishBox();
    this.crafting.updateCrates();
    this.ui.toast(`${sup.name} loaded — ${this.state.supplies[stationId]} ${stationId === 'candle' ? 'candles' : 'lamps'} worth.`, '✨');
    if (this.state.tutorial === 2) { this.state.tutorial = 3; this.refreshHint(); }
    this.updateHeld();
  }

  onCrafted(key, stars) {
    this.ui.toast(`${productName(key)} ${'★'.repeat(stars)} — pick up the crate to stock it.`, '✨');
    save(this.state);
  }

  // ---------------- checkout ----------------
  counterItemMesh(key) {
    const g = new THREE.Group();
    const m = productMesh(key, { on: false });
    m.scale.setScalar(key.startsWith('lamp') ? 1.1 : 1.4);
    g.add(m);
    const hit = this.world.hit(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.Vector3(0, 0.12, 0), { type: 'counterItem' });
    hit.userData.interact.mesh = g;
    g.add(hit);
    popIn(g, { from: 0.5 });
    return g;
  }

  onCounter(c) {
    audio.play('place_wood', { pos: c.pos, volume: 0.5 });
    if (!this.player.inside || this.player.pos.distanceTo(this.world.shop.anchors.counterCustomer) > 4) this.ui.toast(`${c.info.name} is waiting at the counter.`, '🛎', 2.6);
    if (this.state.tutorial === 3 || this.state.tutorial === 4) { this.state.tutorial = 4; this.refreshHint(); }
  }

  scanItem(mesh) {
    const it = this.customers.counterItems.find((x) => x.mesh === mesh);
    if (!it || it.scanned) return;
    it.scanned = true;
    audio.play('key_click', { volume: 0.6 });
    audio.play('paper', { volume: 0.35, delay: 0.08 });
    const from = mesh.position.clone();
    const to = new THREE.Vector3(3.45, 1.02, 0.85 + Math.random() * 0.25);
    tween({ duration: 0.4, easing: ease.outCubic, update: (k) => { mesh.position.lerpVectors(from, to, k); mesh.position.y += Math.sin(k * Math.PI) * 0.12; } });
    const c = it.customer;
    const left = this.customers.counterItems.filter((x) => x.customer === c && !x.scanned).length;
    if (!left) this.ui.toast(`Total ${money(this.basketTotal(c))} — click the register.`, '🧾', 2.4);
  }

  basketTotal(c) { return Math.round(c.basket.reduce((a, b) => a + b.price, 0) * 100) / 100; }

  takePayment() {
    const c = this.customers.current();
    if (!c) return;
    if (this.customers.counterItems.some((x) => x.customer === c && !x.scanned)) { this.ui.toast('Ring up each item on the counter first.', '🧾', 2); return; }
    audio.play('till_ding', { volume: 0.5, rate: 0.9 });
    this.ui.checkout(c, this.basketTotal(c), () => this.completeSale(c));
  }

  completeSale(c) {
    const s = this.state;
    audio.play('till_ding', { volume: 0.7 });
    audio.play('coins', { volume: 0.6, delay: 0.15 });
    const drawer = this.world.shop.register.userData.drawer;
    tween({ duration: 0.5, easing: ease.outBack, update: (k) => { drawer.position.z = 0.18 + Math.sin(k * Math.PI) * 0.12; } });
    let lit = [], letters = [], levelUp = false;
    for (const b of c.basket) {
      const fx = recordSale(s, { key: b.key, price: b.price, regular: c.info.regular });
      lit = lit.concat(fx.lit); letters = letters.concat(fx.letters); levelUp ||= fx.levelUp;
      if (fulfilWishes(s, b.key) && c.info.regular) {
        const more = bumpRep(s, c.info.regular, 4);
        lit = lit.concat(more.lit); letters = letters.concat(more.letters);
      }
    }
    for (const id of lit) {
      this.world.flashWindow(id);
      const house = +id.split(':')[0];
      const owner = Object.entries(REGULARS).find(([, r]) => r.house === house);
      this.ui.toast(owner ? `A window lights up at ${owner[1].name}’s house.` : 'Another window lights up in the village.', '🪟', 3.6);
      audio.play('clink', { volume: 0.4, rate: 1.3, delay: 0.3 });
    }
    for (const l of letters) this.ui.toast(`A letter from ${l.from.split(',')[0]} is on the corkboard.`, '💌', 4);
    if (levelUp) { this.ui.toast(`Shop level ${levelFor(s.xp)}! New licences in the ledger.`, '⭐', 4.2); audio.play('till_ding', { volume: 0.6, rate: 1.5, delay: 0.4 }); }
    if (s.tutorial === 4) { s.tutorial = 5; this.ui.toast('That’s the whole loop. The village is counting on your lights!', '🕯', 4); }
    this.customers.paid(c);
    this.updatePins();
    this.refreshHint();
    save(s);
  }

  // ---------------- night flow ----------------
  openShop() {
    const s = this.state;
    startShift(s);
    this.world.setWeather(s.weather);
    this.customers.planNight(s);
    this.updateSign();
    audio.play('key_click', { volume: 0.6 });
    audio.play('shop_bell', { volume: 0.4 });
    this.ui.toast(`Night ${s.night} — ${WEATHERS[s.weather].name.toLowerCase()} skies. The shop is open!`, WEATHERS[s.weather].icon, 3.6);
    if (s.tutorial < 4) s.tutorial = 4;
    this.refreshHint();
    this.updateAmbience();
    save(s);
  }

  checkDawn() {
    const s = this.state;
    if (s.phase !== 'shift' || s.clock < SHIFT_SECONDS) return;
    if (this.customers.list.length) return; // wait for the last visitors to finish
    if (this.dawning) return;
    this.dawning = true;
    this.crafting.close();
    const sum = endShift(s);
    save(s);
    this.updateSign();
    this.ui.summary(sum, () => {
      this.dawning = false;
      this.world.setWeather('clear');
      this.updateAmbience();
      this.updatePins();
      save(s);
    });
  }

  updateSign() {
    const d = this.world.shop.door;
    d.signMat.map = this.state.phase === 'shift' ? d.signTexOpen : d.signTexClosed;
    d.signMat.needsUpdate = true;
  }

  updatePins() {
    const pins = this.world.shop.pins;
    pins.clear();
    const s = this.state;
    const notes = [...s.letters.map((l) => ({ c: l.read ? '#e9def8' : '#f3e2ff' })), ...s.wishes.map(() => ({ c: '#fff6d6' }))].slice(0, 10);
    notes.forEach((n, i) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), new THREE.MeshToonMaterial({ color: n.c }));
      p.position.set(-0.48 + (i % 5) * 0.24, 0.2 - Math.floor(i / 5) * 0.3, 0.001 * i);
      p.rotation.z = ((i * 7) % 5 - 2) * 0.05;
      pins.add(p);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshToonMaterial({ color: '#b85a4c' }));
      pin.position.set(p.position.x, p.position.y + 0.06, 0.012);
      pins.add(pin);
    });
  }

  refreshHint() {
    const s = this.state;
    const step = s.tutorial;
    if (step < TUTORIAL.length) this.ui.hint(TUTORIAL[step]);
    else this.ui.hint(this.input.touch ? '' : '<kbd>Tab</kbd> settings · <kbd>P</kbd> photo mode');
  }

  updateAmbience(first = false) {
    const s = this.state;
    const night = s.phase === 'shift';
    const w = night ? s.weather : 'clear';
    const set = (name, vol, opts) => {
      if (vol > 0) { const h = audio.loops.get(name) || audio.loop(name, { volume: vol, outdoor: true, ...opts }); h?.set(vol, first ? 0.1 : 2); }
      else audio.stopLoop(name, 2);
    };
    set('amb_crickets', night && w === 'clear' ? 0.5 : night ? 0.18 : 0);
    set('amb_rain', w === 'rain' ? 0.75 : 0);
    set('amb_wind', w === 'fog' || !night ? 0.22 : 0.08);
  }

  // ---------------- photo ----------------
  togglePhoto() {
    this.photo.on = !this.photo.on;
    document.getElementById('photo').hidden = !this.photo.on;
    this.ui.setHud(!this.photo.on);
    if (this.photo.on) {
      this.photo.pos = this.camera.position.clone();
      this.photo.yaw = this.player.yaw;
      this.photo.pitch = this.player.pitch;
      this.player.frozen = true;
      this.player.hand.visible = false;
    } else {
      this.player.frozen = false;
      this.post.ink.uniforms.uFilter.value = 0;
    }
  }

  snap() {
    document.getElementById('photo').hidden = true;
    requestAnimationFrame(() => {
      this.post.render(0);
      this.renderer.domElement.toBlob((blob) => {
        if (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `lantern-and-lens-night-${this.state.night}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        document.getElementById('photo').hidden = !this.photo.on;
        audio.play('page', { volume: 0.6 });
        this.ui.toast('Photo saved.', '📷', 2);
      });
    });
  }

  updatePhoto(dt) {
    const look = this.input.consumeLook();
    const p = this.photo;
    p.yaw -= look.x;
    p.pitch = Math.max(-1.4, Math.min(1.4, p.pitch - look.y));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const sp = 2.2 * dt;
    p.pos.addScaledVector(f, -this.input.move.z * sp).addScaledVector(r, this.input.move.x * sp);
    if (this.input.keys.has('KeyE')) p.pos.y += sp;
    if (this.input.keys.has('KeyQ')) p.pos.y -= sp;
    p.pos.y = Math.max(0.2, Math.min(12, p.pos.y));
    this.camera.position.copy(p.pos);
    this.camera.quaternion.copy(q);
  }

  // ---------------- frame ----------------
  update(dt) {
    if (!this.running) return;
    const s = this.state;
    tickTweens(dt);
    this.input.update();
    const paused = this.ui.panelOpen;
    if (s.phase === 'shift' && !paused) s.clock = Math.min(SHIFT_SECONDS + 600, s.clock + dt);

    // visible hour: day in prep, the real clock during the shift
    const targetHour = s.phase === 'prep' ? 17 : 18 + Math.min(1, s.clock / SHIFT_SECONDS) * 12;
    if (s.phase === 'prep' && this.hourVis > 20) this.hourVis = 17;
    this.hourVis = s.phase === 'shift' && this.hourVis < 18 ? damp(this.hourVis, targetHour, 1.2, dt) : targetHour;

    if (this.photo.on) this.updatePhoto(dt);
    else this.player.update(dt, this.input);
    this.customers.update(dt, s, this.player.pos);
    this.cat.update(dt, this.player.pos);
    this.crafting.update(dt);
    this.world.update(dt, { hour: this.hourVis, playerPos: this.player.pos });
    updateFlames(this.world.t);

    // door: opens for anyone nearby
    const near = Math.hypot(this.player.pos.x - 2.9, this.player.pos.z - 4.1) < 1.4 || this.customers.nearDoor();
    const was = this.world.doorTarget;
    this.world.doorTarget = near ? 1 : 0;
    if (near && !was) { audio.play('door_open', { pos: new THREE.Vector3(2.9, 1.2, 4.1), volume: 0.5 }); audio.play('shop_bell', { pos: new THREE.Vector3(3.2, 2.1, 4.0), volume: 0.45 }); this.world.ringBell(); }
    if (!near && was) audio.play('door_close', { pos: new THREE.Vector3(2.9, 1.2, 4.1), volume: 0.45, delay: 0.25 });

    // audio listener + indoor muffle
    audio.setListener(this.camera.position, this.player.forward());
    audio.setIndoor(this.player.inside ? 1 - this.world.doorOpen * 0.55 : 0);

    // targeting & prompt
    if (!this.blocked() && !this.input.touch && !this.input.locked) {
      this.target = null;
      this.ui.prompt('<kbd>Click</kbd>to look around', false);
    } else if (!this.blocked() && !this.input.touch) {
      this.target = this.pick();
      const text = this.describe(this.target);
      this.ui.prompt(text, !!text && text.includes('<kbd>'));
    } else if (this.input.touch && !this.blocked()) {
      this.target = this.pick();
      const text = this.describe(this.target);
      this.ui.prompt(text, !!text && text.includes('<kbd>'));
    } else this.ui.prompt(null);

    this.ui.update(s, formatHour(clockHour(s, SHIFT_SECONDS)));
    this.checkDawn();
    this.saveT += dt;
    if (this.saveT > 45) { this.saveT = 0; save(s); }
  }
}

function isInScene(o) {
  while (o.parent) o = o.parent;
  return o.isScene;
}

