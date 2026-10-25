// The orchestrator: owns the save, wires the systems together, and turns
// what you look at + click into shop actions.

import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Shelves } from './shelves.js';
import { Customers } from './customers.js';
import { Crafting } from './crafting.js';
import { Cat } from './cat.js';
import { Decor } from './decor.js';
import { Staff } from './staff.js';
import { Guide } from './guide.js';
import { NavGrid } from './nav.js';
import { UI, money, productIcon } from './ui.js';
import { audio } from './audio.js';
import { litMat } from './render.js';
import { deliveryBox, setBoxOpen, productMesh, updateFlames } from './products.js';
import { tween, tickTweens, ease, damp, popIn } from './tween.js';
import { SHIFT_SECONDS, SUPPLIES, REGULARS, WEATHERS, DECOR, EXPANSIONS } from './config.js';
import {
  parseKey, productName, save, startShift, endShift, clockHour, formatHour, recordSale, fulfilWishes,
  levelFor, priceFor, bumpRep, seasonIndex, seasonFor,
} from './state.js';

const STATION_NAMES = { candle: 'candle bench', lamp: 'lamp bench', lens: 'lens grinder', glass: 'glass table' };
const CRAFT_NOUN = { candle: 'candles', lamp: 'lamps', lens: 'lenses', glass: 'panels' };

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
    this.fpsT = 0;
    this.hourVis = 17;
    this.running = false;
    this.settings = { quality: 'auto', showFps: false, outlines: false };
    this.flags = {};
  }

  async build(onProgress) {
    await this.world.build((k) => onProgress?.(k * 0.75));
    this.player = new Player(this.camera, this.world);
    this.scene.add(this.camera);
    this.ui = new UI({ getState: () => this.state, input: this.input });
    this.ui.game = this;
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
    this.decor = new Decor(this);
    this.staff = new Staff(this);
    this.onStaffStocked = (name, n) => this.ui.toast(`Bramble stocked ${n} × ${name}.`, 'i-box', 2.2);
    this.guide = new Guide(this);
    onProgress?.(0.96);
    const ui = this.ui;
    ui.onOrder = (boxes) => { for (const b of boxes) this.spawnBox(b, true); save(this.state); };
    ui.onLicence = () => { this.crafting.updateCrates(); save(this.state); };
    ui.onExpansion = (id) => this.applyExpansion(id, true);
    ui.onPlaceDecor = (type) => this.decor.start(type);
    ui.onStaff = () => { this.staff.sync(this.state); save(this.state); };
    ui.onQuality = (q) => { this.settings.quality = q; this.post.setMode(q); this.saveSettings(); };
    ui.onReplayTutorial = () => this.guide.restart();
    ui.onSkipTutorial = () => { this.guide.skip(); save(this.state); };
    ui.onQuit = () => this.onQuit?.();
    ui.onPhoto = () => this.togglePhoto();
    ui.onSettings = () => this.saveSettings();
    this.bindInput();
    this.loadSettings();
    onProgress?.(1);
  }

  /** (Re)apply a save to the world. */
  async applyState(state) {
    this.state = state;
    this.flags = {};
    this.staff?.clear();
    for (const [id, E] of Object.entries(this.world.shop.expansions)) (state.expansions.includes(id) ? E.open : E.close)();
    this.world.studioOpen = state.expansions.includes('studio');
    this.shelves.setState(state);
    for (const m of this.boxMeshes.values()) m.parent?.remove(m);
    this.boxMeshes.clear();
    this.dropHeld(true);
    for (const b of state.boxes) this.spawnBox(b, false);
    this.world.setLit(state.lit);
    this.world.setWeather(state.phase === 'shift' ? state.weather : 'clear');
    this.world.setSeason(seasonIndex(state.night));
    this.world.festivalDone = state.festival === 'done';
    this.world.setFestival(false);
    this.customers.clearAll();
    this.crafting.updateCrates();
    this.updateSign();
    this.updatePins();
    this.player.pos.copy(this.world.shop.anchors.playerStart);
    this.player.yaw = Math.PI * 0.95;
    this.player.pitch = -0.12;
    this.hourVis = 17;
    this.ui.guide(null);
    await this.decor.rebuild(state);
    await this.staff.sync(state);
    this.ui.update(state, '', 17);
  }

  applyExpansion(id, fresh) {
    this.world.shop.expansions[id].open();
    if (id === 'studio') this.world.studioOpen = true;
    this.shelves.rebuildAll();
    this.rebuildNav();
    if (fresh) {
      this.ui.toast(`<b>${EXPANSIONS[id].name}</b> is built!${id === 'studio' ? ' Buy the lens and glass licences to use its benches.' : ' Stock it like any shelf.'}`, EXPANSIONS[id].icon, 4.5);
      audio.play('shop_bell', { volume: 0.4 });
      save(this.state);
    }
  }

  rebuildNav() {
    this.customers.nav = new NavGrid(this.world.colliders);
    this.cat.nav = this.customers.nav;
  }

  onDecorChanged() { save(this.state); }

  start() {
    this.running = true;
    this.ui.setHud(true);
    audio.loop('amb_river', { volume: 0.18, outdoor: true });
    audio.loop('clock_tick', { volume: 0.22, pos: this.world.shop.clock.pos });
    audio.loop('fire_loop', { volume: 0.08, pos: this.world.shop.stations.candle.pot });
    // the radio starts quietly; during the tutorial it doesn't announce itself
    if (!audio.radio.el) setTimeout(() => { const tr = audio.radioPlay(0); if (this.state.tutorialDone) this.ui.radioToast(tr, true); }, 1600);
    this.updateAmbience(true);
    this.ui.resumePointer();
  }

  stop() {
    this.running = false;
    for (const n of [...audio.loops.keys()]) audio.stopLoop(n, 0.5);
    this.customers.clearAll();
    this.staff.releaseAll();
    this.staff.clear();
    this.crafting.close();
    this.decor.clearGhost();
    this.ui.setHud(false);
    this.ui.guide(null);
    this.guide.hide();
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
      this.settings.quality = s.quality || 'auto';
      this.settings.showFps = !!s.showFps;
      this.settings.outlines = !!s.outlines;
    } catch { /* defaults */ }
  }
  saveSettings() {
    this.player.headBob = this.ui.headBob !== false;
    try { localStorage.setItem('lantern-lens:settings', JSON.stringify({ audio: audio.settings, sens: this.input.sens, headBob: this.player.headBob, quality: this.settings.quality, showFps: this.settings.showFps, outlines: this.settings.outlines })); } catch { /* ignore */ }
  }

  // ---------------- input ----------------
  bindInput() {
    const i = this.input;
    i.on('use', () => { if (this.decor.placing && !this.blocked()) this.decor.confirm(); else this.use(); });
    i.on('back', () => { if (this.decor.placing && !this.blocked()) this.decor.cancel(); else this.back(); });
    i.on('cycle', (e) => { if (this.decor.placing) this.decor.rotate(e?.deltaY < 0 ? -1 : 1); });
    i.on('drop', () => { if (!this.decor.placing) this.dropHeld(); });
    i.on('tap', (e) => { if (this.blocked()) return; if (this.decor.placing) this.decor.confirm(); else this.use(e); });
    i.on('photo', () => { if (!this.ui.panelOpen && !this.crafting.isOpen) this.togglePhoto(); });
    i.on('menu', () => { if (this.photo.on || this.crafting.isOpen) return; if (this.ui.panelOpen) this.ui.closePanel(); else this.ui.menu(); });
    i.on('escape', () => {
      if (this.ui.panelOpen) this.ui.closePanel();
      else if (this.crafting.isOpen) this.crafting.close();
      else if (this.photo.on) this.togglePhoto();
      else if (this.decor.placing) this.decor.cancel();
    });
    i.on('click-unlocked', () => { if (!this.blocked()) i.requestLock(); });
    document.getElementById('photo-exit').addEventListener('click', () => this.togglePhoto());
    document.getElementById('photo-snap').addEventListener('click', () => this.snap());
    document.getElementById('photo-filter').addEventListener('click', (e) => {
      this.photo.filter = (this.photo.filter + 1) % 3;
      this.post.ink.uniforms.uFilter.value = this.photo.filter;
      this.post.filter = this.photo.filter > 0;
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

  /** What the crosshair is on → { use, alt, info } for the prompt tag. */
  describe(t) {
    if (!t) return null;
    const s = this.state;
    const held = this.held;
    switch (t.type) {
      case 'box': {
        const b = s.boxes.find((x) => x.id === t.id);
        if (!b) return null;
        const label = `${productName(b.key)}${parseKey(b.key).kind === 'supply' ? '' : ` ×${b.count}`}`;
        return held ? { info: `${label} box` } : { use: `Pick up ${label}` };
      }
      case 'section': {
        const d = s.sections[t.id];
        if (held?.type === 'box') {
          const b = held.box;
          if (parseKey(b.key).kind === 'supply') return { info: `This goes to the ${STATION_NAMES[SUPPLIES[parseKey(b.key).id].station]}` };
          const canBack = d?.key === b.key;
          if (this.shelves.accepts(t.id, b.key)) return { use: `Place ${productName(b.key)}`, alt: canBack ? 'Take one back' : null };
          if (canBack) return { info: 'Shelf full', alt: 'Take one back' };
          return { info: 'This shelf holds something else' };
        }
        if (held?.type === 'crate') {
          const key = this.crateKeyFor(t.id);
          return key ? { use: `Place ${productName(key)}` } : { info: d ? 'This shelf holds something else' : 'Crate is empty' };
        }
        return { info: d ? `${this.shelves.label(t.id)} · ${money(priceFor(s, d.key))} each` : 'Empty shelf — carry stock here' };
      }
      case 'tag': {
        const d = s.sections[t.id];
        return d ? { use: `Set price · ${productName(d.key)}` } : { info: 'Price tag (stock this shelf first)' };
      }
      case 'register': {
        const c = this.customers.current();
        if (!c) return { info: 'The register · waiting for customers' };
        const left = this.customers.counterItems.filter((x) => x.customer === c && !x.scanned).length;
        return left ? { info: `Ring up ${left} item${left === 1 ? '' : 's'} first` } : { use: `Take payment · ${money(this.basketTotal(c))} by ${c.payWith}` };
      }
      case 'counterItem': {
        const it = this.customers.counterItems.find((x) => x.mesh === t.mesh);
        if (!it || it.scanned) return null;
        return { use: `Ring up ${productName(it.entry.key)} · ${money(it.entry.price)}` };
      }
      case 'ledger': return { use: 'Open the ledger', info: 'stock · licences · decor · staff' };
      case 'sign': return s.phase === 'prep' ? { use: `Flip to OPEN · start night ${s.night}` } : { info: 'Open until dawn' };
      case 'station': {
        if (held?.type === 'box' && parseKey(held.box.key).kind === 'supply') {
          const sup = SUPPLIES[parseKey(held.box.key).id];
          return sup.station === t.id ? { use: `Load ${sup.name}` } : { info: `${sup.name} go to the ${STATION_NAMES[sup.station]}` };
        }
        if (held) return { info: 'Put down what you’re carrying first (E)' };
        return { use: `Work at the ${STATION_NAMES[t.id]}`, info: `${s.supplies[t.id] || 0} left` };
      }
      case 'crate': {
        const n = s.crafted.filter((x) => x.startsWith(t.id)).length;
        if (held?.type === 'crate' && held.id === t.id) return { use: 'Put the crate back' };
        if (held) return { info: `${n} finished ${CRAFT_NOUN[t.id]}` };
        return n ? { use: `Pick up crate · ${n} ${CRAFT_NOUN[t.id]}` } : { info: `Empty — craft at the ${STATION_NAMES[t.id]}` };
      }
      case 'radio': return { use: audio.radio.on ? 'Next song' : 'Radio on', alt: audio.radio.on ? 'Off' : null };
      case 'board': {
        const unread = s.letters.filter((l) => !l.read).length;
        return { use: `Read the corkboard${unread ? ` · ${unread} new` : ''}` };
      }
      case 'cat': return { use: 'Pet the cat' };
      case 'decor': {
        const d = s.decor.find((x) => x.id === t.id);
        return d ? (held ? { info: DECOR[d.type].name } : { use: `Move ${DECOR[d.type].name}` }) : null;
      }
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
        if (d) { this.flags.priceOpened = true; this.ui.priceTag(d.key, () => this.shelves.updateTagsFor(d.key)); }
        break;
      }
      case 'counterItem': this.scanItem(t.mesh); break;
      case 'register': this.takePayment(); break;
      case 'ledger': audio.play('book_open', { volume: 0.6 }); this.ui.ledger(); break;
      case 'sign': if (s.phase === 'prep') this.openShop(); break;
      case 'station': {
        if (this.held?.type === 'box' && parseKey(this.held.box.key).kind === 'supply') { this.loadSupplies(t.id); break; }
        if (this.held) { this.ui.toast('Put down what you’re carrying first (E).', 'i-box', 2); break; }
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
      case 'decor': if (!this.held) this.decor.move(t.id); break;
    }
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
    if (!b || !mesh || b.claimed) return;
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
    const f = this.player.forward();
    f.y = 0; f.normalize();
    const p = this.player.pos.clone().addScaledVector(f, 0.75);
    p.x = Math.max(-4.7, Math.min(6.5, p.x));
    p.z = Math.max(this.player.inStudio ? -7.3 : -3.5, Math.min(10, p.z));
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
      if (kind === 'supply') {
        const sup = SUPPLIES[parseKey(h.box.key).id];
        this.ui.held({ icon: productIcon(h.box.key), name: sup.name, note: `→ ${STATION_NAMES[sup.station]}` });
      } else this.ui.held({ icon: productIcon(h.box.key), name: productName(h.box.key), count: h.box.count });
    } else {
      const n = this.state.crafted.filter((x) => x.startsWith(h.id)).length;
      this.ui.held({ icon: 'i-crate', name: `Crate of ${CRAFT_NOUN[h.id]}`, count: n });
    }
  }

  placeInto(sectionId) {
    const h = this.held;
    if (!h) return;
    if (h.type === 'box') {
      const b = h.box;
      if (parseKey(b.key).kind === 'supply') { this.ui.toast(`Take this to the ${STATION_NAMES[SUPPLIES[parseKey(b.key).id].station]}.`, 'i-box', 2.4); return; }
      if (!this.shelves.add(sectionId, b.key)) { audio.play('cloth', { volume: 0.3 }); return; }
      b.count--;
      audio.play(b.key === 'oil' || b.key === 'bulbs' ? 'place_glass' : 'place_wood', { volume: 0.55 });
      if (b.count <= 0) this.finishBox();
      this.updateHeld();
    } else {
      const key = this.crateKeyFor(sectionId);
      if (!key) return;
      this.shelves.add(sectionId, key);
      this.state.crafted.splice(this.state.crafted.indexOf(key), 1);
      audio.play(key.startsWith('lamp') || key.startsWith('glass') || key.startsWith('lens') ? 'place_glass' : 'place_wood', { volume: 0.55 });
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
    const s0 = mesh.scale.clone();
    tween({ duration: 0.45, easing: ease.inOutCubic, update: (k) => { mesh.scale.set(s0.x * (1 + k * 0.2), s0.y * (1 - k * 0.92), s0.z * (1 + k * 0.1)); mesh.rotation.x = 0.12 + k * 0.5; }, done: () => { this.player.hand.remove(mesh); this.player.liftHand(false); this.ui.toast('Empty box flattened for kindling.', 'i-box', 1.6); } });
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
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.34), litMat({ color: '#a8754c' }));
    tray.position.y = -0.02;
    h.mesh.add(tray);
    const keys = this.state.crafted.filter((x) => x.startsWith(h.id));
    keys.slice(0, 6).forEach((k, i) => {
      const m = productMesh(k, { on: false });
      m.scale.setScalar(h.id === 'lamp' ? 0.8 : h.id === 'glass' ? 0.7 : 1.2);
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
    if (sup.station !== stationId) { this.ui.toast(`That goes to the ${STATION_NAMES[sup.station]}.`, 'i-box', 2); return; }
    this.state.supplies[stationId] = (this.state.supplies[stationId] || 0) + sup.uses;
    b.count = 0;
    audio.play('latch', { volume: 0.6 });
    audio.play('box_soft', { volume: 0.4, delay: 0.1 });
    this.finishBox();
    this.crafting.updateCrates();
    this.ui.toast(`${sup.name} loaded — enough for ${this.state.supplies[stationId]} ${CRAFT_NOUN[stationId]}.`, productIcon(b.key));
    this.updateHeld();
  }

  onCrafted() {
    // the bench shows its own reveal; just keep the save current
    save(this.state);
  }

  // ---------------- checkout ----------------
  counterItemMesh(key) {
    const g = new THREE.Group();
    const m = productMesh(key, { on: false });
    m.scale.setScalar(key.startsWith('lamp') ? 1.1 : key.startsWith('glass') ? 0.9 : 1.4);
    g.add(m);
    const hit = this.world.hit(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.Vector3(0, 0.12, 0), { type: 'counterItem' });
    hit.userData.interact.mesh = g;
    g.add(hit);
    popIn(g, { from: 0.5 });
    return g;
  }

  onCounter(c) {
    audio.play('place_wood', { pos: c.pos, volume: 0.5 });
    const wren = this.state.staff.includes('wren');
    if (!wren && (!this.player.inside || this.player.pos.distanceTo(this.world.shop.anchors.counterCustomer) > 4)) this.ui.toast(`<b>${c.info.name}</b> is waiting at the counter.`, 'i-bell', 2.6);
  }

  scanItem(mesh, quiet = false) {
    const it = this.customers.counterItems.find((x) => x.mesh === mesh);
    if (!it || it.scanned) return;
    it.scanned = true;
    audio.play('key_click', { volume: 0.6, pos: quiet ? mesh.position : null });
    audio.play('paper', { volume: 0.35, delay: 0.08 });
    const from = mesh.position.clone();
    const to = new THREE.Vector3(3.45, 1.02, 0.85 + Math.random() * 0.25);
    tween({ duration: 0.4, easing: ease.outCubic, update: (k) => { mesh.position.lerpVectors(from, to, k); mesh.position.y += Math.sin(k * Math.PI) * 0.12; } });
    const c = it.customer;
    const left = this.customers.counterItems.filter((x) => x.customer === c && !x.scanned).length;
    if (!left && !quiet) this.ui.toast(`Total ${money(this.basketTotal(c))} — now click the register.`, 'i-coin', 2.4);
  }

  basketTotal(c) { return Math.round(c.basket.reduce((a, b) => a + b.price, 0) * 100) / 100; }

  takePayment() {
    const c = this.customers.current();
    if (!c) return;
    if (this.customers.counterItems.some((x) => x.customer === c && !x.scanned)) { this.ui.toast('Ring up each item on the counter first.', 'i-coin', 2); return; }
    audio.play('till_ding', { volume: 0.5, rate: 0.9 });
    this.ui.checkout(c, this.basketTotal(c), () => this.completeSale(c));
  }

  completeSale(c, { by } = {}) {
    const s = this.state;
    audio.play('till_ding', { volume: 0.7, pos: by ? this.world.shop.anchors.counterDrop : null });
    audio.play('coins', { volume: 0.6, delay: 0.15 });
    const drawer = this.world.shop.register.userData.drawer;
    tween({ duration: 0.5, easing: ease.outBack, update: (k) => { drawer.position.z = 0.18 + Math.sin(k * Math.PI) * 0.12; } });
    let lit = [], letters = [], levelUp = false, festival = false;
    for (const b of c.basket) {
      const fx = recordSale(s, { key: b.key, price: b.price, regular: c.info.regular });
      lit = lit.concat(fx.lit); letters = letters.concat(fx.letters); levelUp ||= fx.levelUp; festival ||= fx.festival;
      if (fulfilWishes(s, b.key) && c.info.regular) {
        const more = bumpRep(s, c.info.regular, 4);
        lit = lit.concat(more.lit); letters = letters.concat(more.letters);
      }
    }
    for (const id of lit) {
      this.world.flashWindow(id);
      const house = +id.split(':')[0];
      const owner = Object.entries(REGULARS).find(([, r]) => r.house === house);
      this.ui.toast(owner ? `A window lights up at <b>${owner[1].name}’s</b> house.` : 'Another window lights up in the village.', 'i-window', 3.6);
      audio.play('clink', { volume: 0.4, rate: 1.3, delay: 0.3 });
    }
    for (const l of letters) this.ui.toast(`A letter from <b>${l.from.split(',')[0]}</b> is on the corkboard.`, 'i-letter', 4);
    if (levelUp) { this.ui.toast(`Shop level <b>${levelFor(s.xp)}</b>! New things in the ledger.`, 'i-star', 4.2); audio.play('till_ding', { volume: 0.6, rate: 1.5, delay: 0.4 }); }
    if (festival) this.ui.toast('Every window is lit! Tomorrow night is the <b>Lantern Festival</b>.', 'i-festival', 6);
    this.customers.paid(c);
    this.updatePins();
    save(s);
  }

  // ---------------- night flow ----------------
  openShop() {
    const s = this.state;
    if (this.decor.placing) this.decor.cancel();
    startShift(s);
    this.world.setWeather(s.weather);
    this.customers.planNight(s);
    this.updateSign();
    audio.play('key_click', { volume: 0.6 });
    audio.play('shop_bell', { volume: 0.4 });
    if (s.festival === 'tonight') {
      this.world.setFestival(true);
      audio.radioPlay(0);
      this.ui.toast('The <b>Lantern Festival</b> begins! Everyone is coming tonight.', 'i-festival', 6);
    } else this.ui.toast(`Night ${s.night} · ${seasonFor(s.night).name} · ${WEATHERS[s.weather].name.toLowerCase()} skies. The shop is open!`, WEATHERS[s.weather].icon, 3.6);
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
    this.staff.releaseAll();
    const sum = endShift(s);
    save(s);
    this.updateSign();
    if (sum.festival) { this.world.festivalDone = true; this.world.setFestival(false); }
    this.ui.summary(sum, () => {
      this.dawning = false;
      this.world.setWeather('clear');
      this.world.setSeason(seasonIndex(s.night));
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
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), litMat({ color: n.c }));
      p.position.set(-0.48 + (i % 5) * 0.24, 0.2 - Math.floor(i / 5) * 0.3, 0.001 * i);
      p.rotation.z = ((i * 7) % 5 - 2) * 0.05;
      pins.add(p);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), litMat({ color: '#b85a4c' }));
      pin.position.set(p.position.x, p.position.y + 0.06, 0.012);
      pins.add(pin);
    });
  }

  updateAmbience(first = false) {
    const s = this.state;
    const night = s.phase === 'shift';
    const w = night ? s.weather : 'clear';
    const winter = seasonFor(s.night).id === 'winter';
    const set = (name, vol, opts) => {
      if (vol > 0) { const h = audio.loops.get(name) || audio.loop(name, { volume: vol, outdoor: true, ...opts }); h?.set(vol, first ? 0.1 : 2); }
      else audio.stopLoop(name, 2);
    };
    set('amb_crickets', winter ? 0 : night && w === 'clear' ? 0.5 : night ? 0.18 : 0);
    set('amb_rain', w === 'rain' ? 0.75 : 0);
    set('amb_wind', w === 'fog' || w === 'snow' ? 0.35 : !night ? 0.22 : winter ? 0.2 : 0.08);
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
      this.post.filter = false;
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
        this.ui.toast('Photo saved.', 'i-camera', 2);
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
    this.staff.update(dt);
    this.cat.update(dt, this.player.pos);
    this.crafting.update(dt);
    this.decor.update(dt);
    this.world.update(dt, { hour: this.hourVis, playerPos: this.player.pos });
    this.guide.update(dt);
    updateFlames(this.world.t);

    // door: opens for anyone nearby
    const near = Math.hypot(this.player.pos.x - 2.9, this.player.pos.z - 4.1) < 1.4 || this.customers.nearDoor();
    const was = this.world.doorTarget;
    this.world.doorTarget = near ? 1 : 0;
    if (near && !was) { audio.play('door_open', { pos: new THREE.Vector3(2.9, 1.2, 4.1), volume: 0.5 }); audio.play('shop_bell', { pos: new THREE.Vector3(3.2, 2.1, 4.0), volume: 0.45 }); this.world.ringBell(); }
    if (!near && was) audio.play('door_close', { pos: new THREE.Vector3(2.9, 1.2, 4.1), volume: 0.45, delay: 0.25 });

    // audio listener + indoor muffle
    audio.setListener(this.camera.position, this.player.forward());
    audio.setIndoor(this.player.inside || this.player.inStudio ? 1 - this.world.doorOpen * 0.55 : 0);

    // targeting & prompt
    if (this.blocked()) this.ui.prompt(null);
    else if (this.decor.placing) { this.target = null; this.ui.prompt(this.decor.placing.valid ? { use: 'Place here', alt: 'Put away' } : { info: 'Won’t fit here', alt: 'Put away' }); }
    else if (!this.input.touch && !this.input.locked) { this.target = null; this.ui.prompt({ use: 'Click to look around' }); }
    else {
      this.target = this.pick();
      this.ui.prompt(this.describe(this.target));
    }

    this.ui.update(s, formatHour(clockHour(s, SHIFT_SECONDS)), this.hourVis % 24);
    this.fpsT += dt;
    if (this.fpsT > 0.5) { this.fpsT = 0; this.ui.setFps(this.post, this.settings.showFps); }
    this.checkDawn();
    this.saveT += dt;
    if (this.saveT > 45) { this.saveT = 0; save(s); }
  }
}

function isInScene(o) {
  while (o.parent) o = o.parent;
  return o.isScene;
}
