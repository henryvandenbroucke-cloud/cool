// Pure game state + economy rules. No DOM, no three.js: unit-testable in Node.

import {
  STOCK, SUPPLIES, CANDLE_FORMS, CANDLE_COLORS, LAMP_BASES, LAMP_SHADES, LAMP_FILTERS,
  LAMP_BASE_MARKET, LAMP_UNIT_COST, LICENCES, LEVELS, START_COINS, REGULARS, HOUSES,
  REP_WINDOW_STEPS, GENERIC_SALES_PER_WINDOW, SIZE_PER_SECTION, LETTERS, MILESTONE_LETTERS,
} from './config.js';

export const SAVE_VERSION = 1;
const SAVE_KEY = (slot) => `lantern-lens:save:${slot}`;

// ---------- Product keys ----------
// stock:      "matches"
// supply:     "supply:candle_supplies"
// candle:     "candle:<form>:<color>:<stars>"
// lamp:       "lamp:<base>:<shade>:<filter>:<stars>"

export function parseKey(key) {
  const parts = key.split(':');
  if (parts[0] === 'candle') return { kind: 'candle', form: parts[1], color: parts[2], stars: +parts[3] || 1 };
  if (parts[0] === 'lamp') return { kind: 'lamp', base: parts[1], shade: parts[2], filter: parts[3], stars: +parts[4] || 1 };
  if (parts[0] === 'supply') return { kind: 'supply', id: parts[1] };
  return { kind: 'stock', id: parts[0] };
}

export function candleKey(form, color, stars) { return `candle:${form}:${color}:${stars}`; }
export function lampKey(base, shade, filter, stars) { return `lamp:${base}:${shade}:${filter}:${stars}`; }

const starMul = (stars) => 1 + 0.12 * (Math.max(1, Math.min(3, stars)) - 1);
const round2 = (v) => Math.round(v * 100) / 100;

export function marketPrice(key) {
  const p = parseKey(key);
  if (p.kind === 'stock') return STOCK[p.id]?.market ?? 1;
  if (p.kind === 'candle') return round2((CANDLE_FORMS[p.form]?.market ?? 5) * starMul(p.stars));
  if (p.kind === 'lamp') {
    const base = LAMP_BASE_MARKET + (LAMP_BASES[p.base]?.market ?? 0) + (LAMP_SHADES[p.shade]?.market ?? 0);
    return round2(base * starMul(p.stars));
  }
  return 0;
}

export function unitCost(key) {
  const p = parseKey(key);
  if (p.kind === 'stock') return STOCK[p.id]?.cost ?? 0;
  if (p.kind === 'candle') return CANDLE_FORMS[p.form]?.unitCost ?? 0.8;
  if (p.kind === 'lamp') return LAMP_UNIT_COST;
  if (p.kind === 'supply') return SUPPLIES[p.id]?.cost ?? 0;
  return 0;
}

export function productName(key) {
  const p = parseKey(key);
  if (p.kind === 'stock') return STOCK[p.id]?.name ?? key;
  if (p.kind === 'supply') return SUPPLIES[p.id]?.name ?? key;
  if (p.kind === 'candle') return `${CANDLE_COLORS[p.color]?.name ?? ''} ${CANDLE_FORMS[p.form]?.name ?? 'Candle'}`.trim();
  if (p.kind === 'lamp') return `${LAMP_FILTERS[p.filter]?.name ?? ''} ${LAMP_SHADES[p.shade]?.name ?? ''} Lamp`.replace(/\s+/g, ' ').trim();
  return key;
}

export function productStars(key) {
  const p = parseKey(key);
  return p.kind === 'candle' || p.kind === 'lamp' ? p.stars : 0;
}

export function productSize(key) {
  const p = parseKey(key);
  if (p.kind === 'stock') return STOCK[p.id]?.size ?? 's';
  if (p.kind === 'lamp') return 'l';
  return 's';
}

export function sectionCapacity(key) { return SIZE_PER_SECTION[productSize(key)] ?? 4; }

/** Category used by weather demand and wants. */
export function productCategory(key) {
  const p = parseKey(key);
  return p.kind === 'stock' ? p.id : p.kind;
}

