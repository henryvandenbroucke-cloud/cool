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
| Rotate furniture | mouse wheel | — |
| Settings | `Tab` | ☰ |
| Bench actions | `Space` (hold to pour/solder) | the big button |
| Photo mode | `P` | ☰ → Photo mode |
| Release mouse / leave bench | `Esc` | — |

## The loop

1. **Prep (morning, untimed).** Order stock in the **ledger** on the counter. Boxes land on the porch.
   Carry them in and stock the shelves; click a **price tag** to set prices.
2. **Craft.** Every bench is a close-up minigame on a clear work mat, and every option is open to you:
   - **Candles:** pick a mould → drop in a dye → hold to pour up to the green line → drop the swinging wick →
     blow to cool → pop it out of the mould.
   - **Lamps** (Lamp Workbench licence): base → twist the bulb in with circles → drop on a shade → glow colour →
     pull the chain.
   Nothing can fail; doing a step nicely earns quality stars (worth more). Each piece gets a reveal with
   sparkles and its stars, then goes into the crate: pick the crate up and stock the pieces like anything else.
3. **Night shift (dusk to dawn, about 12 minutes).** Flip the door sign to OPEN. Townsfolk browse, drop what they
   pick into their tote bags and queue at the counter. Click each item to scan it, then the register:
   - **Cash:** the till shows total, received, change due and given (green when it's exact). Hand back change
     from a full drawer of coins (1¢ to 2) and notes (5 to 50); click money in the tray to take it back.
   - **Card:** key the total into the terminal (your keyboard's number keys work too).
   “Count it for me” is always there if you just want to keep the line moving.
   Prices: every tag has −1 / −.50 / −.10 / +.10 / +.50 / +1 buttons, the chance a customer buys at that price, and
   a one-click “best price”.
4. **Dawn.** You get a summary, then it autosaves and a new morning begins.

A **glowing path** of chevrons on the floor leads you through your first night, and a label rides on the
thing to use next (it slides to the screen edge as an arrow, with the distance, when it's behind you). The
card at the top says only the one action to take. Skip or replay it from settings.

**Progression:** shop level and licences (lamps, jar candles, lavender dye, brass and ceramic bases), friendship with
six regulars (each one lights up to three windows of their own house and writes you letters), wishes pinned to the
corkboard, and rain, fog and snow nights that change what sells.

**Growing the shop:**

- **Porch stall** (level 2) and **Back Studio** (level 3) expansions, bought in the ledger.
- The studio holds a **lens grinder** (mount a blank, polish it with circular strokes) and a **stained-glass table**
  (pick a pattern and two colours, paint the cells, solder the lead). Each needs its licence.
- **Decorate:** buy furniture in the ledger and place it anywhere (rotate with the mouse wheel). Shelves and
  tables you place sell stock; everything else adds **coziness**, which brings more visitors and kinder buyers.
- **Staff:** hire Bramble to carry delivery boxes to the shelves, and Wren to mind the register. Wages come out at dawn.
- **Seasons** turn every 7 nights, each with its own colours and best-sellers; winter brings snow.
- Light every window in the village and the next night is the **Lantern Festival**.

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
js/game/crafting.js        Candle, lamp, lens and stained-glass benches
js/game/decor.js           Furniture placement: ghost preview, validity, moving
js/game/staff.js           Hired helpers: Wren at the register, Bramble restocking
js/game/guide.js           Tutorial: path ribbon on the floor, marker, step card
js/game/bake.js            Static batching: merges meshes that never move
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
- **Natural light, fast on modest hardware.** Physically based materials with soft image-based light,
  bloom only on real light sources, and FXAA. Static geometry is merged per material and the forest is
  instanced in culled chunks. Auto quality watches the frame time and turns effects down before it
  ever lowers the resolution. You can pin a tier, turn on storybook ink outlines, or show an FPS counter.
  If the browser is drawing without the graphics card, the home screen says how to fix it.
- **Cozy rules.** No linear motion anywhere (`tween.js`), squash-and-settle when items land, nothing
  shakes, and the clock pauses while a panel is open.

## Tests

```bash
npm test
```

| Suite | What it proves |
|---|---|
| `test/state` | Keys, prices, buy-chance curve, ordering, window lighting, letters, licences, shift cycle, wishes, save migration, storage without `localStorage`, lens/glass products, expansions, decor, staff wages, seasons, festival. |
| `test/assets` | Every import, model (and its texture), sound (both `.ogg` and `.m4a`), radio track, HTML/CSS reference and DOM id the scripts use exists. |

## Roadmap

See [`docs/DESIGN.md`](docs/DESIGN.md). Milestones 1 and 2 are in: candles, lamps, lenses and stained glass,
shelves and checkout, six regulars, light-the-town, weather and seasons, expansions, decorating, staff,
the cat, letters, photo mode, saves and the lantern-festival finale.

## Credits & licence

Code: MIT (see `LICENSE`). Art, sound and music credits are in [`assets/CREDITS.md`](assets/CREDITS.md).
