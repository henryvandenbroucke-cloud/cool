// The world: scene graph, sky, time of day, weather and the registries every
// system shares (colliders, interactables, sections, windows).

import * as THREE from 'three';
import { LAYER_NO_INK, materialsNamed, textures } from './render.js';
import { SEASONS } from './config.js';
import { buildShop } from './shop.js';
import { buildVillage, WINDOW_ON, WINDOW_OFF } from './village.js';
import { bakeStatic } from './bake.js';
import { damp, lerp, smooth } from './tween.js';

const SKY_KEYS = [
  // h: hour (18 → 30 = 06:00 next day). day = prep phase lighting.
  { h: 17.0, top: '#7fb3d6', hor: '#f6d7a8', fog: '#c9c2b0', hemiS: '#cfe3f0', hemiG: '#7a6a50', hemi: 1.15, sun: '#ffe2b8', sunI: 1.6, inside: 0.35, stars: 0, win: 0.0 },
  { h: 18.0, top: '#5a76a8', hor: '#f3a66b', fog: '#b98d78', hemiS: '#c9a7a0', hemiG: '#5a4a3a', hemi: 0.9, sun: '#ffb27a', sunI: 1.2, inside: 0.7, stars: 0.05, win: 0.2 },
  { h: 19.0, top: '#2c3e68', hor: '#d98a7a', fog: '#6a5a6e', hemiS: '#8a87a8', hemiG: '#3a3440', hemi: 0.62, sun: '#ff9a7a', sunI: 0.55, inside: 0.95, stars: 0.4, win: 0.7 },
  { h: 20.5, top: '#152238', hor: '#3d4f74', fog: '#2b3650', hemiS: '#5a6a96', hemiG: '#1f2430', hemi: 0.5, sun: '#9fb4e6', sunI: 0.35, inside: 1.0, stars: 1, win: 1 },
  { h: 27.0, top: '#101a2c', hor: '#33456a', fog: '#26314a', hemiS: '#52608c', hemiG: '#1c202b', hemi: 0.48, sun: '#9fb4e6', sunI: 0.35, inside: 1.0, stars: 1, win: 1 },
  { h: 28.6, top: '#2f3f6e', hor: '#c98a9a', fog: '#6a5a74', hemiS: '#9a8aa8', hemiG: '#3a3440', hemi: 0.6, sun: '#ffb2a0', sunI: 0.5, inside: 0.95, stars: 0.3, win: 0.8 },
  { h: 30.0, top: '#6f9ccc', hor: '#f6c2a0', fog: '#c9a9a0', hemiS: '#e0c8c0', hemiG: '#6a5a4a', hemi: 0.95, sun: '#ffd2b0', sunI: 1.1, inside: 0.6, stars: 0, win: 0.3 },
];
const col = (h) => new THREE.Color(h);
const POST_GLOW = new THREE.Color('#ffcf8a');
const KEYS = SKY_KEYS.map((k) => ({ ...k, top: col(k.top), hor: col(k.hor), fog: col(k.fog), hemiS: col(k.hemiS), hemiG: col(k.hemiG), sun: col(k.sun) }));

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.hits = [];
    this.hitRoot = new THREE.Group();
    this.hitRoot.name = 'hits';
    this.t = 0;
    this.hour = 17;
    this.weather = 'clear';
    this.weatherK = { rain: 0, fog: 0 };
    this.litWindows = new Set();
    this.windowGlow = new Map();
    this.doorOpen = 0;
    this.doorTarget = 0;
  }

  /** Register an invisible hitbox. */
  hit(geo, pos, data) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    mesh.position.copy(pos);
    mesh.userData.interact = data;
    mesh.visible = true;
    mesh.material.colorWrite = false;
    mesh.material.depthWrite = false;
    mesh.renderOrder = -1;
    mesh.layers.set(2); // never rendered, only raycast
    this.hits.push(mesh);
    return mesh;
  }

  async build(onProgress) {
    const s = this.scene;
    s.fog = new THREE.Fog('#26314a', 18, 85);

    // lights
    this.hemi = new THREE.HemisphereLight('#52608c', '#1c202b', 0.5);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#9fb4e6', 0.35);
    this.sun.position.set(-20, 30, 25);
    s.add(this.sun);
    this.ambient = new THREE.AmbientLight('#ffe8c8', 0.12);
    s.add(this.ambient);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uHor; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); vec3 c = mix(uHor, uTop, pow(h, 0.7)); gl_FragColor = vec4(c, 1.0); }',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(110, 32, 16), this.skyMat);
    sky.layers.set(LAYER_NO_INK);
    sky.renderOrder = -10;
    s.add(sky);
    this.sky = sky;

    // stars + moon
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random(), v = Math.random() * 0.45 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      sp.push(Math.sin(ph) * Math.cos(th) * 100, Math.cos(ph) * 100, Math.sin(ph) * Math.sin(th) * 100);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({ color: '#fff3dc', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.layers.set(LAYER_NO_INK);
    s.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4dc').multiplyScalar(1.6), fog: false, transparent: true }));
    this.moon.position.set(-30, 44, 75);
    this.moon.lookAt(0, 0, 0);
    this.moon.layers.set(LAYER_NO_INK);
    s.add(this.moon);

    onProgress?.(0.1);
    const ctx = { colliders: this.colliders, hit: (g, p, d) => this.hit(g, p, d) };
    this.shop = await buildShop(s, ctx);
    onProgress?.(0.45);
    this.village = await buildVillage(s, this.colliders);
    // merge everything that never moves: hundreds of draw calls become a few dozen
    this.bakeStats = [bakeStatic(this.shop.root), bakeStatic(this.village.root), bakeStatic(this.shop.studio)];
    // High quality: one warm key light over the shop floor casts soft shadows (it stands in for the main lamp)
    const main = this.shop.lights[0];
    const key = new THREE.SpotLight('#ffb766', 0, 13, 1.25, 0.75, 1.5);
    key.position.set(main.position.x + 0.6, main.position.y + 0.45, main.position.z);
    key.target.position.set(main.position.x + 0.6, 0, main.position.z);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 6;
    key.visible = false;
    key.userData.base = 9;
    s.add(key, key.target);
    this.keyLight = key;
    for (const root of [this.shop.root, this.shop.studio]) {
      root.traverse((o) => {
        if (!o.isMesh || o.layers.mask === 4) return;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || m.isMeshBasicMaterial) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
    }
    onProgress?.(0.9);
    // hitboxes are added to the scene through their parents; keep a flat list for raycasting
    this.windows = this.village.windows;

    // weather particles
    const rainGeo = new THREE.BufferGeometry();
    const rp = [];
    this.rainN = 1600;
    for (let i = 0; i < this.rainN; i++) {
      const x = -14 + Math.random() * 28, y = Math.random() * 14, z = -8 + Math.random() * 28;
      rp.push(x, y, z, x, y - 0.35, z);
    }
    rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#a9bfd6', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.layers.set(LAYER_NO_INK);
    this.rain.frustumCulled = false;
    s.add(this.rain);

    const ffGeo = new THREE.BufferGeometry();
    const fp = [];
    this.ffSeed = [];
    for (let i = 0; i < 70; i++) {
      fp.push(-7 + Math.random() * 14, 0.4 + Math.random() * 1.6, 4.8 + Math.random() * 6);
      this.ffSeed.push(Math.random() * 100);
    }
    ffGeo.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    this.ffBase = fp.slice();
    this.fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: new THREE.Color('#e9ff9a').multiplyScalar(2.2), size: 0.09, transparent: true, opacity: 0, depthWrite: false }));
    this.fireflies.layers.set(LAYER_NO_INK);
    s.add(this.fireflies);

    // seasonal flakes: petals, falling leaves or snow
    const fg = new THREE.BufferGeometry();
    this.flakeN = 900;
    const fpos = new Float32Array(this.flakeN * 3);
    for (let i = 0; i < this.flakeN; i++) { fpos[i * 3] = -16 + Math.random() * 32; fpos[i * 3 + 1] = Math.random() * 12; fpos[i * 3 + 2] = -10 + Math.random() * 30; }
    fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    this.flakeMat = new THREE.PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true, opacity: 0, depthWrite: false });
    this.flakes = new THREE.Points(fg, this.flakeMat);
    this.flakes.layers.set(LAYER_NO_INK);
    this.flakes.frustumCulled = false;
    s.add(this.flakes);
    this.flakeBase = 0;

    this.applySky(17);
    onProgress?.(1);
  }

  setWeather(w) { this.weather = w; }

  setLit(lit) {
    this.litWindows = new Set(lit);
  }

  /** Called when a window newly lights: brief bright flourish. */
  flashWindow(id) {
    this.litWindows.add(id);
    this.windowGlow.set(id, 2.2);
  }

  applySky(hour) {
    let h = hour < 12 ? hour + 24 : hour;
    let a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (h >= KEYS[i].h && h <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    if (h < KEYS[0].h) { a = b = KEYS[0]; }
    if (h > KEYS[KEYS.length - 1].h) { a = b = KEYS[KEYS.length - 1]; }
    const k = a === b ? 0 : smooth(0, 1, (h - a.h) / (b.h - a.h));
    const rain = this.weatherK.rain, fog = this.weatherK.fog;
    const grey = new THREE.Color('#5d6878');
    this.skyMat.uniforms.uTop.value.copy(a.top).lerp(b.top, k).lerp(grey.clone().multiplyScalar(0.55), rain * 0.55 + fog * 0.3);
    this.skyMat.uniforms.uHor.value.copy(a.hor).lerp(b.hor, k).lerp(grey, rain * 0.5 + fog * 0.6);
    this.scene.fog.color.copy(a.fog).lerp(b.fog, k).lerp(grey.clone().multiplyScalar(0.8), rain * 0.4 + fog * 0.5);
    this.scene.fog.near = lerp(18, 4, fog) - rain * 4;
    this.scene.fog.far = lerp(85, 30, fog) - rain * 20;
    this.hemi.color.copy(a.hemiS).lerp(b.hemiS, k);
    this.hemi.groundColor.copy(a.hemiG).lerp(b.hemiG, k);
    this.hemi.intensity = lerp(a.hemi, b.hemi, k) * (1 - rain * 0.2);
    this.sun.color.copy(a.sun).lerp(b.sun, k);
    this.sun.intensity = lerp(a.sunI, b.sunI, k) * (1 - rain * 0.4 - fog * 0.3);
    this.starMat.opacity = lerp(a.stars, b.stars, k) * (1 - Math.max(rain, fog));
    this.moon.material.opacity = Math.min(1, this.starMat.opacity * 1.3 + 0.1) * (1 - rain * 0.8);
    this.inside = lerp(a.inside, b.inside, k);
    this.winK = lerp(a.win, b.win, k);
    this.nightK = this.starMat.opacity;
    // image-based fill: bright and neutral by day, a faint touch at night so lamps carry the room
    this.scene.environmentIntensity = lerp(0.55, 0.14, this.nightK) * (1 - rain * 0.3);
  }

  update(dt, { hour, playerPos }) {
    this.t += dt;
    this.hour = hour;
    this.weatherK.rain = damp(this.weatherK.rain, this.weather === 'rain' ? 1 : 0, 0.6, dt);
    this.weatherK.fog = damp(this.weatherK.fog, this.weather === 'fog' ? 1 : this.weather === 'snow' ? 0.45 : 0, 0.6, dt);
    this.applySky(hour);

    // interior lights follow the mood, with a tiny candle flicker
    const flick = 1 + Math.sin(this.t * 7.3) * 0.025 + Math.sin(this.t * 17.1) * 0.015;
    for (const l of this.shop.lights) l.intensity = (l.userData.base ??= l.intensity) * (0.35 + 0.65 * this.inside) * flick;
    if (this.keyLight.visible) this.keyLight.intensity = this.keyLight.userData.base * (0.35 + 0.65 * this.inside) * flick;
    this.shop.porchLight.intensity = 5 * Math.max(0.15, this.inside) * flick;

    // village windows
    for (const [id, pane] of this.windows) {
      const on = this.litWindows.has(id);
      let g = this.windowGlow.get(id) || 0;
      if (g > 0) { g = Math.max(0, g - dt * 0.8); this.windowGlow.set(id, g); }
      const target = on ? 0.35 + 0.65 * this.winK : 0;
      pane.userData.k = damp(pane.userData.k ?? 0, target, on && g > 0 ? 3 : 1.5, dt);
      const k = pane.userData.k + g * 0.6;
      pane.material.color.copy(WINDOW_OFF).lerp(WINDOW_ON, Math.min(1.6, k));
    }
    for (const b of this.village.posts) b.material.color.copy(POST_GLOW).multiplyScalar(0.6 + 2.0 * this.winK);

    // rain
    const rk = this.weatherK.rain;
    this.rain.material.opacity = rk * 0.45;
    this.rain.visible = rk > 0.01;
    if (this.rain.visible) {
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < this.rainN; i++) {
        let y = pos.getY(i * 2) - dt * 14;
        if (y < 0) y += 14;
        pos.setY(i * 2, y);
        pos.setY(i * 2 + 1, y - 0.35);
      }
      pos.needsUpdate = true;
    }

    // seasonal flakes; heavy snow when it's snowing
    const snowing = this.weather === 'snow';
    const fk = Math.max(this.flakeBase * 0.6, snowing ? 1 : 0);
    this.flakeMat.opacity = damp(this.flakeMat.opacity, fk * 0.85, 1, dt);
    this.flakes.visible = this.flakeMat.opacity > 0.02;
    if (this.flakes.visible) {
      const pos = this.flakes.geometry.attributes.position;
      const fall = this.seasonId === 'winter' || snowing ? 1.0 : 0.55;
      const n = Math.floor(this.flakeN * Math.min(1, fk + 0.15));
      this.flakes.geometry.setDrawRange(0, n);
      for (let i = 0; i < n; i++) {
        let y = pos.getY(i) - dt * fall * (0.7 + (i % 7) * 0.08);
        if (y < 0) y += 12;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(this.t * 0.8 + i) * dt * 0.25);
      }
      pos.needsUpdate = true;
    }
    this.updateFestival(dt);
    // the workshop light follows you into the back studio
    if (this.shop.lights[2]) {
      const inStudio = playerPos.z < -4.1 && playerPos.x > 1.3 && playerPos.x < 5.1;
      this.shop.lights[2].position.copy(inStudio ? this.shop.studioLight : (this.workshopLightPos ||= this.shop.lights[2].position.clone()));
    }

    // fireflies (clear nights only)
    const ffk = this.nightK * (1 - Math.max(this.weatherK.rain, this.weatherK.fog * 0.6)) * (this.seasonId === 'winter' ? 0 : 1);
    this.fireflies.material.opacity = ffk * (0.6 + 0.4 * Math.sin(this.t * 2));
    if (ffk > 0.01) {
      const pos = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < this.ffSeed.length; i++) {
        const s = this.ffSeed[i];
        pos.setXYZ(i, this.ffBase[i * 3] + Math.sin(this.t * 0.4 + s) * 0.8, this.ffBase[i * 3 + 1] + Math.sin(this.t * 0.9 + s * 2) * 0.3, this.ffBase[i * 3 + 2] + Math.cos(this.t * 0.35 + s) * 0.8);
      }
      pos.needsUpdate = true;
    }

    // door swings toward target (auto-open)
    this.doorOpen = damp(this.doorOpen, this.doorTarget, 6, dt);
    this.shop.door.pivot.rotation.y = -this.doorOpen * 1.45;
    this.shop.door.bellPivot.rotation.z = Math.sin(this.t * 14) * 0.25 * (this.bellK = damp(this.bellK || 0, 0, 2.5, dt));

    // wall clock
    const hh = hour % 12;
    this.shop.clock.hour.rotation.x = -(hh / 12) * Math.PI * 2;
    this.shop.clock.minute.rotation.x = -((hour % 1)) * Math.PI * 2;
    if (this.festival) for (const b of this.village.posts) b.material.color.multiplyScalar(1.15);
  }

  ringBell() { this.bellK = 1; }

  // ---------- seasons ----------
  setSeason(index) {
    if (this.seasonIndex === index) return;
    this.seasonIndex = index;
    const id = SEASONS[index].id;
    const P = {
      spring: { leafsGreen: '#76b464', leafsDark: '#3a6f58', grass: '#6aa052', plant: '#6aa860', ground: '#ffffff', snow: 0, flake: '#f6b8c8', flakeN: 0.5 },
      summer: { leafsGreen: '#4f8a55', leafsDark: '#2f5f52', grass: '#5f8f52', plant: '#5f9a62', ground: '#f4ffe8', snow: 0, flake: '#e9ff9a', flakeN: 0 },
      autumn: { leafsGreen: '#d27a38', leafsDark: '#3f5f4a', grass: '#9a8a4a', plant: '#b88a3a', ground: '#ead6a4', snow: 0, flake: '#e08a3c', flakeN: 0.8 },
      winter: { leafsGreen: '#c4ccd0', leafsDark: '#8aa39c', grass: '#e6edf2', plant: '#9ab0a0', ground: '#ffffff', snow: 1, flake: '#ffffff', flakeN: 0.6 },
    }[id];
    for (const name of ['leafsGreen', 'leafsDark', 'grass', 'plant']) for (const m of materialsNamed(name)) m.color.set(P[name]);
    const v = this.village;
    this.snowTex ||= textures.snow([60, 60]);
    v.groundMat.map = P.snow ? this.snowTex : v.grassTex;
    v.groundMat.color.set(P.ground);
    v.groundMat.needsUpdate = true;
    const roofs = [...v.roofMats, this.shop.roofMat];
    for (const m of roofs) {
      m.userData.base ||= m.color.clone();
      m.color.copy(m.userData.base).lerp(new THREE.Color('#ffffff'), P.snow ? 0.6 : 0);
    }
    this.flakeMat.color.set(P.flake);
    this.flakeBase = P.flakeN;
    this.seasonId = id;
  }

  // ---------- the lantern festival ----------
  setFestival(on) {
    this.festival = on;
    if (on && !this.festivalRoot) this.buildFestival();
    if (this.festivalRoot) this.festivalRoot.visible = on || this.festivalDone;
    if (this.skyLanterns) this.skyLanterns.visible = on;
  }

  buildFestival() {
    const root = new THREE.Group();
    const colors = ['#ffb35c', '#e07a7c', '#7fd6c6', '#ffd89a', '#b5a3d8'];
    const bulbGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const mats = colors.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2) }));
    const wire = new THREE.LineBasicMaterial({ color: '#3b2a20' });
    const garland = (a, b, sag = 0.8) => {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const p = new THREE.Vector3().lerpVectors(a, b, t);
        p.y -= Math.sin(t * Math.PI) * sag;
        pts.push(p);
      }
      root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wire));
      pts.forEach((p, i) => { if (i % 2) { const bulb = new THREE.Mesh(bulbGeo, mats[i % mats.length]); bulb.position.copy(p).y -= 0.06; bulb.layers.set(LAYER_NO_INK); root.add(bulb); } });
    };
    const posts = [-22, -8, 4.6, 12, 24];
    for (let i = 0; i < posts.length - 1; i++) garland(new THREE.Vector3(posts[i], 2.6, 11), new THREE.Vector3(posts[i + 1], 2.6, 11), 0.9);
    garland(new THREE.Vector3(1.05, 2.6, 6.25), new THREE.Vector3(-6.8, 1.0, 10.4), 0.5);
    garland(new THREE.Vector3(5.15, 2.6, 6.25), new THREE.Vector3(6.8, 1.0, 10.4), 0.4);
    for (const [hx, hz] of [[-9, 17], [7.5, 17], [-2, 19.5], [14, 21]]) garland(new THREE.Vector3(hx, 3.0, hz - 2), new THREE.Vector3(hx > 0 ? 4.6 : -8, 2.6, 11), 0.7);
    this.festivalRoot = root;
    this.scene.add(root);
    // paper sky lanterns drifting up over the village
    const n = 70;
    const geo = new THREE.BoxGeometry(0.35, 0.45, 0.35);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb766').multiplyScalar(1.9) });
    const im = new THREE.InstancedMesh(geo, mat, n);
    im.layers.set(LAYER_NO_INK);
    im.frustumCulled = false;
    this.lanternSeeds = Array.from({ length: n }, () => ({ x: -26 + Math.random() * 52, z: 9 + Math.random() * 22, y: Math.random() * 40, s: 0.4 + Math.random() * 0.5, w: Math.random() * 6 }));
    this.skyLanterns = im;
    this.scene.add(im);
  }

  updateFestival(dt) {
    if (!this.festival || !this.skyLanterns) return;
    const m = new THREE.Matrix4();
    this.lanternSeeds.forEach((l, i) => {
      l.y += dt * l.s;
      if (l.y > 42) l.y = 0.5;
      m.makeTranslation(l.x + Math.sin(this.t * 0.3 + l.w) * 1.2, 1.5 + l.y, l.z + Math.cos(this.t * 0.25 + l.w));
      this.skyLanterns.setMatrixAt(i, m);
    });
    this.skyLanterns.instanceMatrix.needsUpdate = true;
  }

  /** Quality tiers decide how many real lights we can afford. */
  setLightBudget(n, shadows = false) {
    const L = this.shop.lights;
    L.forEach((l, i) => { l.visible = i < Math.min(n, L.length); });
    // with shadows on, the shadow-casting key light takes over from the main lamp
    this.keyLight.visible = shadows;
    if (shadows) L[0].visible = false;
    this.shop.porchLight.visible = n >= 3;
    // the brightest light stretches further when it's carrying the room alone
    L[0].distance = n <= 2 ? 14 : 11;
    this.ambient.intensity = n <= 2 ? 0.26 : n === 3 ? 0.18 : 0.12;
  }
}