/** Pattern match: "candle:*:rose" matches "candle:pillar:rose:2"; "candle" matches any candle. */
export function keyMatches(key, pattern) {
  const a = key.split(':');
  const b = pattern.split(':');
  for (let i = 0; i < b.length; i++) {
    if (b[i] === '*') continue;
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** How likely a shopper accepts a price. Gentle curve; never a hard fail state. */
export function buyChance(price, market, bonus = 0) {
  const r = price / Math.max(0.01, market);
  let c;
  if (r <= 0.9) c = 1;
  else if (r <= 1.05) c = 0.95;
  else if (r <= 1.2) c = 0.75;
  else if (r <= 1.4) c = 0.4;
  else if (r <= 1.6) c = 0.15;
  else c = 0;
  return Math.max(0, Math.min(1, c + (c > 0 ? bonus : 0)));
}

export function priceMood(price, market) {
  const r = price / Math.max(0.01, market);
  if (r <= 0.9) return { text: 'A bargain — flies off the shelf', tone: 'sage' };
  if (r <= 1.05) return { text: 'Fair price — townsfolk are happy', tone: 'sage' };
  if (r <= 1.2) return { text: 'A little pricey', tone: 'amber' };
  if (r <= 1.4) return { text: 'Most will hesitate', tone: 'amber' };
  return { text: 'Too pricey — almost no one will buy', tone: 'rose' };
}

// ---------- Levels ----------
export function levelFor(xp) {
  let lv = 1;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lv = i + 1;
  return lv;
}
export function levelProgress(xp) {
  const lv = levelFor(xp);
  const lo = LEVELS[lv - 1] ?? 0;
  const hi = LEVELS[lv] ?? lo + 1000;
  return { level: lv, frac: Math.min(1, (xp - lo) / (hi - lo)), next: hi };
}

// ---------- New game ----------
export function newGame(slot = 0, seed = Date.now()) {
  const rep = {};
  for (const id of Object.keys(REGULARS)) rep[id] = 0;
  return {
    version: SAVE_VERSION,
    slot,
    seed,
    createdAt: Date.now(),
    savedAt: Date.now(),
    night: 1,
    phase: 'prep',          // 'prep' | 'shift'
    clock: 0,               // seconds into the shift
    weather: 'clear',
    coins: START_COINS,
    xp: 0,
    licences: [],
    sections: {},           // sectionId -> { key, count }
    prices: {},             // key -> price
    boxes: [               // starter delivery waiting on the porch
      { id: 'b1', key: 'matches', count: 12, at: 'porch' },
      { id: 'b2', key: 'supply:candle_supplies', count: 1, at: 'porch' },
    ],
    supplies: { candle: 0, lamp: 0 },
    crafted: [],            // finished crafts waiting in the crate: [key,...]
    rep,
    met: [],
    lit: [],                // "house:window"
    genericSales: 0,
    letters: [],            // { id, from, text, read }
    wishes: [],             // { name, key/pattern, night }
    stats: { sold: 0, earned: 0, crafted: 0, customers: 0, nights: 0 },
    tonight: freshTonight(),
    tutorial: 0,
    nextBoxId: 3,
    cat: { pets: 0 },
  };
}

export function freshTonight() {
  return { sold: 0, earned: 0, customers: 0, happy: 0, pricey: 0, missed: 0, newLit: 0, repGain: {} };
}

export function hasLicence(s, id) { return !id || s.licences.includes(id); }

export function canBuyLicence(s, id) {
  const L = LICENCES[id];
  if (!L || L.soon) return false;
  if (s.licences.includes(id)) return false;
  return levelFor(s.xp) >= L.level && s.coins >= L.price;
}

export function buyLicence(s, id) {
  if (!canBuyLicence(s, id)) return false;
  s.coins = round2(s.coins - LICENCES[id].price);
  s.licences.push(id);
  return true;
}

export function priceFor(s, key) {
  return s.prices[key] ?? marketPrice(key);
}

export function setPrice(s, key, price) {
  s.prices[key] = Math.max(0.1, round2(price));
}

/** Catalogue item availability. */
export function orderable(s) {
  const lv = levelFor(s.xp);
  const out = [];
  for (const [id, it] of Object.entries(STOCK)) out.push({ key: id, item: it, kind: 'stock', ok: lv >= it.level && hasLicence(s, it.licence), boxPrice: round2(it.cost * it.boxQty) });
  for (const [id, it] of Object.entries(SUPPLIES)) out.push({ key: 'supply:' + id, item: it, kind: 'supply', ok: lv >= it.level && hasLicence(s, it.licence), boxPrice: it.cost });
  return out;
}

export function orderBox(s, key, qty = 1) {
  const p = parseKey(key);
  const price = p.kind === 'supply' ? SUPPLIES[p.id].cost : round2(STOCK[key].cost * STOCK[key].boxQty);
  const total = round2(price * qty);
  if (s.coins < total) return null;
  s.coins = round2(s.coins - total);
  const made = [];
  for (let i = 0; i < qty; i++) {
    const box = { id: 'b' + s.nextBoxId++, key, count: p.kind === 'supply' ? 1 : STOCK[key].boxQty, at: 'porch' };
    s.boxes.push(box);
    made.push(box);
  }
  return made;
}

// ---------- Sales ----------
/**
 * Records a sale. Returns the side effects the world must show
 * (windows newly lit, letters newly arrived, level up).
 */
export function recordSale(s, { key, price, regular = null }) {
  const effects = { lit: [], letters: [], levelUp: false };
  const lvBefore = levelFor(s.xp);
  s.coins = round2(s.coins + price);
  s.xp += 2 + Math.round(price * 2);
  s.stats.sold++;
  s.stats.earned = round2(s.stats.earned + price);
  s.tonight.sold++;
  s.tonight.earned = round2(s.tonight.earned + price);

  if (regular && s.rep[regular] !== undefined) {
    const before = s.rep[regular];
    s.rep[regular] = Math.min(100, before + 6);
    s.tonight.repGain[regular] = (s.tonight.repGain[regular] || 0) + (s.rep[regular] - before);
    effects.lit.push(...litForRegular(s, regular));
    effects.letters.push(...lettersFor(s, regular));
  } else {
    s.genericSales++;
    if (s.genericSales % GENERIC_SALES_PER_WINDOW === 0) {
      const w = nextGenericWindow(s);
      if (w) { s.lit.push(w); effects.lit.push(w); }
    }
  }
  s.tonight.newLit += effects.lit.length;
  if (s.lit.length >= 10 && !s.letters.find((l) => l.id === 'm:tenWindows')) {
    const L = MILESTONE_LETTERS.tenWindows;
    const letter = { id: 'm:tenWindows', from: L.from, text: L.text, read: false };
    s.letters.push(letter);
    effects.letters.push(letter);
  }
  effects.levelUp = levelFor(s.xp) > lvBefore;
  return effects;
}

export function bumpRep(s, regular, amount) {
  if (!regular || s.rep[regular] === undefined) return { lit: [], letters: [] };
  const before = s.rep[regular];
  s.rep[regular] = Math.max(0, Math.min(100, before + amount));
  s.tonight.repGain[regular] = (s.tonight.repGain[regular] || 0) + (s.rep[regular] - before);
  const lit = litForRegular(s, regular);
  s.tonight.newLit += lit.length;
  return { lit, letters: lettersFor(s, regular) };
}

function litForRegular(s, regular) {
  const house = REGULARS[regular].house;
  const out = [];
  REP_WINDOW_STEPS.forEach((need, i) => {
    const id = `${house}:${i}`;
    if (s.rep[regular] >= need && !s.lit.includes(id) && i < HOUSES[house].windows) {
      s.lit.push(id);
      out.push(id);
    }
  });
  return out;
}

function nextGenericWindow(s) {
  for (let h = 0; h < HOUSES.length; h++) {
    if (HOUSES[h].owner) continue;
    for (let w = 0; w < HOUSES[h].windows; w++) {
      const id = `${h}:${w}`;
      if (!s.lit.includes(id)) return id;
    }
  }
  return null;
}

function lettersFor(s, regular) {
  const out = [];
  (LETTERS[regular] || []).forEach((L, i) => {
    const id = `${regular}:${i}`;
    if (s.rep[regular] >= L.at && !s.letters.find((l) => l.id === id)) {
      const letter = { id, from: `${REGULARS[regular].name}, ${REGULARS[regular].role}`, text: L.text, read: false };
      s.letters.push(letter);
      out.push(letter);
    }
  });
  return out;
}

export function totalWindows() { return HOUSES.reduce((a, h) => a + h.windows, 0); }

export function addWish(s, name, pattern) {
  if (s.wishes.find((w) => w.pattern === pattern)) return;
  s.wishes.unshift({ name, pattern, night: s.night });
  s.wishes = s.wishes.slice(0, 8);
}

export function fulfilWishes(s, key) {
  const before = s.wishes.length;
  s.wishes = s.wishes.filter((w) => !keyMatches(key, w.pattern));
  return before - s.wishes.length;
}

export function wishLabel(pattern) {
  const p = pattern.split(':');
  if (p[0] === 'candle') {
    const form = p[1] && p[1] !== '*' ? CANDLE_FORMS[p[1]]?.name : 'candle';
    const color = p[2] && p[2] !== '*' ? CANDLE_COLORS[p[2]]?.name : '';
    return `${color} ${form}`.trim().toLowerCase();
  }
  if (p[0] === 'lamp') {
    const f = p[3] && p[3] !== '*' ? LAMP_FILTERS[p[3]]?.name + ' ' : '';
    return `${f}table lamp`.toLowerCase();
  }
  return (STOCK[p[0]]?.name ?? pattern).toLowerCase();
}

// ---------- Night flow ----------
export function startShift(s, rng = Math.random) {
  s.phase = 'shift';
  s.clock = 0;
  s.tonight = freshTonight();
  const roll = rng();
  s.weather = s.night === 1 ? 'clear' : roll < 0.5 ? 'clear' : roll < 0.78 ? 'rain' : 'fog';
}

export function endShift(s) {
  const summary = { night: s.night, weather: s.weather, ...s.tonight };
  s.stats.nights++;
  s.night++;
  s.phase = 'prep';
  s.clock = 0;
  if (s.night === 2 && !s.letters.find((l) => l.id === 'm:firstNight')) {
    const L = MILESTONE_LETTERS.firstNight;
    s.letters.push({ id: 'm:firstNight', from: L.from, text: L.text, read: false });
    summary.letter = true;
  }
  return summary;
}

export function clockHour(s, shiftSeconds = 720) {
  const h = 18 + (s.clock / shiftSeconds) * 12;
  return h % 24;
}

export function formatHour(h) {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h - Math.floor(h)) * 60 / 10) * 10;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ---------- Persistence ----------
function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function save(s) {
  const st = storage();
  if (!st) return false;
  try {
    s.savedAt = Date.now();
    st.setItem(SAVE_KEY(s.slot), JSON.stringify(s));
    return true;
  } catch { return false; }
}

export function load(slot) {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(SAVE_KEY(slot));
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch { return null; }
}

export function remove(slot) {
  const st = storage();
  try { st?.removeItem(SAVE_KEY(slot)); } catch { /* ignore */ }
}

export function slotSummary(slot) {
  const s = load(slot);
  if (!s) return null;
  return { night: s.night, coins: s.coins, level: levelFor(s.xp), lit: s.lit.length, savedAt: s.savedAt };
}

export function migrate(s) {
  const base = newGame(s.slot ?? 0);
  const out = { ...base, ...s };
  out.rep = { ...base.rep, ...(s.rep || {}) };
  out.stats = { ...base.stats, ...(s.stats || {}) };
  out.supplies = { ...base.supplies, ...(s.supplies || {}) };
  out.tonight = { ...freshTonight(), ...(s.tonight || {}) };
  out.cat = { ...base.cat, ...(s.cat || {}) };
  out.boxes = (out.boxes || []).map((b) => (b.at === 'held' ? { ...b, at: 'porch' } : b));
  // A save made mid-shift resumes at the start of that night's prep.
  if (out.phase === 'shift') { out.phase = 'prep'; out.clock = 0; }
  out.version = SAVE_VERSION;
  return out;
}
