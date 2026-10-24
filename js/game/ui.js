// Storybook interface: wooden HUD plaques, pinned-note toasts, the leather
// ledger (stock, licences, expansions, decor, staff, townsfolk), the hanging
// price tag, the brass register, dawn report, corkboard and settings.

import { audio, TRACKS } from './audio.js';
import { LICENCES, REGULARS, WEATHERS, EXPANSIONS, DECOR, STAFF } from './config.js';
import {
  levelProgress, orderable, orderBox, buyLicence, canBuyLicence, priceFor, setPrice, marketPrice, unitCost,
  productName, priceMood, totalWindows, wishLabel, levelFor, productStars, seasonFor, canBuyExpansion, buyExpansion,
  canBuyDecor, buyDecor, canHire, hire, dismiss, coziness, parseKey,
} from './state.js';

const $ = (id) => document.getElementById(id);
const money = (v) => (Math.round(v * 100) / 100).toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const ico = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const coin = (v) => `<span class="price">${ico('i-coin')}${money(v)}</span>`;

/** Icon for any product key. */
export function productIcon(key) {
  const p = parseKey(key);
  if (p.kind === 'candle') return 'i-candle';
  if (p.kind === 'lamp') return 'i-lamp';
  if (p.kind === 'lens') return 'i-lens';
  if (p.kind === 'glass') return 'i-glass';
  if (p.kind === 'supply') return { candle_supplies: 'i-candle', lamp_kit: 'i-lamp', glass_blanks: 'i-lens', glass_sheets: 'i-glass' }[p.id] || 'i-box';
  return { matches: 'i-match', tealights: 'i-tin', oil: 'i-bottle', bulbs: 'i-bulb', lantern: 'i-lantern' }[p.id] || 'i-box';
}

export class UI {
  constructor({ getState, input, onPanelClose }) {
    this.getState = getState;
    this.input = input;
    this.onPanelClose = onPanelClose;
    this.panelOpen = false;
    this.el = {
      hud: $('hud'), time: $('hud-time'), night: $('hud-night'), dial: $('hud-dial'), dialFace: document.querySelector('.dial'), weather: $('hud-weather'),
      coins: $('hud-coins'), purse: document.querySelector('.purse'), level: $('hud-level'), xp: $('hud-xp'), seal: document.querySelector('.seal'),
      lit: $('hud-lit'), litTotal: $('hud-lit-total'), prompt: $('prompt'), cross: $('crosshair'), held: $('held'),
      toasts: $('toasts'), wrap: $('panel-wrap'), panel: $('panel'), title: $('panel-title'), body: $('panel-body'), pico: $('panel-ico'),
      touch: $('touch'), stationTitle: $('station-title'), fps: $('fps'),
      guide: $('guide'), guideNum: $('guide-num'), guideTitle: $('guide-title'), guideBody: $('guide-body'), guidePips: $('guide-pips'),
    };
    $('panel-close').addEventListener('click', () => this.closePanel());
    this.el.wrap.addEventListener('pointerdown', (e) => { if (e.target === this.el.wrap) this.closePanel(); });
    $('btn-menu').addEventListener('click', () => this.menu());
    $('guide-skip').addEventListener('click', () => this.onSkipTutorial?.());
    this.lastCoins = null;
    this.lastLevel = null;
    this.lastWeather = null;
    this.toastN = 0;
  }

  setHud(on) {
    this.el.hud.hidden = !on;
    if (this.input.touch) this.el.touch.hidden = !on;
  }
  setStationTitle(t) { this.el.stationTitle.textContent = t; }

  update(s, hourText, hour) {
    const lp = levelProgress(s.xp);
    const prep = s.phase === 'prep';
    this.el.time.textContent = prep ? 'Morning' : hourText;
    this.el.night.textContent = `Night ${s.night} · ${seasonFor(s.night).name}`;
    // the dial turns from sun (day) to moon (midnight) and back
    const h = prep ? 10 : hour;
    const turn = ((h - 12 + 24) % 24) / 24 * 360;
    this.el.dial.style.transform = `rotate(${turn}deg)`;
    this.el.dialFace.classList.toggle('day', prep);
    const w = prep ? 'clear' : s.weather;
    if (w !== this.lastWeather) {
      this.el.weather.innerHTML = ico(prep ? 'i-sun' : w === 'clear' ? 'i-moon' : WEATHERS[w]?.icon || 'i-moon');
      this.el.weather.title = prep ? 'Morning' : WEATHERS[w]?.name || '';
      this.lastWeather = w;
    }
    const c = money(s.coins);
    if (c !== this.lastCoins) {
      this.el.coins.textContent = c;
      if (this.lastCoins !== null) { this.el.purse.classList.remove('bump'); void this.el.purse.offsetWidth; this.el.purse.classList.add('bump'); }
      this.lastCoins = c;
    }
    if (lp.level !== this.lastLevel) {
      if (this.lastLevel !== null) { this.el.seal.classList.remove('up'); void this.el.seal.offsetWidth; this.el.seal.classList.add('up'); }
      this.el.level.textContent = lp.level;
      this.lastLevel = lp.level;
    }
    this.el.xp.style.strokeDashoffset = `${119.4 * (1 - lp.frac)}`;
    this.el.lit.textContent = s.lit.length;
    this.el.litTotal.textContent = totalWindows();
  }

