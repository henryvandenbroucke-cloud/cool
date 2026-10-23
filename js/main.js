// Boot: renderer, title screen with three save slots, then the frame loop.

import * as THREE from 'three';
import { createRenderer, createComposer } from './game/render.js';
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
  const camera = new THREE.PerspectiveCamera(mobile ? 72 : 66, innerWidth / innerHeight, 0.05, 400);
  camera.layers.enable(1);
  const post = createComposer(renderer, scene, camera, { mobile });
  addEventListener('resize', () => post.resize());
  const input = new Input(canvas);

  const game = new Game({ renderer, post, scene, camera, input, state: newGame(0) });
  window.__game = game; // handy for debugging in the console
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
  game.applyState(newGame(0));

  // idle title camera: slowly drift over the village
  let titleT = 0;
  const titleCam = (dt) => {
    titleT += dt;
    const a = Math.sin(titleT * 0.06) * 0.35;
    camera.position.set(2.4 + Math.sin(a) * 6, 2.6 + Math.sin(titleT * 0.1) * 0.15, 12.2 - Math.abs(Math.sin(a)) * 1.5);
    camera.lookAt(0.6, 2.0, 2.5);
    game.world.update(dt, { hour: 21, playerPos: camera.position });
  };

  const showSlots = () => {
    $('loading').hidden = true;
    const wrap = $('slots');
    wrap.hidden = false;
    wrap.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const sum = slotSummary(i);
      const b = document.createElement('div');
      b.className = 'slot';
      b.tabIndex = 0;
      b.setAttribute('role', 'button');
      b.innerHTML = sum
        ? `<div><b>Shop ${i + 1} · Night ${sum.night}</b><small>Level ${sum.level} · ${sum.coins.toFixed(2)} coins · ${sum.lit} windows lit</small></div><button class="del" data-del="${i}">Delete</button>`
        : `<div><b>New shop ${i + 1}</b><small>Start fresh at the edge of the forest</small></div><span aria-hidden="true">→</span>`;
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

  let playing = false;
  const begin = async (slot) => {
    await audio.start();
    const state = load(slot) || newGame(slot);
    save(state);
    $('fade').classList.add('on');
    await new Promise((r) => setTimeout(r, 650));
    $('title').classList.remove('is-open');
    game.applyState(state);
    game.start();
    playing = true;
    $('fade').classList.remove('on');
    if (state.tutorial === 0 && state.night === 1) game.ui.toast('Welcome to your little light shop!', '🕯', 4);
  };

  game.onQuit = async () => {
    save(game.state);
    $('fade').classList.add('on');
    await new Promise((r) => setTimeout(r, 650));
    game.stop();
    input.exitLock();
    playing = false;
    $('title').classList.add('is-open');
    showSlots();
    $('fade').classList.remove('on');
  };

  if (input.touch) document.querySelector('.title-foot').textContent = 'Best with headphones · left stick to walk · drag to look · tap things to use them';
  showSlots();

  const clock = new THREE.Clock();
  const frame = () => {
    const dt = Math.min(0.05, clock.getDelta());
    if (playing) game.update(dt);
    else titleCam(dt);
    post.render(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot();
