// Economy + save rules: the parts of the game that must never drift.
import assert from 'node:assert/strict';
import {
  newGame, parseKey, candleKey, lampKey, marketPrice, keyMatches, buyChance, levelFor, orderBox,
  recordSale, startShift, endShift, totalWindows, migrate, addWish, fulfilWishes, sectionCapacity,
  buyLicence, canBuyLicence, productName, save, load,
} from '../js/game/state.js';
import { HOUSES, REP_WINDOW_STEPS, STOCK } from '../js/game/config.js';

const results = [];
const test = (name, fn) => {
  try { fn(); results.push([name, true]); } catch (e) { results.push([name, false, e.message]); }
};

test('product keys round-trip', () => {
  assert.deepEqual(parseKey(candleKey('pillar', 'rose', 2)), { kind: 'candle', form: 'pillar', color: 'rose', stars: 2 });
  assert.deepEqual(parseKey(lampKey('brass', 'dome', 'teal', 3)), { kind: 'lamp', base: 'brass', shade: 'dome', filter: 'teal', stars: 3 });
  assert.equal(parseKey('matches').kind, 'stock');
  assert.equal(parseKey('supply:lamp_kit').kind, 'supply');
});

test('stars raise market price, never lower it', () => {
  assert.ok(marketPrice(candleKey('pillar', 'cream', 3)) > marketPrice(candleKey('pillar', 'cream', 1)));
  assert.ok(marketPrice(lampKey('brass', 'dome', 'amber', 1)) > marketPrice(lampKey('wood', 'drum', 'amber', 1)));
});

test('want patterns match the right products', () => {
  assert.ok(keyMatches('candle:pillar:rose:2', 'candle'));
  assert.ok(keyMatches('candle:pillar:rose:2', 'candle:*:rose'));
  assert.ok(!keyMatches('candle:pillar:sage:2', 'candle:*:rose'));
  assert.ok(keyMatches('lamp:wood:drum:rose:1', 'lamp:*:*:rose'));
  assert.ok(!keyMatches('matches', 'tealights'));
});

test('buy chance is gentle and monotonic', () => {
  let prev = 1;
  for (let r = 0.5; r <= 2; r += 0.05) {
    const c = buyChance(r * 10, 10);
    assert.ok(c <= prev + 1e-9, `non-monotonic at ${r}`);
    prev = c;
  }
  assert.equal(buyChance(10, 10), 0.95);
  assert.equal(buyChance(30, 10), 0);
});

test('ordering spends coins and lands boxes on the porch', () => {
  const s = newGame(0);
  const before = s.coins;
  const boxes = orderBox(s, 'tealights', 2);
  assert.equal(boxes.length, 2);
  assert.equal(s.coins, Math.round((before - 2 * STOCK.tealights.cost * STOCK.tealights.boxQty) * 100) / 100);
  assert.ok(boxes.every((b) => b.at === 'porch' && b.count === STOCK.tealights.boxQty));
  s.coins = 0;
  assert.equal(orderBox(s, 'tealights', 1), null);
});

test('regular sales light their house windows at the rep steps', () => {
  const s = newGame(0);
  const lit = [];
  let n = 0;
  while (s.rep.mira < 100 && n++ < 40) lit.push(...recordSale(s, { key: 'tealights', price: 3, regular: 'mira' }).lit);
  assert.deepEqual(lit, ['0:0', '0:1', '0:2']);
  assert.equal(REP_WINDOW_STEPS.length, HOUSES[0].windows);
  assert.ok(s.letters.some((l) => l.id === 'mira:0'));
});

test('generic sales light generic houses every few sales', () => {
  const s = newGame(0);
  for (let i = 0; i < 9; i++) recordSale(s, { key: 'matches', price: 1.2 });
  assert.equal(s.lit.length, 3);
  assert.ok(s.lit.every((id) => HOUSES[+id.split(':')[0]].owner === null));
});

test('levels and licences', () => {
  const s = newGame(0);
  assert.equal(levelFor(0), 1);
  assert.ok(!canBuyLicence(s, 'lamps'));
  s.xp = 150; s.coins = 100;
  assert.ok(canBuyLicence(s, 'lamps'));
  assert.ok(buyLicence(s, 'lamps'));
  assert.ok(!buyLicence(s, 'lamps'));
  assert.ok(!canBuyLicence(s, 'lens')); // coming soon
});

test('shift cycle advances the night and writes the welcome letter', () => {
  const s = newGame(0);
  startShift(s, () => 0.1);
  assert.equal(s.phase, 'shift');
  assert.equal(s.weather, 'clear');
  const sum = endShift(s);
  assert.equal(sum.night, 1);
  assert.equal(s.night, 2);
  assert.equal(s.phase, 'prep');
  assert.ok(s.letters.some((l) => l.id === 'm:firstNight'));
});

test('wishes are recorded once and cleared when sold', () => {
  const s = newGame(0);
  addWish(s, 'Mira', 'candle:*:honey');
  addWish(s, 'Mira', 'candle:*:honey');
  assert.equal(s.wishes.length, 1);
  assert.equal(fulfilWishes(s, 'candle:jar:honey:2'), 1);
  assert.equal(s.wishes.length, 0);
});

test('migrate repairs old or partial saves', () => {
  const s = migrate({ slot: 1, coins: 12, phase: 'shift', clock: 300, boxes: [{ id: 'b9', key: 'oil', count: 3, at: 'held' }] });
  assert.equal(s.phase, 'prep');
  assert.equal(s.clock, 0);
  assert.equal(s.boxes[0].at, 'porch');
  assert.ok(s.rep.mira === 0 && s.stats.sold === 0);
});

test('capacities and names are sane', () => {
  assert.equal(sectionCapacity('matches'), 6);
  assert.equal(sectionCapacity(lampKey('wood', 'drum', 'amber', 1)), 2);
  assert.equal(productName(candleKey('taper', 'sage', 1)), 'Sage Taper Pair');
  assert.equal(totalWindows(), HOUSES.reduce((a, h) => a + h.windows, 0));
});

test('save + load survive without localStorage and with it', () => {
  const s = newGame(2);
  assert.equal(save(s), false);
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  s.coins = 42;
  assert.equal(save(s), true);
  assert.equal(load(2).coins, 42);
  delete globalThis.localStorage;
});

for (const [name, ok, msg] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${msg}`}`);
const failed = results.filter((r) => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
