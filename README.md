# Lantern & Lens

**A cozy, first-person, night-shift light-shop simulator.**

You run a little lamp and candle shop on the edge of a pine forest. Every evening
you flip the sign to OPEN, and the townsfolk wander in from the lane: stock the
shelves, set your prices, ring people up at an old brass register, and pour candles
and build lamps at the workbenches in the back. Every light you sell glows in a
window of the village outside, and the goal is a fully lit hamlet.

No fail states, no punishing timers. Just a warm shop, rain on the windows, a cat
asleep on the rug and a radio playing.

Built in the browser with three.js. **No frameworks, and no build step for development** (an optional build packs everything into one double-clickable HTML file).

---

## Play

**Easiest — one file, no setup:** build the single-file version and double-click it.

```bash
npm install
npm run build        # → dist/Lantern-and-Lens.html (everything embedded, ~21 MB)
```

**Development:** serve the folder (opening `index.html` straight from disk can't load modules or models).

```bash
npm start
# → http://localhost:4173
```

Any static server works (`python3 -m http.server 4173`). It runs on desktop and on phones.

| Input | Desktop | Touch |
|---|---|---|
| Move | `WASD` / arrows (`Shift` to walk faster) | left thumbstick |
| Look | mouse (click the view to capture it) | drag on the right |
| Use / place / pick up | left click | **Use** or tap the thing |
| Take one back / radio off | right click | **Back** |
| Put a box down | `E` | **Drop** |
| Settings | `Tab` | ☰ |
| Photo mode | `P` | ☰ → Photo mode |
| Release mouse / leave bench | `Esc` | — |

## The loop

1. **Prep (morning, untimed).** Order stock in the **ledger** on the counter. Boxes land on the porch.
   Carry them in and stock the shelves; click a **price tag** to set prices.
2. **Craft.** Carry **Candle Supplies** to the candle bench and pour candles: pick a mould → hold to pour → drop the
   wick → choose a colour. Buy the **Lamp Workbench** licence (level 2) to build lamps: base → screw in the
   bulb → shade → glow colour → switch on. Every step succeeds; doing it nicely earns quality stars (worth more).
   Finished pieces go into the crate: pick it up and stock them like anything else.
3. **Night shift (dusk to dawn, about 12 minutes).** Flip the door sign to OPEN. Townsfolk browse, pick things up and
   queue at the counter. Click each item to ring it up, then the register: count out change for cash, or key in
   card payments (“Count it for me” is always there).
4. **Dawn.** You get a summary, then it autosaves and a new morning begins.

**Progression:** shop level and licences (lamps, jar candles, lavender dye, brass and ceramic bases), friendship with
six regulars (each one lights up to three windows of their own house and writes you letters), wishes pinned to the
corkboard, and rain and fog nights that change what sells.

## How it's built

```
index.html                 HUD, panels, touch controls, import map
css/style.css              Paper-and-ink UI, tokens, motion
js/main.js                 Boot, title + 3 save slots, frame loop
js/game/config.js          All tunable data: products, prices, licences, townsfolk, letters
js/game/state.js           Pure economy + save rules (no DOM, unit-tested)
js/game/render.js          Toon materials, ink-outline post pass, bloom, grade, canvas textures
js/game/assets.js          GLB loading → shared toon materials, instancing
js/game/world.js           Sky, time of day, weather, windows, door
js/game/shop.js            The shop: walls, windows, counter, shelves, benches, porch, decor
js/game/village.js         Cottages built in code, forest, lane, stream, fence
js/game/products.js        Candles, lamps, lanterns, boxes: lathe-modelled in code
js/game/player.js          First-person body, collisions, head bob, carrying hand
js/game/input.js           Keyboard/mouse with pointer lock, thumbstick + drag-look
js/game/shelves.js         Shelf sections, layout, price tags
js/game/customers.js       Townsfolk AI: arrive, browse, decide, queue, pay, leave
js/game/nav.js             Grid A* + path smoothing for townsfolk and the cat
js/game/crafting.js        Candle and lamp benches
js/game/cat.js             The shop cat
js/game/ui.js              HUD, toasts, ledger, price tag, checkout, dawn, corkboard, settings
js/game/audio.js           Web Audio: spatial foley, ambience layers, indoor muffle, radio
js/game/game.js            Orchestrator: targeting, carrying, checkout, night flow, saves, photo mode
```

A few design decisions:

- **One look, many sources.** Kenney models arrive in different styles; every material is
  converted to a shared 3-band toon material and remapped onto one palette. An outline pass
  reads a normal/depth pre-pass, so ink lines are consistent on everything, including skinned characters.
- **Light is the reward.** Only light sources are bright enough to bloom: lanterns, candle flames,
  lit lamps and village windows.
- **Real sound.** Every sound effect and ambience is a CC0 recording (see `assets/CREDITS.md`). The outdoor
  ambience goes through a low-pass filter that closes when you step inside and opens when the door swings.
- **Cozy rules.** No linear motion anywhere (`tween.js`), squash-and-settle when items land, nothing
  shakes, and the clock pauses while a panel is open.

## Tests

```bash
npm test
```

| Suite | What it proves |
|---|---|
| `test/state` | Keys, prices, buy-chance curve, ordering, window lighting, letters, licences, shift cycle, wishes, save migration, storage without `localStorage`. |
| `test/assets` | Every import, model (and its texture), sound (both `.ogg` and `.m4a`), radio track, HTML/CSS reference and DOM id the scripts use exists. |

## Roadmap

See [`docs/DESIGN.md`](docs/DESIGN.md). Milestone 1 (this build) is the vertical slice plus most of the charm:
candles and lamps, shelves and checkout, six regulars, light-the-town, weather, the cat, letters, photo mode
and saves. Milestone 2 adds lens grinding, stained glass, room expansions, decorating, staff, seasons and the
lantern-festival finale.

## Credits & licence

Code: MIT (see `LICENSE`). Art, sound and music credits are in [`assets/CREDITS.md`](assets/CREDITS.md).
