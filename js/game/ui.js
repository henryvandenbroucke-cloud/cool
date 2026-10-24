// Storybook interface: wooden HUD plaques, pinned-note toasts, the leather
// ledger (stock, licences, expansions, decor, staff, townsfolk), the hanging
// price tag, the brass register, dawn report, corkboard and settings.

import { audio, TRACKS } from './audio.js';
import { LICENCES, REGULARS, WEATHERS, EXPANSIONS, DECOR, STAFF } from './config.js';
import {
  levelProgress, orderable, orderBox, buyLicence, canBuyLicence, priceFor, setPrice, marketPrice, unitCost,
  productName, priceMood, totalWindows, wishLabel, levelFor, productStars, seasonFor, canBuyExpansion, buyExpansion,
  canBuyDecor, buyDecor, canHire, hire, dismiss, coziness, parseKey, buyChance, bestPrice,
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
    this.el.guideBody.innerHTML = step.done ? step.body : `${ico(step.touch ? 'i-tap' : 'i-mouse-l')}<span>${step.body}</span>`;
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
    this.input.enabled = !this.game?.crafting?.isOpen;
    const cb = this.panelClose;
    this.panelClose = null;
    cb?.();
    this.onPanelClose?.();
    if (!this.keepPointer) this.resumePointer();
    this.keepPointer = false;
  }

  resumePointer() {
    if (!this.input.touch && this.game?.running) this.input.requestLock();
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
    const best = bestPrice(market, cost);
    let p = priceFor(s, key);
    const steps = [-1, -0.5, -0.1, 0.1, 0.5, 1];
    const render = () => {
      const mood = priceMood(p, market);
      const chance = buyChance(p, market);
      const stars = productStars(key);
      const tone = chance >= 0.85 ? 'good' : chance >= 0.5 ? 'warn' : 'bad';
      const profit = p - cost;
      this.el.body.innerHTML = `<p class="tag-title">${esc(productName(key))}</p><p class="tag-sub">${stars ? `<span style="color:#d9822b">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span> · ` : ''}price per item</p>
        <output class="tag-price">${money(p)}</output>
        <div class="step-row">${steps.map((d) => `<button class="btn small ${d < 0 ? 'minus' : 'plus'}" data-d="${d}">${d < 0 ? '−' : '+'}${Math.abs(d) < 1 ? Math.abs(d).toFixed(2).replace(/^0/, '') : Math.abs(d).toFixed(2)}</button>`).join('')}</div>
        <div class="chance ${tone}"><div class="chance-head"><span>Chance a customer buys</span><b>${Math.round(chance * 100)}%</b></div><div class="chance-bar"><i style="width:${chance * 100}%"></i></div><p>${mood.text}</p></div>
        <div class="price-grid"><div><small>Cost</small><b>${money(cost)}</b></div><div><small>Market</small><b>${money(market)}</b></div><div><small>Profit each</small><b style="color:${profit >= 0 ? '#5e8a6c' : '#b85a4c'}">${money(profit)}</b></div></div>
        <div class="row tag-presets"><button class="btn ghost small" data-set="${market}">Market ${money(market)}</button><button class="btn ghost small" data-set="${best}">${ico('i-star')} Best ${money(best)}</button><span class="spacer"></span><button class="btn sage" id="pok">${ico('i-check')}Set price</button></div>`;
      const body = this.el.body;
      body.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { p = Math.max(0.05, Math.round((p + +b.dataset.d) * 100) / 100); audio.play('key_click', { volume: 0.35, rate: +b.dataset.d > 0 ? 1.1 : 0.9 }); render(); }));
      body.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => { p = +b.dataset.set; audio.play('key_click', { volume: 0.35 }); render(); }));
      body.querySelector('#pok').addEventListener('click', () => { setPrice(s, key, p); onChange?.(); audio.play('paper', { volume: 0.5 }); this.closePanel(); });
    };
    this.openPanel('Price tag', '', { cls: 'tag-panel' });
    render();
  }

  // ---------- checkout ----------
  /** How a customer pays cash: exact sometimes, otherwise rounded up the way people do. */
  static cashTendered(total) {
    const r = Math.random();
    if (r < 0.12) return total;
    const ups = [Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20, Math.ceil(total / 50) * 50]
      .filter((v, i, a) => v > total + 0.001 && a.indexOf(v) === i);
    return ups[Math.min(ups.length - 1, Math.floor(Math.random() * Math.min(3, ups.length)))] ?? Math.ceil(total);
  }

  checkout(c, total, onDone) {
    const name = esc(c.info.name);
    const items = c.basket.map((b) => `<li><span>${esc(productName(b.key))}</span><b>${money(b.price)}</b></li>`).join('');
    const receipt = `<ul class="receipt">${items}<li class="sum"><span>Total</span><b>${money(total)}</b></li></ul>`;
    if (c.payWith === 'card') return this.cardPayment(name, total, receipt, onDone);
    const paid = Math.round(UI.cashTendered(total) * 100) / 100;
    const due = Math.round((paid - total) * 100);          // in cents, to avoid float drift
    if (due <= 0) {
      let paidUp = false;
      const go = () => { if (paidUp) return; paidUp = true; removeEventListener('keydown', key); this.closePanel(); onDone(total); };
      const key = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); go(); } };
      this.openPanel('Cash payment', `<div class="pay"><div class="till"><div class="who">${name} pays the exact amount.</div>${receipt}<div class="lcd"><div><small>TOTAL</small>${money(total)}</div><div><small>RECEIVED</small>${money(paid)}</div><div class="ok"><small>CHANGE</small>0.00</div></div></div><div class="row"><span class="spacer"></span><button class="btn sage" id="give">${ico('i-check')}Take payment <kbd>Enter</kbd></button></div></div>`, { icon: 'i-coin', wide: true, onClose: () => removeEventListener('keydown', key) });
      addEventListener('keydown', key);
      this.el.body.querySelector('#give').addEventListener('click', go);
      return;
    }
    // small on the left, big on the right — like a real till drawer
    const coins = [1, 2, 5, 10, 20, 50, 100, 200];
    const notes = [500, 1000, 2000, 5000];
    const label = (v) => (v < 100 ? `${v}¢` : `${v / 100}`);
    let tray = [];
    const sum = () => tray.reduce((a, b) => a + b, 0);
    const render = () => {
      const given = sum();
      const left = due - given;
      const state = left === 0 ? 'ok' : left < 0 ? 'over' : '';
      this.el.body.innerHTML = `<div class="pay cash">
        <div class="till"><div class="who">${name} hands you <b>${money(paid)}</b>. Give back the change.</div>${receipt}
          <div class="lcd"><div><small>TOTAL</small>${money(total)}</div><div><small>RECEIVED</small>${money(paid)}</div><div class="${state}"><small>${left < 0 ? 'TOO MUCH' : 'CHANGE DUE'}</small>${money(Math.abs(due - given) / 100)}</div><div><small>GIVEN</small>${money(given / 100)}</div></div></div>
        <div class="tray" title="Click a coin or note to take it back">${tray.length ? tray.map((v, i) => `<button class="${v < 500 ? 'c' : 'n'} v${v}" data-i="${i}">${label(v)}</button>`).join('') : '<span>Change goes here — click money in the drawer</span>'}</div>
        <div class="drawer"><div class="slots coins">${coins.map((v) => `<button class="c v${v}" data-v="${v}">${label(v)}</button>`).join('')}</div><div class="slots notes">${notes.map((v) => `<button class="n v${v}" data-v="${v}">${label(v)}</button>`).join('')}</div></div>
        <div class="row"><button class="btn ghost small" id="clear">Clear</button><button class="btn ghost small" id="auto">Count it for me</button><span class="spacer"></span><button class="btn sage" id="give" ${state === 'ok' ? '' : 'disabled'}>${ico('i-check')}Give change <kbd>Enter</kbd></button></div></div>`;
      const body = this.el.body;
      body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { tray.push(+b.dataset.v); audio.play(+b.dataset.v < 500 ? 'coin_stack' : 'paper', { volume: 0.5, rate: 0.9 + Math.random() * 0.2 }); render(); }));
      body.querySelectorAll('.tray [data-i]').forEach((b) => b.addEventListener('click', () => { tray.splice(+b.dataset.i, 1); audio.play('coins', { volume: 0.3 }); render(); }));
      body.querySelector('#clear').addEventListener('click', () => { tray = []; render(); });
      body.querySelector('#auto').addEventListener('click', () => {
        tray = [];
        let rem = due;
        for (const v of [...notes, ...coins].sort((a, b) => b - a)) while (rem >= v) { rem -= v; tray.push(v); }
        audio.play('coins', { volume: 0.6 });
        render();
      });
      body.querySelector('#give').addEventListener('click', finish);
    };
    const finish = () => { if (sum() !== due) return; removeEventListener('keydown', key); audio.play('coins', { volume: 0.6 }); this.closePanel(); onDone(total); };
    const key = (e) => { if (e.code === 'Enter') { e.preventDefault(); finish(); } else if (e.code === 'Backspace') { tray.pop(); render(); } };
    addEventListener('keydown', key);
    this.openPanel('Cash payment', '', { icon: 'i-coin', wide: true, onClose: () => removeEventListener('keydown', key) });
    render();
  }

  cardPayment(name, total, receipt, onDone) {
    let typed = '';
    let wrong = false;
    const render = () => {
      const shown = typed ? money(+typed / 100) : '0.00';
      this.el.body.innerHTML = `<div class="pay card"><div class="till"><div class="who">${name} pays by card. Key the total into the terminal.</div>${receipt}
          <div class="lcd"><div><small>TOTAL</small>${money(total)}</div><div><small>METHOD</small>CARD</div></div></div>
        <div class="terminal ${wrong ? 'shake' : ''}"><div class="t-screen"><small>AMOUNT</small><b>${shown}</b><span>${wrong ? 'Amount doesn’t match' : 'Enter amount, press OK'}</span></div>
          <div class="t-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'OK'].map((k) => `<button data-k="${k}" class="${k === 'OK' ? 'ok' : k === '⌫' ? 'del' : ''}">${k}</button>`).join('')}</div></div>
        <p class="muted small" style="text-align:center;margin:0">Type digits (or use your keyboard): 4 · 5 · 0 makes 4.50</p></div>`;
      this.el.body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
    };
    const press = (k) => {
      audio.play('key_click', { volume: 0.45 });
      wrong = false;
      if (k === '⌫') typed = typed.slice(0, -1);
      else if (k === 'OK') {
        if (+typed === Math.round(total * 100)) { removeEventListener('keydown', key); audio.play('till_ding', { volume: 0.5, rate: 1.3 }); this.closePanel(); onDone(total); return; }
        wrong = true;
        typed = '';
      } else if (typed.length < 6) typed = (typed + k).replace(/^0+/, '');
      render();
    };
    const key = (e) => {
      if (/^Digit\d$|^Numpad\d$/.test(e.code)) { e.preventDefault(); press(e.code.slice(-1)); }
      else if (e.code === 'Backspace') { e.preventDefault(); press('⌫'); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); press('OK'); }
    };
    addEventListener('keydown', key);
    this.openPanel('Card payment', '', { icon: 'i-coin', wide: true, onClose: () => removeEventListener('keydown', key) });
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
  menu({ title = false } = {}) {
    const st = audio.settings;
    const g = this.game;
    const gpu = globalThis.__gpu;
    const q = g?.settings.quality || 'auto';
    const controls = this.input.touch
      ? 'Left stick to walk · drag to look · tap things (or <kbd>Use</kbd>) · <kbd>Back</kbd> takes one back · <kbd>Drop</kbd> puts a box down'
      : '<kbd>W A S D</kbd> walk · <kbd>Shift</kbd> faster · <kbd>Click</kbd> use / place · <kbd>Right-click</kbd> take back · <kbd>E</kbd> put a box down · <kbd>Q</kbd> rotate decor · <kbd>P</kbd> photo · <kbd>Tab</kbd> this menu · <kbd>Esc</kbd> free the mouse';
    const html = `<div class="settings">
      <div class="section-title" style="margin-top:0">${ico('i-radio')} Sound</div>
      ${['master', 'music', 'amb', 'sfx'].map((k) => `<label>${{ master: 'Master', music: 'Radio', amb: 'Ambience', sfx: 'Effects' }[k]}<input type="range" min="0" max="1" step="0.05" value="${st[k]}" data-vol="${k}"><output>${Math.round(st[k] * 100)}</output></label>`).join('')}
      <div class="section-title">${ico('i-sparkle')} Graphics</div>
      <label style="grid-template-columns:120px 1fr">Quality<span class="seg" id="quality">${['auto', 'low', 'medium', 'high'].map((m) => `<button data-q="${m}" class="${q === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</span></label>
      <p class="small muted" style="margin:-4px 0 0">Auto turns effects down whenever the game would stutter. Running at <b id="fps-now">${Math.round(g?.post.fps || 0)} fps</b> on ${g?.post.tier || ''}${gpu ? ` · ${esc(gpu.name.replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 60))}` : ''}.</p>
      ${gpu?.software ? '<p class="gpu-warn small">Your browser is drawing the game without your graphics card, so it will be slow. Turn on <b>“Use graphics acceleration when available”</b> in your browser settings and restart it.</p>' : ''}
      <label class="check"><input type="checkbox" id="outlines" ${g?.settings.outlines ? 'checked' : ''}> Storybook ink outlines</label>
      <label class="check"><input type="checkbox" id="showfps" ${g?.settings.showFps ? 'checked' : ''}> Show frame rate</label>
      <div class="section-title">${ico('i-mouse-l')} Controls</div>
      <label class="check"><input type="checkbox" id="bob" ${this.headBob !== false ? 'checked' : ''}> Gentle head bob</label>
      ${this.input.touch ? '' : `<label>Mouse speed<input type="range" min="0.0008" max="0.005" step="0.0002" value="${this.input.sens}" id="sens"><output></output></label>`}
      <div class="controls-card">${controls}</div>
      ${title ? '' : `<div class="row"><button class="btn small" id="photo">${ico('i-camera')}Photo mode</button><button class="btn small ghost" id="tut">Replay tutorial</button><button class="btn small ghost" id="credits">Credits</button><span class="spacer"></span><button class="btn small ghost" id="quit">Save &amp; quit</button></div>`}</div>`;
    const body = this.openPanel('Settings', html, { icon: 'i-gear' });
    body.querySelectorAll('[data-vol]').forEach((r) => r.addEventListener('input', () => { st[r.dataset.vol] = +r.value; r.nextElementSibling.textContent = Math.round(r.value * 100); audio.applySettings(); this.onSettings?.(); }));
    body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      body.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x === b));
      this.onQuality?.(b.dataset.q);
    }));
    body.querySelector('#showfps').addEventListener('change', (e) => { if (g) g.settings.showFps = e.target.checked; this.onSettings?.(); });
    body.querySelector('#outlines').addEventListener('change', (e) => { if (g) { g.settings.outlines = e.target.checked; g.post.setOutlines(e.target.checked); } this.onSettings?.(); });
    body.querySelector('#bob').addEventListener('change', (e) => { this.headBob = e.target.checked; this.onSettings?.(); });
    body.querySelector('#sens')?.addEventListener('input', (e) => { this.input.sens = +e.target.value; this.onSettings?.(); });
    if (title) return;
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
