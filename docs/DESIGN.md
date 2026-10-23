# Lantern & Lens — Game Design Document

> A cozy, first-person, night-shift light-shop simulator set in a forest-edge hamlet.
> You stock, craft and sell lamps, candles, lenses and stained glass to the townsfolk,
> and every light you sell glows in a window of the village outside.

Status: **M1 vertical slice built** (see the README for what's in). Replaces the PRISM site in this repo.

---

## 1. Pillars

1. **Cozy, never stressful.** No fail states, no game over, no punishing timers. Pressure is
   soft (a customer waiting looks a little sad; nothing is lost). See Project Horseshoe's
   "safety, abundance, softness".
2. **Hands-on and tactile.** Everything is done in first person with your own hands: carry
   boxes, place stock, ring up sales, craft products. Every action has a sound, a little
   motion and a payoff.
3. **Light is the reward.** The one visual idea runs through everything: the shop, the
   products and the town all get brighter as you progress.
4. **Looks and sounds handmade.** Good-quality CC0 models restyled into one consistent toon
   look, and **real recorded** foley and ambience. No synthesized or AI-generated SFX.

## 2. Player fantasy and audience

- Running a little lantern shop on the edge of a forest after dark, rain on the windows, a cat
  asleep on a warm lamp.
- Audience: core sim players (Supermarket Simulator, TCG Card Shop Simulator, Strange
  Horticulture, Potion Craft fans), with sessions of **20–60 minutes** (2–4 nights).

## 3. Platform and tech

| Item | Decision |
|---|---|
| Platform | Browser, desktop and mobile |
| Renderer | Three.js (vendored ES module + import map, **no build step**, matching repo style) |
| Look | `MeshToonMaterial` with a 3-band gradient ramp + `OutlineEffect` ink lines, bloom on lights |
| Assets | glTF/GLB. CC0 packs (KayKit, Kenney, Quaternius) recoloured to the shared palette, plus hand-modelled-in-code products (lamps, glass, lenses, candles) |
| Audio | Web Audio API; real recorded CC0 foley/ambience (Kenney, OpenGameArt CC0, Freesound CC0) |
| Save | `localStorage`, autosave at dawn + on key events, **3 save slots**, guarded with try/catch |
| Controls (desktop) | WASD move, mouse look (pointer lock), LMB interact/place, RMB put back, E use, Q/scroll cycle held item, Tab ledger, P photo mode |
| Controls (mobile) | Left virtual stick move, right-side drag look, context tap button, two-finger tap = back |

## 4. Setting

**Forest-edge hamlet**: mossy timber cottages, a winding path into tall pines, a stream with a
footbridge, mushrooms and fireflies. The shop is a crooked two-storey cottage with a big front
window that looks out over the village. At game start almost every window is dark.

Palette, warm against cool: deep forest blues and teal shadows (`#1d2b3a`, `#2f4a4f`), moss
(`#5f7a4a`), with warm lamp ambers (`#ffb35c`, `#ffd89a`) and candle reds as the only hot
colours. Light should always be the most saturated thing on screen.

## 5. Core loop

```
 DUSK ─▶ OPEN SHOP ─▶ serve customers, restock, craft to order ─▶ DAWN summary
   ▲                                                                   │
   └── PREP (untimed): order stock, craft ahead, decorate, upgrade ◀───┘
```

- **Night shift**: dusk to dawn takes about **12–15 real minutes**. The clock is a diegetic wall
  clock plus a small HUD clock.
- **Dawn summary**: coins earned, items sold, reputation changes, new letters, new lit windows.
- **Prep phase (untimed)**: order deliveries, craft stock, rearrange, buy upgrades. Press the
  "Open" sign when ready.

## 6. Shop tasks (all first person)

### 6.1 Deliveries and stocking
- Order on the **catalogue laptop / order book** (diegetic). Boxes arrive on the porch with a
  thump.
- Pick up a box (it sits in your hands at the bottom of the screen). Open it at a shelf.
  Items **snap into ghost-highlighted slots** with a soft squash-and-settle bounce.
- Shelf **price tags**: interact to set a price; it shows cost, market price and profit (the
  Supermarket Simulator model). Overpricing lowers buy chance; it never causes a fail state.

### 6.2 Checkout
- Customers queue at the counter. Scan items (beep + wiggle), choose **cash** (count change
  from a coin tray, with forgiving auto-suggest) or **card** (tap the reader, enter the amount).
- Pleasant haggling occasionally ("Would you take 9?"), which is optional.

### 6.3 Crafting (4 workstations, tactile but forgiving)
Each one has 3–4 steps. You can't fail; better execution gives quality stars, which only add
a price/reputation **bonus**.

| Station | Steps | Unlocked |
|---|---|---|
| **Candles & lanterns** | pick mould → pour wax (hold) → set wick → dye/scent | Start |
| **Lamp assembly** | base → bulb → shade → colour filter; test switch shows the glow mood | Start |
| **Lens grinding** | mount blank → circular drag to polish (a forgiving ring guide) → inspect in light | Licence 2 |
| **Stained-glass panels** | choose pattern → drag coloured pieces into outlines → hold to solder seams → lift to window | Licence 3 |

Customers can place **orders** ("a green-shaded reading lamp") that pin to the order board.

### 6.4 Build and decorate
- Place and move shelves, displays, rugs, plants and lamps. Layout affects browsing flow
  (customers follow lit paths, and well-lit displays sell better).
- **Room expansions**: front shop → back workshop → storage loft → rooftop lantern room.

## 7. Customers: ordinary townsfolk

- Around 12 named regulars at launch (baker, woodcutter, schoolteacher, night-fisher, an old
  couple, a student, ...) plus generic visitors. They come from rigged CC0 low-poly people with
  walk/idle/wave/pick-up animations.
- Each has preferences (colour, product type, price sensitivity) and a **reputation** meter.
  Raising it unlocks their special recipe or decor item, and they leave **thank-you letters**
  on the corkboard.
- Behaviour: enter → browse lit displays → pick up / ask for an item → queue → pay → leave.
  If something is out of stock they make a note on the "wish list", which is a hint, not a
  penalty.

## 8. Progression

- **Shop level and licences** (XP from sales and crafts) unlock product lines and workstations.
- **Reputation per customer**: recipes, decor and letters.
- **Room expansions**, bought with coins.
- **Light the town**: every product sold to a townsfolk household lights a window in the
  village seen through the shop window. The long-term goal is a fully lit hamlet, which plays
  a lantern-festival night as a finale. The game continues endlessly afterwards.
- **Hire staff** (later): a cashier and a restocker, each with a cozy idle animation.

## 9. World systems

- **Weather and seasons**: clear, rain, fog and snow nights. Demand shifts with weather (fog
  means more lanterns, snow means more candles). Seasons cycle every 7 nights, with decor
  swaps (autumn leaves, snow on roofs).
- **Day/night**: dusk orange → blue hour → night → dawn pink, driving fog colour and lights.

## 10. Charm features

- **Shop cat**: wanders, naps on warm lamps, can be petted (purr + hearts). It never blocks the
  player.
- **Customer letters** on a corkboard, collectible and re-readable.
- **Photo mode**: hide the HUD, free camera, a few filters, save a PNG.

## 11. Feel and animation (cozy rules)

- Never linear: ease-out-back for things that appear, ease-in-out-sine for idle loops.
- Squash and stretch on placement: about 6–10% squash, 120–180 ms settle.
- Held item sway: lag-follow of the camera with soft spring damping. Head bob is gentle
  (and can be switched off).
- UI motion: 150–250 ms for small elements, 300–450 ms for panels. Nothing flashes or shakes.
- Lights fade on with a 200 ms warm flicker. The camera never shakes.

## 12. Audio

- **Real recorded CC0 sounds only**: glass clinks, wax pour, cardboard, coins, register bell,
  door bell, rain on the roof and window, forest night ambience (crickets, owl, stream),
  footsteps on wood, cat purr.
- Music: soft acoustic/lo-fi CC0 tracks or recorded instrument loops. Mixer channels: master,
  music, ambience, SFX.
- Spatial audio (PannerNode) for customers, the door, rain on the window and the stream.

## 13. Asset sourcing (licence: CC0 only)

| Need | Source |
|---|---|
| Furniture / props | KayKit Furniture Bits, Kenney Furniture Kit |
| Nature / village | Quaternius Stylized Nature, Kenney Nature Kit |
| Townsfolk | Quaternius animated characters / universal animation library |
| Cat | Quaternius animals (CC0) |
| Products | Built in code (lathe geometry for lamps, candles and lenses; shape geometry for glass) |
| SFX / ambience | Kenney audio packs, OpenGameArt CC0 collection, Freesound CC0 |

All models get the shared toon material and palette at load time so the scene reads as one
style. Credits screen lists every pack even though CC0 doesn't require it.

## 14. Milestones

### M1 — Vertical slice (first build)
- Shop interior and front-window village view, toon look, day/night transition
- First-person controls (desktop + mobile)
- Deliveries → stock shelves (snap) → price tags
- Customers (3 regulars + generics) → checkout (cash + card)
- **Two crafts: candles and lamp assembly**
- Light-the-town windows, a dawn summary, 3 nights of content
- Shop cat, real recorded SFX and ambience, autosave and 3 slots

### M2 — Full game
- Lens grinding + stained glass, licences 1–5
- Room expansions, decorating, reputation, letters, all 12 regulars
- Weather and seasons, hire staff, photo mode, finale festival

## 15. Asset pipeline

Models and sounds were downloaded from kenney.nl and opengameart.org (CC0 only), trimmed and
encoded with ffmpeg (`.ogg` + `.m4a` for Safari), and credited in `assets/CREDITS.md`. Quaternius
and Freesound were not needed for M1.

### M1 deviations from this document
- Townsfolk and the cat are Kenney Mini Characters / Cube Pets (rigged, with idle/walk/pick-up/emote clips).
- Cottages are built in code instead of using a pack, so every window can be lit individually.
- Weather (clear/rain/fog) shipped in M1; seasons, staff, decorating, expansions, lens grinding and
  stained glass stay in M2.

## 16. Research references

- Cozy design: Project Horseshoe definition (safety, abundance, softness); no fail states,
  player-controlled pacing (Wikipedia "Cozy game", Univ. of Łódź *Replay* paper).
- Shop-sim loop and controls: Supermarket Simulator (stock → price → checkout → reinvest;
  price screen with cost/market/profit); TCG Card Shop Simulator (layout + collecting).
- Tactile craft and tone: Strange Horticulture (identification, shop-as-story), Unpacking
  (story through objects), Tiny Glade (gentle snapping, no goals pressure), A Short Hike.
- Game feel: Pichlmair & Johansen, "Designing Game Feel" (arXiv 2011.09201); "juice is
  feedback on top of a responsive core".
- Rendering: three.js `MeshToonMaterial`, `OutlineEffect`, `PointerLockControls` docs.
- Stained-glass process: cartoon → cut → grind → came/foil → flux and solder → finish.