  setFps(post, show) {
    this.el.fps.hidden = !show;
    if (show) this.el.fps.textContent = `${Math.round(post.fps)} fps · ${post.tier}${post.scale < 1 ? ` ${Math.round(post.scale * 100)}%` : ''}`;
  }

  /**
   * p: null | string | { use, alt, info }
   * use/alt are action labels shown with mouse (or tap) icons; info is plain text.
   */
  prompt(p, hot = false) {
    const el = this.el.prompt;
    if (!p) { el.classList.remove('on'); this.el.cross.classList.remove('hot'); this.lastPrompt = null; return; }
    const key = typeof p === 'string' ? p : JSON.stringify(p);
    if (key !== this.lastPrompt) {
      if (typeof p === 'string') el.innerHTML = `<span class="info">${p}</span>`;
      else {
        const t = this.input.touch;
        const parts = [];
        if (p.use) parts.push(`<span class="act">${ico(t ? 'i-tap' : 'i-mouse-l')}${p.use}</span>`);
        if (p.alt) parts.push(`<span class="act">${t ? '<kbd>Back</kbd>' : ico('i-mouse-r')}${p.alt}</span>`);
        if (p.info) parts.push(`<span class="info">${p.info}</span>`);
        el.innerHTML = parts.join('<span class="sep"></span>');
      }
      this.lastPrompt = key;
    }
    el.classList.add('on');
    this.el.cross.classList.toggle('hot', hot || (typeof p === 'object' && !!p.use));
  }

  held(h) {
    this.el.held.hidden = !h;
    if (!h) { this.lastHeld = null; return; }
    const html = `${ico(h.icon)}<span>${esc(h.name)}</span>${h.count !== undefined ? `<span class="count">${h.count}</span>` : ''}${h.note ? `<small>${esc(h.note)}</small>` : ''}`;
    if (html !== this.lastHeld) { this.el.held.innerHTML = html; this.lastHeld = html; }
  }

