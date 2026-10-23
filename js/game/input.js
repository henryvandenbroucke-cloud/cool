// Input: keyboard + pointer-locked mouse on desktop, a thumbstick and drag-to-look
// on touch. Systems read `input.move`, `input.look` and subscribe to actions.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, z: 0 };
    this.look = { x: 0, y: 0 };
    this.sprint = false;
    this.handlers = new Map();
    this.enabled = true;
    this.locked = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.sens = 0.0022;
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0, moved: 0 };
    this.bind();
  }

  on(action, fn) { (this.handlers.get(action) || this.handlers.set(action, []).get(action)).push(fn); }
  emit(action, e) { for (const fn of this.handlers.get(action) || []) fn(e); }

  requestLock() {
    if (this.touch) return;
    try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* some browsers throw */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock?.(); }

  bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault(); return; }
      if (e.target instanceof HTMLInputElement) return;
      this.keys.add(e.code);
      const map = { KeyE: 'drop', KeyQ: 'cycle', Escape: 'escape', Tab: 'menu', KeyP: 'photo', KeyF: 'use', KeyR: 'back', Space: 'jump', KeyM: 'menu' };
      if (map[e.code]) { e.preventDefault(); this.emit(map[e.code], e); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.emit('lock', this.locked);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.look.x += e.movementX * this.sens;
      this.look.y += e.movementY * this.sens;
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      if (!this.locked) { this.emit('click-unlocked', e); return; }
      if (e.button === 0) this.emit('use', e);
      if (e.button === 2) this.emit('back', e);
    });
    this.canvas.addEventListener('mouseup', (e) => { if (e.button === 0) this.emit('use-up', e); });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => { if (this.locked) this.emit('cycle', e); }, { passive: true });

    // ---- touch ----
    const stickEl = document.getElementById('stick');
    const knob = stickEl?.querySelector('i');
    stickEl?.addEventListener('pointerdown', (e) => {
      this.stick.id = e.pointerId;
      const r = stickEl.getBoundingClientRect();
      this.stick.ox = r.left + r.width / 2;
      this.stick.oy = r.top + r.height / 2;
      stickEl.setPointerCapture(e.pointerId);
    });
    stickEl?.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const len = Math.hypot(dx, dy), max = 46;
      if (len > max) { dx *= max / len; dy *= max / len; }
      this.stick.x = dx / max; this.stick.y = dy / max;
      if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const endStick = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null; this.stick.x = this.stick.y = 0;
      if (knob) knob.style.transform = '';
    };
    stickEl?.addEventListener('pointerup', endStick);
    stickEl?.addEventListener('pointercancel', endStick);

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.touch = true;
      if (this.lookTouch.id !== null) return;
      this.lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), sx: e.clientX, sy: e.clientY };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookTouch.id || !this.enabled) return;
      const dx = e.clientX - this.lookTouch.x, dy = e.clientY - this.lookTouch.y;
      this.lookTouch.x = e.clientX; this.lookTouch.y = e.clientY;
      this.lookTouch.moved += Math.abs(dx) + Math.abs(dy);
      this.look.x += dx * 0.0055;
      this.look.y += dy * 0.0055;
    });
    const endLook = (e) => {
      if (e.pointerId !== this.lookTouch.id) return;
      const tap = this.lookTouch.moved < 10 && performance.now() - this.lookTouch.t < 300;
      if (tap) this.emit('tap', { x: e.clientX, y: e.clientY });
      this.lookTouch.id = null;
    };
    this.canvas.addEventListener('pointerup', endLook);
    this.canvas.addEventListener('pointercancel', endLook);

    const tb = (id, action) => {
      const el = document.getElementById(id);
      el?.addEventListener('pointerdown', (e) => { e.preventDefault(); this.emit(action, e); });
      if (action === 'use') el?.addEventListener('pointerup', (e) => this.emit('use-up', e));
    };
    tb('t-use', 'use');
    tb('t-back', 'back');
    tb('t-drop', 'drop');
  }

  update() {
    let x = 0, z = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.stick.id !== null) { x += this.stick.x; z += this.stick.y; }
    }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.x = x; this.move.z = z;
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return l;
  }
}
