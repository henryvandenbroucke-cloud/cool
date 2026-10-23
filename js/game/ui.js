// Paper-and-ink interface: HUD chips, toasts and the modal panels (ledger,
// price tags, checkout, dawn summary, corkboard, settings).

import { audio, TRACKS } from './audio.js';
import { LICENCES, REGULARS, WEATHERS } from './config.js';
import {
  levelProgress, orderable, orderBox, buyLicence, canBuyLicence, priceFor, setPrice, marketPrice, unitCost,
  productName, priceMood, totalWindows, wishLabel, levelFor, productStars,
} from './state.js';

const $ = (id) => document.getElementById(id);
const money = (v) => (Math.round(v * 100) / 100).toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor({ getState, input, onPanelClose }) {
    this.getState = getState;
    this.input = input;
    this.onPanelClose = onPanelClose;
    this.panelOpen = false;
    this.el = {
      hud: $('hud'), time: $('hud-time'), night: $('hud-night'), phase: $('hud-phase'), weather: $('hud-weather'),
      coins: $('hud-coins'), coinsChip: document.querySelector('.chip.coins'), level: $('hud-level'), xp: $('hud-xp'),
      lit: $('hud-lit'), litTotal: $('hud-lit-total'), prompt: $('prompt'), cross: $('crosshair'), held: $('held'),
      toasts: $('toasts'), hint: $('hint'), wrap: $('panel-wrap'), panel: $('panel'), title: $('panel-title'), body: $('panel-body'),
      touch: $('touch'), stationTitle: $('station-title'),
    };
    $('panel-close').addEventListener('click', () => this.closePanel());
    this.el.wrap.addEventListener('pointerdown', (e) => { if (e.target === this.el.wrap) this.closePanel(); });
    $('btn-menu').addEventListener('click', () => this.menu());
    this.lastCoins = null;
  }

  setHud(on) {
    this.el.hud.hidden = !on;
    if (this.input.touch) this.el.touch.hidden = !on;
  }
  setStationTitle(t) { this.el.stationTitle.textContent = t; }

  update(s, hourText) {
    const lp = levelProgress(s.xp);
    this.el.time.textContent = s.phase === 'prep' ? 'Prep' : hourText;
    this.el.night.textContent = `Night ${s.night}`;
    this.el.phase.classList.toggle('day', s.phase === 'prep');
    this.el.weather.textContent = `${WEATHERS[s.weather]?.icon ?? ''} ${s.phase === 'prep' ? 'Morning' : WEATHERS[s.weather]?.name ?? ''}`;
    const c = money(s.coins);
    if (c !== this.lastCoins) {
      this.el.coins.textContent = c;
      if (this.lastCoins !== null) { this.el.coinsChip.classList.remove('bump'); void this.el.coinsChip.offsetWidth; this.el.coinsChip.classList.add('bump'); }
      this.lastCoins = c;
    }
    this.el.level.textContent = lp.level;
    this.el.xp.style.width = `${lp.frac * 100}%`;
    this.el.lit.textContent = s.lit.length;
    this.el.litTotal.textContent = totalWindows();
  }

  prompt(text, hot = false) {
    if (text) this.el.prompt.innerHTML = text;
    this.el.prompt.classList.toggle('on', !!text);
    this.el.cross.classList.toggle('hot', hot);
  }

  held(text) {
    this.el.held.hidden = !text;
    if (text) this.el.held.innerHTML = text;
  }

  hint(text) { this.el.hint.innerHTML = text || ''; }

  toast(text, icon = '✦', secs = 3.4) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="t-ico">${icon}</span>${text}`;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, secs * 1000);
  }

  // ---------- panels ----------
  openPanel(title, html, { wide = false, onClose } = {}) {
    this.panelOpen = true;
    this.input.enabled = false;
    this.input.exitLock();
    this.el.title.textContent = title;
    this.el.body.innerHTML = html;
    this.el.panel.classList.toggle('wide', wide);
    this.el.wrap.hidden = false;
    this.el.panel.style.animation = 'none'; void this.el.panel.offsetWidth; this.el.panel.style.animation = '';
    this.panelClose = onClose;
    audio.play('page', { volume: 0.5 });
    return this.el.body;
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    this.el.wrap.hidden = true;
    this.input.enabled = true;
    const cb = this.panelClose;
    this.panelClose = null;
    cb?.();
    this.onPanelClose?.();
    this.resumePointer();
  }

  resumePointer() {
    if (!this.input.touch) this.input.requestLock();
  }

  // ---------- ledger / catalogue ----------
  ledger(tab = 'order', cart = {}) {
    const s = this.getState();
    const lv = levelFor(s.xp);
    const items = orderable(s);
    let html = `<div class="tabs"><button class="tab ${tab === 'order' ? 'on' : ''}" data-tab="order">Order stock</button><button class="tab ${tab === 'licences' ? 'on' : ''}" data-tab="licences">Licences</button><button class="tab ${tab === 'townsfolk' ? 'on' : ''}" data-tab="townsfolk">Townsfolk</button></div>`;
    if (tab === 'order') {
      html += `<p class="muted small">Boxes arrive on the porch straight away. You have <b>${money(s.coins)}</b> coins.</p><div class="cards">`;
      for (const it of items) {
        const info = it.item;
        const locked = !it.ok;
        const sub = it.kind === 'supply' ? `${info.uses} crafts` : `${info.boxQty} per box · sells ${money(info.market)}`;
        html += `<div class="card ${locked ? 'locked' : ''}"><div class="swatch">${info.icon}</div><h4>${esc(info.name)}</h4><span class="small muted">${sub}</span><span class="small muted">${esc(info.blurb)}</span><div class="row"><span class="price">${money(it.boxPrice)}</span><span class="spacer"></span>${locked ? `<span class="tag">${info.licence ? LICENCES[info.licence].name : 'Lv ' + info.level}</span>` : `<button class="btn small" data-add="${it.key}">+ Box</button>`}</div>${cart[it.key] ? `<span class="tag">${cart[it.key]} in cart</span>` : ''}</div>`;
      }
      html += '</div>';
      const keys = Object.keys(cart).filter((k) => cart[k] > 0);
      const total = keys.reduce((a, k) => a + cart[k] * (items.find((i) => i.key === k)?.boxPrice || 0), 0);
      html += `<div class="cart"><b>Order slip</b>${keys.length ? `<ul>${keys.map((k) => `<li>${cart[k]} × ${esc(items.find((i) => i.key === k).item.name)} <button class="btn small ghost" data-rem="${k}">−</button></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet — tap “+ Box”.</p>'}<div class="row"><span>Total <b>${money(total)}</b></span><span class="spacer"></span><button class="btn amber" id="place-order" ${!keys.length || total > s.coins ? 'disabled' : ''}>Place order</button></div></div>`;
    } else if (tab === 'licences') {
      html += `<p class="muted small">You're level <b>${lv}</b>. Licences unlock new things to make and sell.</p><div class="cards">`;
      for (const [id, L] of Object.entries(LICENCES)) {
        const owned = s.licences.includes(id);
        const can = canBuyLicence(s, id);
        html += `<div class="card ${owned || L.soon ? '' : lv < L.level ? 'locked' : ''}"><h4>${esc(L.name)}</h4><span class="small muted">${esc(L.blurb)}</span><div class="row"><span class="price">${L.soon ? '—' : money(L.price)}</span><span class="spacer"></span>${owned ? '<span class="tag">Owned</span>' : L.soon ? '<span class="tag">Coming soon</span>' : lv < L.level ? `<span class="tag">Lv ${L.level}</span>` : `<button class="btn small amber" data-lic="${id}" ${can ? '' : 'disabled'}>Buy</button>`}</div></div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="cards">';
      for (const [id, R] of Object.entries(REGULARS)) {
        const met = s.met.includes(id);
        const rep = s.rep[id] || 0;
        html += `<div class="card ${met ? '' : 'locked'}"><h4>${met ? esc(R.name) : '???'}</h4><span class="small muted">${met ? esc(R.role) + ' — ' + esc(R.blurb) : `Visits from night ${R.from}`}</span><div class="xpbar" style="width:100%;height:8px;background:#e2cfa9"><i style="width:${rep}%;background:#d9822b"></i></div><span class="small muted">Friendship ${rep}/100</span></div>`;
      }
      html += '</div>';
    }
    const body = this.openPanel('The Shop Ledger', html, { wide: true });
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.ledger(b.dataset.tab, cart)));
    body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1; audio.play('paper', { volume: 0.5 }); this.ledger('order', cart); }));
    body.querySelectorAll('[data-rem]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.rem]--; this.ledger('order', cart); }));
    body.querySelectorAll('[data-lic]').forEach((b) => b.addEventListener('click', () => {
      if (buyLicence(s, b.dataset.lic)) { audio.play('coin_stack', { volume: 0.7 }); this.toast(`Licence: ${LICENCES[b.dataset.lic].name}!`, '📜'); this.onLicence?.(b.dataset.lic); }
      this.ledger('licences', cart);
    }));
    body.querySelector('#place-order')?.addEventListener('click', () => {
      let n = 0;
      for (const [k, q] of Object.entries(cart)) if (q > 0) { const made = orderBox(s, k, q); if (made) { n += made.length; this.onOrder?.(made); } }
      audio.play('coins', { volume: 0.6 });
      this.toast(`${n} box${n === 1 ? '' : 'es'} on the porch!`, '📦');
      this.closePanel();
    });
  }

  // ---------- price tag ----------
  priceTag(key, onChange) {
    const s = this.getState();
    const market = marketPrice(key);
    const cost = unitCost(key);
    let p = priceFor(s, key);
    const render = () => {
      const mood = priceMood(p, market);
      const stars = productStars(key);
      const html = `<p class="muted">${esc(productName(key))}${stars ? ' · ' + '★'.repeat(stars) : ''}</p>
        <div class="price-grid"><div><small>Your cost</small><b>${money(cost)}</b></div><div><small>Market</small><b>${money(market)}</b></div><div><small>Profit</small><b style="color:${p - cost >= 0 ? '#5e8a6c' : '#b85a4c'}">${money(p - cost)}</b></div></div>
        <div class="stepper"><button class="btn" data-d="-1">−1</button><button class="btn" data-d="-0.1">−.1</button><output>${money(p)}</output><button class="btn" data-d="0.1">+.1</button><button class="btn" data-d="1">+1</button></div>
        <p class="mood" style="color:${mood.tone === 'sage' ? '#5e8a6c' : mood.tone === 'amber' ? '#b8742b' : '#b85a4c'}">${mood.text}</p>
        <div class="row"><button class="btn ghost" id="pm">Market price</button><span class="spacer"></span><button class="btn sage" id="pok">Set price</button></div>`;
      const body = this.panelOpen ? this.el.body : this.openPanel('Price tag', html);
      body.innerHTML = html;
      body.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { p = Math.max(0.1, Math.round((p + +b.dataset.d) * 100) / 100); audio.play('key_click', { volume: 0.35 }); render(); }));
      body.querySelector('#pm').addEventListener('click', () => { p = market; render(); });
      body.querySelector('#pok').addEventListener('click', () => { setPrice(s, key, p); onChange?.(); audio.play('paper', { volume: 0.5 }); this.closePanel(); });
    };
    this.openPanel('Price tag', '');
    render();
  }

  // ---------- checkout ----------
  checkout(c, total, onDone) {
    const name = esc(c.info.name);
    if (c.payWith === 'card') {
      let typed = '';
      const render = () => {
        const html = `<div class="pay"><p>${name} taps a card. Key in the total:</p><div class="row"><span class="muted">Total due</span><span class="spacer"></span><span class="big">${money(total)}</span></div>
          <div class="screen-lcd">${typed ? money(+typed / 100) : '0.00'}</div>
          <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>
          <p class="muted small" style="text-align:center">Type the digits, e.g. 4·5·0 for 4.50</p></div>`;
        const body = this.panelOpen ? this.el.body : this.openPanel('Card payment', html);
        body.innerHTML = html;
        body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.k;
          audio.play('key_click', { volume: 0.45 });
          if (k === 'C') typed = '';
          else if (k === '✓') {
            if (Math.abs(+typed / 100 - total) < 0.001) { this.closePanel(); onDone(total); return; }
            this.toast('Not quite — check the total.', '💳', 2);
            typed = '';
          } else if (typed.length < 6) typed += k;
          render();
        }));
      };
      this.openPanel('Card payment', '');
      render();
      return;
    }
    const notes = [20, 10, 5];
    const paid = notes.find((n, i) => n >= total && (notes[i + 1] === undefined || notes[i + 1] < total)) ?? Math.ceil(total / 5) * 5;
    const due = Math.round((paid - total) * 100) / 100;
    let given = 0;
    const denoms = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];
    const render = () => {
      const left = Math.round((due - given) * 100) / 100;
      const html = `<div class="pay"><p>${name} hands you <b>${money(paid)}</b>.</p>
        <div class="price-grid"><div><small>Total</small><b>${money(total)}</b></div><div><small>Change due</small><b>${money(due)}</b></div><div><small>Given</small><b style="color:${left < 0 ? '#b85a4c' : '#5e8a6c'}">${money(given)}</b></div></div>
        <div class="money">${denoms.map((d) => `<button class="${d < 1 ? 'coin' : ''}" data-v="${d}" ${d - left > 0.001 ? 'disabled style="opacity:.35"' : ''}>${d < 1 ? Math.round(d * 100) + '¢' : d}</button>`).join('')}</div>
        <div class="row"><button class="btn ghost" id="undo">Undo</button><button class="btn ghost" id="auto">Count it for me</button><span class="spacer"></span><button class="btn sage" id="give" ${Math.abs(left) > 0.001 ? 'disabled' : ''}>Give change</button></div></div>`;
      const body = this.panelOpen ? this.el.body : this.openPanel('Cash payment', html);
      body.innerHTML = html;
      body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { given = Math.round((given + +b.dataset.v) * 100) / 100; this.stack.push(+b.dataset.v); audio.play(+b.dataset.v < 1 ? 'coin_stack' : 'paper', { volume: 0.5 }); render(); }));
      body.querySelector('#undo').addEventListener('click', () => { const v = this.stack.pop(); if (v) given = Math.round((given - v) * 100) / 100; render(); });
      body.querySelector('#auto').addEventListener('click', () => {
        let rem = Math.round((due - given) * 100);
        for (const d of denoms) { const c2 = Math.round(d * 100); while (rem >= c2) { rem -= c2; given = Math.round((given + d) * 100) / 100; this.stack.push(d); } }
        audio.play('coins', { volume: 0.6 });
        render();
      });
      body.querySelector('#give').addEventListener('click', () => { this.closePanel(); onDone(total); });
    };
    this.stack = [];
    if (due <= 0.001) {
      this.openPanel('Cash payment', `<div class="pay"><p>${name} pays exactly <b>${money(total)}</b>. No change needed!</p><button class="btn sage" id="give">Take payment</button></div>`).querySelector('#give').addEventListener('click', () => { this.closePanel(); onDone(total); });
      return;
    }
    this.openPanel('Cash payment', '');
    render();
  }

  // ---------- dawn ----------
  summary(sum, onNext) {
    const s = this.getState();
    const reps = Object.entries(sum.repGain || {}).filter(([, v]) => v > 0).map(([id, v]) => `${REGULARS[id].name} +${v}`).join(' · ');
    const html = `<p class="muted">The sky goes pink over the pines. ${WEATHERS[sum.weather]?.name ?? ''} night ${sum.night} is done.</p>
      <div class="summary"><div><small>Earned</small><b>${money(sum.earned)}</b></div><div><small>Items sold</small><b>${sum.sold}</b></div><div><small>Visitors</small><b>${sum.customers}</b></div><div><small>New windows lit</small><b>${sum.newLit}</b></div></div>
      ${reps ? `<p>Friendship: ${esc(reps)}</p>` : ''}
      ${sum.pricey ? `<p class="small muted">${sum.pricey} time${sum.pricey === 1 ? '' : 's'} someone found a price too high.</p>` : ''}
      ${sum.missed ? `<p class="small muted">${sum.missed} wish${sum.missed === 1 ? '' : 'es'} went unmet — check the corkboard.</p>` : ''}
      ${sum.letter ? '<p>📮 A letter has been pinned to the corkboard.</p>' : ''}
      <p class="small muted">Saved. ${s.lit.length}/${totalWindows()} windows glow in the village.</p>
      <div class="row"><span class="spacer"></span><button class="btn amber" id="next">Good morning ☀</button></div>`;
    this.openPanel(`Dawn — Night ${sum.night}`, html, { onClose: onNext }).querySelector('#next').addEventListener('click', () => this.closePanel());
  }

  // ---------- corkboard ----------
  board(onRead) {
    const s = this.getState();
    const notes = [];
    s.letters.slice().reverse().forEach((l, i) => notes.push(`<button class="note letter-note ${l.read ? '' : 'unread'}" style="--rot:${(i % 3) - 1}deg" data-l="${esc(l.id)}">💌 <b>${esc(l.from)}</b></button>`));
    s.wishes.forEach((w, i) => notes.push(`<div class="note" style="--rot:${((i + 1) % 3) - 1}deg">📝 <b>${esc(w.name)}</b> wished for a <b>${esc(wishLabel(w.pattern))}</b></div>`));
    const html = notes.length ? `<div class="board">${notes.join('')}</div>` : '<p class="muted">Nothing pinned yet. Wishes and letters from townsfolk will appear here.</p>';
    const body = this.openPanel('Corkboard', html, { wide: true });
    body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
      const l = s.letters.find((x) => x.id === b.dataset.l);
      if (!l) return;
      l.read = true;
      onRead?.();
      audio.play('paper', { volume: 0.6 });
      body.innerHTML = `<div class="letter">${esc(l.text).replace(/\n/g, '<br>')}<div class="sig">— ${esc(l.from)}</div></div><div class="row" style="margin-top:14px"><button class="btn ghost" id="back">Back to board</button></div>`;
      body.querySelector('#back').addEventListener('click', () => { this.closePanel(); this.board(onRead); });
    }));
  }

  // ---------- menu ----------
  menu() {
    const st = audio.settings;
    const html = `<div class="settings">
      ${['master', 'music', 'amb', 'sfx'].map((k) => `<label>${{ master: 'Master', music: 'Radio', amb: 'Ambience', sfx: 'Effects' }[k]}<input type="range" min="0" max="1" step="0.05" value="${st[k]}" data-vol="${k}"><output>${Math.round(st[k] * 100)}</output></label>`).join('')}
      <label class="check"><input type="checkbox" id="bob" ${this.headBob !== false ? 'checked' : ''}> Head bob</label>
      <label>Mouse speed<input type="range" min="0.0008" max="0.005" step="0.0002" value="${this.input.sens}" id="sens"><output></output></label>
      <p class="small muted">Controls: <kbd>WASD</kbd> move · <kbd>Shift</kbd> stroll faster · <kbd>Click</kbd> use / place · <kbd>Right-click</kbd> take back · <kbd>E</kbd> put a box down · <kbd>P</kbd> photo mode · <kbd>Esc</kbd> release mouse</p>
      <div class="row"><button class="btn ghost" id="photo">Photo mode</button><button class="btn ghost" id="credits">Credits</button><span class="spacer"></span><button class="btn ghost" id="quit">Save &amp; quit to title</button></div></div>`;
    const body = this.openPanel('Settings', html);
    body.querySelectorAll('[data-vol]').forEach((r) => r.addEventListener('input', () => { st[r.dataset.vol] = +r.value; r.nextElementSibling.textContent = Math.round(r.value * 100); audio.applySettings(); this.onSettings?.(); }));
    body.querySelector('#bob').addEventListener('change', (e) => { this.headBob = e.target.checked; this.onSettings?.(); });
    body.querySelector('#sens').addEventListener('input', (e) => { this.input.sens = +e.target.value; this.onSettings?.(); });
    body.querySelector('#photo').addEventListener('click', () => { this.closePanel(); this.onPhoto?.(); });
    body.querySelector('#quit').addEventListener('click', () => { this.closePanel(); this.onQuit?.(); });
    body.querySelector('#credits').addEventListener('click', () => this.credits());
  }

  credits() {
    this.openPanel('Credits', `<p><b>Lantern &amp; Lens</b> — made with three.js.</p>
      <p class="small">3D models: <b>Kenney</b> (Furniture Kit, Nature Kit, Mini Characters, Cube Pets, Holiday Kit, Survival Kit) — CC0. Cottages, shop and products are modelled in code.</p>
      <p class="small">Sound: <b>Kenney</b> (RPG Audio, Impact Sounds, Casino Audio) — CC0. From OpenGameArt (all CC0): “Rain (loopable)”, “Crickets Ambient Noise”, “Cat Purr &amp; Meow”, “Doorbell ring” (old shop bell), “100 CC0 SFX”, “30 CC0 SFX loops”, “Park ambiences”, “Clock wind sounds” by Brian MacIntosh, “Fire crackling”.</p>
      <p class="small">Radio (CC0, OpenGameArt): “Apple Cider”, “Catmint” by Kistol, “Cozy Puzzle” music, “Chill lofi inspired” by omfgdude (loop edit by qubodup).</p>
      <p class="small">Fonts: Fredoka and Nunito (SIL Open Font License).</p>`);
  }

  radioToast(track, on) {
    this.toast(on ? `Radio: ${track?.name ?? TRACKS[audio.radio.index].name}` : 'Radio off', '📻', 2.2);
  }
}

export { money };