  toast(text, icon = 'i-sparkle', secs = 3.6) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.setProperty('--rot', `${((this.toastN++ % 3) - 1) * 0.8}deg`);
    const iconHtml = icon.startsWith('i-') ? ico(icon) : icon;
    t.innerHTML = `<span class="t-ico">${iconHtml}</span><span>${text}</span>`;
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.lastChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, secs * 1000);
  }

  // ---------- tutorial card ----------
  guide(step) {
    if (!step) { this.el.guide.hidden = true; return; }
    this.el.guide.hidden = false;
    this.el.guide.classList.toggle('done', !!step.done);
    this.el.guideNum.innerHTML = step.done ? ico('i-check') : step.icon ? ico(step.icon) : step.n;
    this.el.guideTitle.textContent = step.title;
    this.el.guideBody.innerHTML = step.body;
    this.el.guidePips.innerHTML = step.total ? Array.from({ length: step.total }, (_, i) => `<i class="${i < step.n - 1 || step.done ? 'done' : i === step.n - 1 ? 'on' : ''}"></i>`).join('') : '';
  }

  // ---------- panels ----------
  openPanel(title, html, { wide = false, onClose, icon = '', cls = '' } = {}) {
    this.panelOpen = true;
    document.body.classList.add('panel-open');
    this.input.enabled = false;
    this.input.exitLock();
    this.el.title.textContent = title;
    this.el.pico.innerHTML = icon ? ico(icon) : '';
    this.el.body.innerHTML = html;
    this.el.panel.className = `panel ${wide ? 'wide' : ''} ${cls}`;
    this.el.wrap.hidden = false;
    this.el.panel.style.animation = 'none'; void this.el.panel.offsetWidth; this.el.panel.style.animation = '';
    this.el.body.scrollTop = 0;
    this.panelClose = onClose;
    audio.play('page', { volume: 0.5 });
    return this.el.body;
  }

  closePanel() {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    document.body.classList.remove('panel-open');
    this.el.wrap.hidden = true;
    this.input.enabled = true;
    const cb = this.panelClose;
    this.panelClose = null;
    cb?.();
    this.onPanelClose?.();
    if (!this.keepPointer) this.resumePointer();
    this.keepPointer = false;
  }

  resumePointer() {
    if (!this.input.touch) this.input.requestLock();
  }

  // ---------- the ledger ----------
  ledger(tab = 'order', cart = {}) {
    const s = this.getState();
    const lv = levelFor(s.xp);
    const tabs = [
      ['order', 'i-box', 'Stock'], ['licences', 'i-ledger', 'Licences'], ['expand', 'i-house', 'Expand'],
      ['decor', 'i-flower', 'Decor'], ['staff', 'i-apron', 'Staff'], ['townsfolk', 'i-people', 'Townsfolk'],
    ];
    let html = `<div class="tabs">${tabs.map(([id, ic, label]) => `<button class="tab ${tab === id ? 'on' : ''}" data-tab="${id}">${ico(ic)}${label}${id === 'decor' && s.decorStore.length ? `<span class="badge">${s.decorStore.length}</span>` : ''}</button>`).join('')}</div>`;
    const locked = (lvNeed, extra = '') => `<span class="tag">${extra || `Level ${lvNeed}`}</span>`;
    if (tab === 'order') {
      const items = orderable(s);
      html += `<p class="muted small">Boxes are left on the porch straight away. Purse: <b>${money(s.coins)}</b></p><div class="cards">`;
      for (const it of items) {
        const info = it.item;
        const sub = it.kind === 'supply' ? `Workbench supplies · ${info.uses} crafts` : `${info.boxQty} per box · sells for ${money(info.market)}`;
        html += `<div class="card ${it.ok ? '' : 'locked'}"><div class="swatch">${ico(info.icon)}</div><h4>${esc(info.name)}</h4><span class="meta">${sub}</span><span class="blurb">${esc(info.blurb)}</span>
          <div class="foot">${coin(it.boxPrice)}<span class="spacer"></span>${it.ok ? `<button class="btn small" data-add="${it.key}">+ Box</button>` : ''}</div>
          ${!it.ok ? locked(info.level, info.licence && lv >= info.level ? `${LICENCES[info.licence].name} licence` : '') : cart[it.key] ? `<span class="tag ok">${cart[it.key]} in order</span>` : ''}</div>`;
      }
      html += '</div>';
      const keys = Object.keys(cart).filter((k) => cart[k] > 0);
      const total = keys.reduce((a, k) => a + cart[k] * (items.find((i) => i.key === k)?.boxPrice || 0), 0);
      html += `<div class="cart"><b class="title">Order slip</b>${keys.length ? `<ul>${keys.map((k) => `<li>${ico(items.find((i) => i.key === k).item.icon)} ${cart[k]} × ${esc(items.find((i) => i.key === k).item.name)} <span class="spacer"></span><button class="btn small ghost" data-rem="${k}">−</button></li>`).join('')}</ul>` : '<p class="muted small">Nothing yet — tap “+ Box” on anything above.</p>'}
        <div class="row"><span class="total">Total ${ico('i-coin')}${money(total)}</span><span class="spacer"></span><button class="btn amber" id="place-order" ${!keys.length || total > s.coins ? 'disabled' : ''}>Place order</button></div></div>`;
    } else if (tab === 'licences') {
      html += `<p class="muted small">You're shop level <b>${lv}</b>. Licences unlock new things to make and sell.</p><div class="cards">`;
      for (const [id, L] of Object.entries(LICENCES)) {
        const owned = s.licences.includes(id);
        const needs = L.requires && !s.expansions.includes(L.requires);
        html += `<div class="card ${owned ? '' : lv < L.level || needs ? 'locked' : ''}"><div class="swatch">${ico({ lamps: 'i-lamp', jar: 'i-candle', lavender: 'i-flower', brass: 'i-bell', lens: 'i-lens', glass: 'i-glass' }[id] || 'i-ledger')}</div><h4>${esc(L.name)}</h4><span class="blurb">${esc(L.blurb)}</span>
          <div class="foot">${coin(L.price)}<span class="spacer"></span>${owned ? '' : lv >= L.level && !needs ? `<button class="btn small amber" data-lic="${id}" ${canBuyLicence(s, id) ? '' : 'disabled'}>Buy</button>` : ''}</div>
          ${owned ? '<span class="tag ok">Owned</span>' : lv < L.level ? locked(L.level) : needs ? locked(0, `Needs ${EXPANSIONS[L.requires].name}`) : ''}</div>`;
      }
      html += '</div>';
    } else if (tab === 'expand') {
      html += '<p class="muted small">Grow the shop. Each expansion is built overnight — it\'s ready the moment you buy it.</p><div class="cards">';
      for (const [id, E] of Object.entries(EXPANSIONS)) {
        const owned = s.expansions.includes(id);
        html += `<div class="card ${owned ? '' : lv < E.level ? 'locked' : ''}"><div class="swatch">${ico(E.icon)}</div><h4>${esc(E.name)}</h4><span class="blurb">${esc(E.blurb)}</span>
          <div class="foot">${coin(E.price)}<span class="spacer"></span>${!owned && lv >= E.level ? `<button class="btn small amber" data-exp="${id}" ${canBuyExpansion(s, id) ? '' : 'disabled'}>Build</button>` : ''}</div>
          ${owned ? '<span class="tag ok">Built</span>' : lv < E.level ? locked(E.level) : ''}</div>`;
      }
      html += '</div>';
    } else if (tab === 'decor') {
      const cozy = coziness(s);
      html += `<p class="muted small">Decor makes the shop cozier: townsfolk linger and buy a little more. Coziness <b>${cozy}</b> · bonus +${Math.round(Math.min(8, cozy * 0.4))}% · more visitors at ${Math.ceil((cozy + 1) / 8) * 8}.</p>`;
      if (s.decorStore.length) {
        const counts = s.decorStore.reduce((m, t) => ((m[t] = (m[t] || 0) + 1), m), {});
        html += `<div class="section-title">${ico('i-crate')} In storage</div><div class="row">${Object.entries(counts).map(([t, n]) => `<button class="btn small" data-place="${t}">${ico(DECOR[t].icon)} Place ${esc(DECOR[t].name)}${n > 1 ? ` ×${n}` : ''}</button>`).join('')}</div>`;
      }
      html += `<div class="section-title">${ico('i-flower')} Catalogue</div><div class="cards">`;
      for (const [id, D] of Object.entries(DECOR)) {
        html += `<div class="card ${lv < D.level ? 'locked' : ''}"><div class="swatch">${ico(D.icon)}</div><h4>${esc(D.name)}</h4><span class="meta">${D.sells ? `Sells ${D.sells} more lines` : `+${D.cozy} cozy`}${D.outdoor ? ' · porch or yard' : ''}</span>
          <div class="foot">${coin(D.price)}<span class="spacer"></span>${lv >= D.level ? `<button class="btn small" data-decor="${id}" ${canBuyDecor(s, id) ? '' : 'disabled'}>Buy &amp; place</button>` : ''}</div>${lv < D.level ? locked(D.level) : ''}</div>`;
      }
      html += '</div><p class="muted small" style="margin-top:12px">Tip: look at placed decor and click to move it again.</p>';
    } else if (tab === 'staff') {
      html += '<p class="muted small">Helpers work the night shift and are paid their wage at dawn.</p><div class="cards">';
      for (const [id, S] of Object.entries(STAFF)) {
        const hired = s.staff.includes(id);
        html += `<div class="card ${hired || lv >= S.level ? '' : 'locked'}"><div class="swatch">${ico(S.icon)}</div><h4>${esc(S.name)} · ${esc(S.role)}</h4><span class="blurb">${esc(S.blurb)}</span>
          <div class="foot"><span class="price">${ico('i-coin')}${S.wage}<small class="muted">&nbsp;/ night</small></span><span class="spacer"></span>${hired ? `<button class="btn small ghost" data-fire="${id}">Let go</button>` : lv >= S.level ? `<button class="btn small sage" data-hire="${id}">Hire</button>` : ''}</div>
          ${hired ? '<span class="tag ok">Working</span>' : lv < S.level ? locked(S.level) : ''}</div>`;
      }
      html += '</div>';
    } else {
      html += '<div class="cards">';
      for (const [id, R] of Object.entries(REGULARS)) {
        const met = s.met.includes(id);
        const rep = s.rep[id] || 0;
        html += `<div class="card ${met ? '' : 'locked'}"><div class="swatch">${ico(met ? 'i-heart' : 'i-people')}</div><h4>${met ? esc(R.name) : 'Not met yet'}</h4><span class="blurb">${met ? esc(R.role) + ' — ' + esc(R.blurb) : `Usually visits from night ${R.from}.`}</span>
          <div class="meterbar"><i style="width:${rep}%"></i></div><span class="meta">Friendship ${rep}/100</span></div>`;
      }
      html += '</div>';
    }
    const body = this.openPanel('The Shop Ledger', html, { wide: true, icon: 'i-ledger' });
    body.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { audio.play('page', { volume: 0.4 }); this.ledger(b.dataset.tab, cart); }));
    body.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.add] = (cart[b.dataset.add] || 0) + 1; audio.play('paper', { volume: 0.5 }); this.ledger('order', cart); }));
    body.querySelectorAll('[data-rem]').forEach((b) => b.addEventListener('click', () => { cart[b.dataset.rem]--; this.ledger('order', cart); }));
    body.querySelectorAll('[data-lic]').forEach((b) => b.addEventListener('click', () => {
      if (buyLicence(s, b.dataset.lic)) { audio.play('coin_stack', { volume: 0.7 }); this.toast(`New licence: <b>${LICENCES[b.dataset.lic].name}</b>`, 'i-ledger'); this.onLicence?.(b.dataset.lic); }
      this.ledger('licences', cart);
    }));
    body.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => {
      if (buyExpansion(s, b.dataset.exp)) { audio.play('coin_stack', { volume: 0.7 }); this.onExpansion?.(b.dataset.exp); }
      this.ledger('expand', cart);
    }));
    body.querySelectorAll('[data-decor]').forEach((b) => b.addEventListener('click', () => {
      if (!buyDecor(s, b.dataset.decor)) return;
      audio.play('coins', { volume: 0.5 });
      this.keepPointer = true;
      this.closePanel();
      this.onPlaceDecor?.(b.dataset.decor);
    }));
    body.querySelectorAll('[data-place]').forEach((b) => b.addEventListener('click', () => { this.closePanel(); this.onPlaceDecor?.(b.dataset.place); }));
    body.querySelectorAll('[data-hire]').forEach((b) => b.addEventListener('click', () => {
      if (hire(s, b.dataset.hire)) { audio.play('shop_bell', { volume: 0.4 }); this.toast(`<b>${STAFF[b.dataset.hire].name}</b> joins the shop!`, STAFF[b.dataset.hire].icon); this.onStaff?.(); }
      this.ledger('staff', cart);
    }));
    body.querySelectorAll('[data-fire]').forEach((b) => b.addEventListener('click', () => { dismiss(s, b.dataset.fire); this.onStaff?.(); this.ledger('staff', cart); }));
    body.querySelector('#place-order')?.addEventListener('click', () => {
      let n = 0;
      for (const [k, q] of Object.entries(cart)) if (q > 0) { const made = orderBox(s, k, q); if (made) { n += made.length; this.onOrder?.(made); } }
      audio.play('coins', { volume: 0.6 });
      this.toast(`${n} box${n === 1 ? '' : 'es'} left on the porch`, 'i-box');
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
      const col = mood.tone === 'sage' ? '#5e8a6c' : mood.tone === 'amber' ? '#b8742b' : '#b85a4c';
      const pos = Math.max(0, Math.min(100, ((p / market - 0.6) / 1.1) * 100));
      this.el.body.innerHTML = `<p class="tag-title">${esc(productName(key))}</p><p class="tag-sub">${stars ? `<span style="color:#d9822b">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span> · ` : ''}price per item</p>
        <div class="stepper"><button class="btn small" data-d="-1">−1</button><button class="btn small" data-d="-0.1">−.1</button><output>${money(p)}</output><button class="btn small" data-d="0.1">+.1</button><button class="btn small" data-d="1">+1</button></div>
        <div class="slider-scale" title="cheap · fair · pricey"><b style="left:${pos}%"></b></div>
        <p class="mood" style="color:${col}"><i></i>${mood.text}</p>
        <div class="price-grid"><div><small>Cost</small><b>${money(cost)}</b></div><div><small>Market</small><b>${money(market)}</b></div><div><small>Profit</small><b style="color:${p - cost >= 0 ? '#5e8a6c' : '#b85a4c'}">${money(p - cost)}</b></div></div>
        <div class="row"><button class="btn ghost small" id="pm">Use market price</button><span class="spacer"></span><button class="btn sage" id="pok">${ico('i-check')}Set price</button></div>`;
      const body = this.el.body;
      body.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { p = Math.max(0.1, Math.round((p + +b.dataset.d) * 100) / 100); audio.play('key_click', { volume: 0.35 }); render(); }));
      body.querySelector('#pm').addEventListener('click', () => { p = market; render(); });
      body.querySelector('#pok').addEventListener('click', () => { setPrice(s, key, p); onChange?.(); audio.play('paper', { volume: 0.5 }); this.closePanel(); });
    };
    this.openPanel('Price tag', '', { cls: 'tag-panel' });
    render();
  }

  // ---------- checkout ----------
  checkout(c, total, onDone) {
    const name = esc(c.info.name);
    if (c.payWith === 'card') {
      let typed = '';
      const render = () => {
        this.el.body.innerHTML = `<div class="pay"><div class="register"><p class="who">${name} taps a card — key in the total.</p>
          <div class="screen-lcd"><small>CARD</small>${typed ? money(+typed / 100) : '0.00'}</div>
          <div class="lcd-row"><div><small>Total due</small>${money(total)}</div><div><small>Items</small>${c.basket.length}</div><div><small>Method</small>Card</div></div></div>
          <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '✓'].map((k) => `<button data-k="${k}" class="${k === '✓' ? 'ok' : ''}">${k}</button>`).join('')}</div>
          <p class="muted small" style="text-align:center;margin:0">Type the digits: 4 · 5 · 0 makes 4.50</p></div>`;
        this.el.body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.k;
          audio.play('key_click', { volume: 0.45 });
          if (k === 'C') typed = '';
          else if (k === '✓') {
            if (Math.abs(+typed / 100 - total) < 0.001) { this.closePanel(); onDone(total); return; }
            this.toast('Not quite — check the total on the register.', 'i-coin', 2);
            typed = '';
          } else if (typed.length < 6) typed += k;
          render();
        }));
      };
      this.openPanel('Card payment', '', { icon: 'i-coin' });
      render();
      return;
    }
    const notes = [20, 10, 5];
    const paid = notes.find((n, i) => n >= total && (notes[i + 1] === undefined || notes[i + 1] < total)) ?? Math.ceil(total / 5) * 5;
    const due = Math.round((paid - total) * 100) / 100;
    let given = 0;
    const denoms = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05];
    this.stack = [];
    const render = () => {
      const left = Math.round((due - given) * 100) / 100;
      this.el.body.innerHTML = `<div class="pay"><div class="register"><p class="who">${name} hands you ${money(paid)} — count out the change.</p>
        <div class="screen-lcd"><small>CHANGE</small>${money(Math.max(0, left))}</div>
        <div class="lcd-row"><div><small>Total</small>${money(total)}</div><div><small>Paid</small>${money(paid)}</div><div><small>Given</small>${money(given)}</div></div></div>
        <div class="money">${denoms.map((d) => `<button class="${d < 1 ? 'coin' : ''}" data-v="${d}" ${d - left > 0.001 ? 'disabled' : ''}>${d < 1 ? Math.round(d * 100) + '¢' : d}</button>`).join('')}</div>
        <div class="row"><button class="btn ghost small" id="undo">Undo</button><button class="btn ghost small" id="auto">Count it for me</button><span class="spacer"></span><button class="btn sage" id="give" ${Math.abs(left) > 0.001 ? 'disabled' : ''}>${ico('i-check')}Give change</button></div></div>`;
      const body = this.el.body;
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
    if (due <= 0.001) {
      this.openPanel('Cash payment', `<div class="pay"><div class="register"><p class="who">${name} pays exactly ${money(total)}.</p><div class="screen-lcd"><small>EXACT</small>${money(total)}</div></div><div class="row"><span class="spacer"></span><button class="btn sage" id="give">${ico('i-check')}Take payment</button></div></div>`, { icon: 'i-coin' })
        .querySelector('#give').addEventListener('click', () => { this.closePanel(); onDone(total); });
      return;
    }
    this.openPanel('Cash payment', '', { icon: 'i-coin' });
    render();
  }

  // ---------- dawn ----------
  summary(sum, onNext) {
    const s = this.getState();
    const reps = Object.entries(sum.repGain || {}).filter(([, v]) => v > 0).map(([id, v]) => `${REGULARS[id].name} +${v}`).join(' · ');
    const lines = [];
    if (reps) lines.push(['i-heart', `Friendship: ${esc(reps)}`]);
    if (sum.wages) lines.push(['i-apron', `Paid your helpers ${money(sum.wages)} in wages.`]);
    if (sum.pricey) lines.push(['i-tag', `${sum.pricey} time${sum.pricey === 1 ? '' : 's'} someone found a price too high.`]);
    if (sum.missed) lines.push(['i-letter', `${sum.missed} wish${sum.missed === 1 ? '' : 'es'} went unmet — see the corkboard.`]);
    if (sum.letter) lines.push(['i-letter', 'A letter has been pinned to the corkboard.']);
    if (sum.festival) lines.push(['i-festival', 'What a festival! The whole village thanks you.']);
    if (sum.newSeason) lines.push([sum.newSeason.icon, `${sum.newSeason.name} has arrived in the forest.`]);
    const html = `<div class="dawn-sky"></div>
      <div class="summary"><div><small>Earned</small><b>${money(sum.earned)}</b></div><div><small>Sold</small><b>${sum.sold}</b></div><div><small>Visitors</small><b>${sum.customers}</b></div><div><small>New lights</small><b>${sum.newLit}</b></div></div>
      ${lines.length ? `<ul class="dawn-list">${lines.map(([i, t]) => `<li>${ico(i)}${t}</li>`).join('')}</ul>` : ''}
      <p class="small muted">Saved. ${s.lit.length} of ${totalWindows()} windows glow in the village.</p>
      <div class="row"><span class="spacer"></span><button class="btn amber" id="next">${ico('i-sun')}Good morning</button></div>`;
    this.openPanel(`Dawn — Night ${sum.night}`, html, { onClose: onNext, icon: 'i-sun' }).querySelector('#next').addEventListener('click', () => this.closePanel());
  }

  // ---------- corkboard ----------
  board(onRead) {
    const s = this.getState();
    const notes = [];
    s.letters.slice().reverse().forEach((l, i) => notes.push(`<button class="note letter-note ${l.read ? '' : 'unread'}" style="--rot:${(i % 3) - 1}deg" data-l="${esc(l.id)}">${ico('i-letter')}<b>${esc(l.from)}</b></button>`));
    s.wishes.forEach((w, i) => notes.push(`<div class="note" style="--rot:${((i + 1) % 3) - 1}deg">${ico('i-sparkle')}<b>${esc(w.name)}</b> wished for a <b>${esc(wishLabel(w.pattern))}</b></div>`));
    const html = `<div class="cork">${notes.length ? `<div class="board">${notes.join('')}</div>` : '<p style="color:#fff3dc;font-weight:700;padding:20px">Nothing pinned yet. Wishes and letters from townsfolk will appear here.</p>'}</div>`;
    const body = this.openPanel('Corkboard', html, { wide: true, icon: 'i-letter' });
    body.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => {
      const l = s.letters.find((x) => x.id === b.dataset.l);
      if (!l) return;
      l.read = true;
      onRead?.();
      audio.play('paper', { volume: 0.6 });
      body.innerHTML = `<div class="letter">${esc(l.text).replace(/\n/g, '<br>')}<div class="sig">— ${esc(l.from)}</div><svg class="seal-wax" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="url(#g-wax)"/><use href="#i-heart" x="6" y="6" width="12" height="12"/></svg></div><div class="row" style="margin-top:22px"><button class="btn ghost small" id="back">Back to the board</button></div>`;
      body.querySelector('#back').addEventListener('click', () => { this.closePanel(); this.board(onRead); });
    }));
  }

  // ---------- settings ----------
  menu() {
    const st = audio.settings;
    const g = this.game;
    const q = g?.settings.quality || 'auto';
    const controls = this.input.touch
      ? 'Left stick to walk · drag to look · tap things (or <kbd>Use</kbd>) · <kbd>Back</kbd> takes one back · <kbd>Drop</kbd> puts a box down'
      : '<kbd>W A S D</kbd> walk · <kbd>Shift</kbd> faster · <kbd>Click</kbd> use / place · <kbd>Right-click</kbd> take back · <kbd>E</kbd> put a box down · <kbd>Q</kbd> rotate decor · <kbd>P</kbd> photo · <kbd>Tab</kbd> this menu · <kbd>Esc</kbd> free the mouse';
    const html = `<div class="settings">
      <div class="section-title" style="margin-top:0">${ico('i-radio')} Sound</div>
      ${['master', 'music', 'amb', 'sfx'].map((k) => `<label>${{ master: 'Master', music: 'Radio', amb: 'Ambience', sfx: 'Effects' }[k]}<input type="range" min="0" max="1" step="0.05" value="${st[k]}" data-vol="${k}"><output>${Math.round(st[k] * 100)}</output></label>`).join('')}
      <div class="section-title">${ico('i-sparkle')} Graphics</div>
      <label style="grid-template-columns:120px 1fr">Quality<span class="seg" id="quality">${['auto', 'low', 'medium', 'high'].map((m) => `<button data-q="${m}" class="${q === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</span></label>
      <p class="small muted" style="margin:-4px 0 0">Auto lowers the resolution and effects whenever the game would stutter. Running at <b id="fps-now">${Math.round(g?.post.fps || 0)} fps</b> on ${g?.post.tier || ''}.</p>
      <label class="check"><input type="checkbox" id="showfps" ${g?.settings.showFps ? 'checked' : ''}> Show frame rate</label>
      <div class="section-title">${ico('i-mouse-l')} Controls</div>
      <label class="check"><input type="checkbox" id="bob" ${this.headBob !== false ? 'checked' : ''}> Gentle head bob</label>
      ${this.input.touch ? '' : `<label>Mouse speed<input type="range" min="0.0008" max="0.005" step="0.0002" value="${this.input.sens}" id="sens"><output></output></label>`}
      <div class="controls-card">${controls}</div>
      <div class="row"><button class="btn small" id="photo">${ico('i-camera')}Photo mode</button><button class="btn small ghost" id="tut">Replay tutorial</button><button class="btn small ghost" id="credits">Credits</button><span class="spacer"></span><button class="btn small ghost" id="quit">Save &amp; quit</button></div></div>`;
    const body = this.openPanel('Settings', html, { icon: 'i-gear' });
    body.querySelectorAll('[data-vol]').forEach((r) => r.addEventListener('input', () => { st[r.dataset.vol] = +r.value; r.nextElementSibling.textContent = Math.round(r.value * 100); audio.applySettings(); this.onSettings?.(); }));
    body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      body.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
      this.onQuality?.(b.dataset.q);
    }));
    body.querySelector('#showfps').addEventListener('change', (e) => { if (g) g.settings.showFps = e.target.checked; this.onSettings?.(); });
    body.querySelector('#bob').addEventListener('change', (e) => { this.headBob = e.target.checked; this.onSettings?.(); });
    body.querySelector('#sens')?.addEventListener('input', (e) => { this.input.sens = +e.target.value; this.onSettings?.(); });
    body.querySelector('#photo').addEventListener('click', () => { this.closePanel(); this.onPhoto?.(); });
    body.querySelector('#tut').addEventListener('click', () => { this.closePanel(); this.onReplayTutorial?.(); });
    body.querySelector('#quit').addEventListener('click', () => { this.closePanel(); this.onQuit?.(); });
    body.querySelector('#credits').addEventListener('click', () => this.credits());
  }

  credits() {
    this.openPanel('Credits', `<p><b>Lantern &amp; Lens</b> — made with three.js.</p>
      <p class="small">3D models: <b>Kenney</b> (Furniture Kit, Nature Kit, Mini Characters, Cube Pets, Holiday Kit, Survival Kit) — CC0. The shop, cottages and every product are modelled in code.</p>
      <p class="small">Sound: <b>Kenney</b> (RPG Audio, Impact Sounds, Casino Audio) — CC0. From OpenGameArt (all CC0): “Rain (loopable)”, “Crickets Ambient Noise”, “Cat Purr &amp; Meow”, “Doorbell ring” (old shop bell), “100 CC0 SFX”, “30 CC0 SFX loops”, “Park ambiences”, “Clock wind sounds” by Brian MacIntosh, “Fire crackling”.</p>
      <p class="small">Radio (CC0, OpenGameArt): “Apple Cider”, “Catmint” by Kistol, “Cozy Puzzle” music, “Chill lofi inspired” by omfgdude (loop edit by qubodup).</p>
      <p class="small">Fonts: Fredoka and Nunito (SIL Open Font License).</p>`, { icon: 'i-heart' });
  }

  radioToast(track, on) {
    this.toast(on ? `Radio: <b>${esc(track?.name ?? TRACKS[audio.radio.index].name)}</b>` : 'Radio off', 'i-radio', 2.2);
  }
}

export { money, esc };
