// Boot: renderer, title screen with three save slots, then the frame loop.

import * as THREE from 'three';
import { createRenderer, createComposer, gpuInfo } from './game/render.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Input } from './game/input.js';
import { Game } from './game/game.js';
import { audio } from './game/audio.js';
import { newGame, load, remove, slotSummary, save } from './game/state.js';

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const mobile = matchMedia('(pointer: coarse)').matches;

function fail(msg) {
  $('loading-text').textContent = msg;
  $('loading-fill').style.width = '0%';
}

async function boot() {
  let renderer;
  try {
    renderer = createRenderer(canvas, { mobile });
  } catch {
    fail('This game needs WebGL 2 — try a recent Chrome, Edge, Firefox or Safari.');
    return;
  }
  const scene = new THREE.Scene();
  // soft image-based light so materials read as real surfaces, not flat paint
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.2;
  const gpu = gpuInfo(renderer);
  window.__gpu = gpu;
  const camera = new THREE.PerspectiveCamera(mobile ? 72 : 66, innerWidth / innerHeight, 0.05, 125);
  camera.layers.enable(1);
  const post = createComposer(renderer, scene, camera, { mobile });
  addEventListener('resize', () => post.resize());
  const input = new Input(canvas);

  const game = new Game({ renderer, post, scene, camera, input, state: newGame(0) });
  window.__game = game; // handy for debugging in the console
  window.__audio = audio;
  const fill = $('loading-fill');
  const text = $('loading-text');
  const lines = ['Lighting the lamps…', 'Sweeping the porch…', 'Waking the cat…', 'Planting pines…', 'Pouring the first candle…'];
  let li = 0;
  const lineTimer = setInterval(() => { text.textContent = lines[++li % lines.length]; }, 1400);
  try {
    await game.build((k) => { fill.style.width = `${Math.round(k * 100)}%`; });
  } catch (e) {
    clearInterval(lineTimer);
    console.error(e);
    fail('Something went wrong while loading. Please refresh.');
    return;
  }
  clearInterval(lineTimer);
  await game.applyState(newGame(0));
  post.onChange = (tier, t) => {
    const shadows = !!t.shadows;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    }
    game.world.setLightBudget(t.lights, shadows);
  };
  post.outlines = !!game.settings?.outlines;
  post.setMode(game.settings?.quality || 'auto');

  // title camera: a slow cinematic drift past the shop front, framed to the right of the menu
  let titleT = 0;
  const titleCam = (dt) => {
    titleT += dt;
    const a = Math.sin(titleT * 0.05);
    const wide = innerWidth > 720;
    camera.position.set(6.2 + a * 2.2, 2.0 + Math.sin(titleT * 0.09) * 0.12, 11.6 - a * 0.8);
    camera.lookAt(wide ? -0.6 + a * 0.5 : 1.8, 1.7, 3.2);
    game.world.update(dt, { hour: 21.5, playerPos: camera.position });
  };

  const sub = (title, show) => {
    $('menu').hidden = true;
    $('menu-sub').hidden = false;
    $('menu-sub-title').textContent = title;
    $('slots').hidden = show !== 'slots';
    $('menu-how').hidden = show !== 'how';
  };
  const latestSlot = () => {
    let best = null;
    for (let i = 0; i < 3; i++) { const sum = slotSummary(i); if (sum && (!best || (sum.savedAt || 0) > (best.sum.savedAt || 0))) best = { i, sum }; }
    return best;
  };
  const showMenu = () => {
    $('loading').hidden = true;
    $('menu-sub').hidden = true;
    $('menu').hidden = false;
    const last = latestSlot();
    $('m-continue').hidden = !last;
    if (last) $('m-continue-sub').textContent = `Shop ${last.i + 1} · Night ${last.sum.night} · ${last.sum.lit} windows lit`;
    $('m-play').querySelector('small').textContent = last ? 'New shop or another save' : 'Open your little light shop';
    if (!last) $('m-play').classList.add('primary'); else $('m-play').classList.remove('primary');
    if (window.__gpu?.software) $('gpu-warn').hidden = false;
  };
  const showSlots = () => {
    sub('Your shops', 'slots');
    const wrap = $('slots');
    wrap.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const sum = slotSummary(i);
      const b = document.createElement('div');
      b.className = 'slot';
      b.tabIndex = 0;
      b.setAttribute('role', 'button');
      b.innerHTML = sum
        ? `<div><b>Shop ${i + 1} · Night ${sum.night}</b><small>Level ${sum.level} · ${sum.coins.toFixed(2)} coins · ${sum.lit} windows lit</small></div><button class="del" data-del="${i}">Delete</button>`
        : `<div><b>New shop ${i + 1}</b><small>Start fresh at the edge of the forest</small></div><span class="go" aria-hidden="true">→</span>`;
      const go = (e) => { if (e.target.dataset.del) return; begin(i); };
      b.addEventListener('click', go);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') begin(i); });
      wrap.appendChild(b);
    }
    wrap.querySelectorAll('[data-del]').forEach((d) => d.addEventListener('click', (e) => {
      e.stopPropagation();
      if (d.dataset.confirm) { remove(+d.dataset.del); showSlots(); return; }
      d.dataset.confirm = '1';
      d.textContent = 'Really delete?';
    }));
  };
  $('m-continue').addEventListener('click', () => { const last = latestSlot(); if (last) begin(last.i); });
  $('m-play').addEventListener('click', showSlots);
  $('m-settings').addEventListener('click', () => { audio.start(); game.ui.menu({ title: true }); });
  $('m-how').addEventListener('click', () => sub('How to play', 'how'));
  $('m-credits').addEventListener('click', () => game.ui.credits());
  $('m-back').addEventListener('click', showMenu);
  document.body.classList.add('on-title');

  let playing = false;
  let starting = false;
  const begin = async (slot) => {
    if (starting) return;
    starting = true;
    await audio.start();
    const state = load(slot) || newGame(slot);
    save(state);
    $('fade').classList.add('on');
    await new Promise((r) => setTimeout(r, 650));
    $('title').classList.remove('is-open');
    document.body.classList.remove('on-title');
    await game.applyState(state);
    game.start();
    playing = true;
    starting = false;
    $('fade').classList.remove('on');
  };

  game.onQuit = async () => {
    save(game.state);
    $('fade').classList.add('on');
    await new Promise((r) => setTimeout(r, 650));
    game.stop();
    input.exitLock();
    playing = false;
    $('title').classList.add('is-open');
    document.body.classList.add('on-title');
    showMenu();
    $('fade').classList.remove('on');
  };

  if (input.touch) document.querySelector('.title-foot').textContent = 'Best with headphones · left stick to walk · drag to look · tap things to use them';
  showMenu();

  const clock = new THREE.Clock();
  const frame = () => {
    const raw = clock.getDelta();
    const dt = Math.min(0.05, raw);
    if (!document.hidden) post.measure(raw);
    if (playing) game.update(dt);
    else titleCam(dt);
    post.render(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
