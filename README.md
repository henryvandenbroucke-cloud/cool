# cool

Two hand-built web experiments. No frameworks, no build step, no runtime
dependencies.

| | What it is | Where |
|---|---|---|
| **snake** | A blank screen. A cartoon snake follows your cursor. If it touches you, you lose. Boulders block the snake — hide behind them… but it'll come around. | `/` (default page) |
| **PRISM** | An interactive study in six states of light: a WebGL shader sky, four canvas rooms, generative audio. | `/prism` |

## Run it

```bash
npm start
# → http://localhost:4173  (snake at /, PRISM at /prism)
```

`server.mjs` is a small dependency-free static server (binds `0.0.0.0`,
correct MIME types, traversal guard). It resolves PRISM's absolute `/css`,
`/js` and `/assets` paths from its `prism/` home. Any static server works:

```bash
python3 -m http.server 4173
```

---

# snake

*A very motivated cartoon snake, one blank screen, and your cursor.*

The snake's head chases your cursor. If it touches you, you lose. The only
"thing you can do" to not die is **move** — the snake has a limited turn rate,
so you circle it — and **hide**: round boulders pop in over time and the
snake physically cannot pass through them, so you can sit in a boulder's
shadow until it goes all the way around.

The snake gets a little faster and a little longer the longer you survive.
Survival time and local best (saved in `localStorage`) sit in the corner.
Click or press `R` to restart after a death.

**Controls**

| Input | Result |
|-------|--------|
| **Move mouse** | That's you. The cursor is the prey. |
| **Click / `R`** | Restart (after a death; `R` works anytime). |

**How it's built**

```
index.html             The page: canvas, tiny HUD, game-over card
css/snake.css          Styles (cream background, rounded font, card, hint)
js/snake.js            Browser glue: cartoon canvas rendering, input, HUD
js/snake/logic.mjs     All game rules — pure, DOM-free, Node-testable
test/snake.test.mjs    27 headless checks (see below)
```

The logic/ rendering split means the whole game can be verified without a
browser: `js/snake/logic.mjs` is plain data + math, and the jsdom smoke test
boots the real page and plays a full round (chase → death → overlay →
click-to-restart).

Tuning lives in `CONFIG` at the top of `logic.mjs`: chase speed + ramp, turn
rate (the dodge-ability), body spacing/growth, boulder sizes and spawn cadence.

**Tests**

```bash
npm test          # snake + all PRISM suites
npm run test:snake
```

What `test/snake.test.mjs` proves:

- a stationary cursor is always caught, in reasonable time;
- a dodging cursor (staying across the middle of the screen from the head)
  survives two minutes — death is *provably* impossible, and the run doubles
  as a soak test over walls and boulders;
- the snake never enters a boulder, wraps around it, and still reaches a
  target on the far side;
- the cursor is solid against boulders too (you can't camp inside one);
- the body is an evenly spaced trail that grows over time;
- boulders only spawn in fair places (never on the cursor, head, body or
  another boulder);
- the snake can never leave the screen;
- seeded games are reproducible; dead games freeze.

---

# PRISM

**An interactive study in six states of light** — served at `/prism`.

PRISM is a scroll-driven web experience: six rooms, six palettes, one
continuous atmosphere rendered by a single WebGL fragment shader. Particles
refract, colour melts, a lattice remembers its shape, type finds a rhythm,
and a sphere of light scatters around your cursor and gathers itself again.

Hand-built with vanilla JavaScript, CSS, Canvas 2D, GLSL and the Web Audio
API. **No frameworks, no build step, no runtime dependencies.**

## The six rooms

| # | Room | What happens | Engine |
|---|------|--------------|--------|
| 00 | **Aperture** | Giant kinetic wordmark, aperture rings, cursor parallax | WebGL · CSS |
| 01 | **Refraction** | 2,000 particles trace an invisible flow field; your cursor adds a vortex | Canvas 2D |
| 02 | **Fluid** | Luminous colour fields pool, merge and leave a wake when you stir | Canvas 2D + CSS |
| 03 | **Gravity** | A spring lattice you can pull; it deforms and remembers | Canvas 2D physics |
| 04 | **Rhythm** | The daylight room: kinetic marquees, scrambling type, a meter | CSS |
| 05 | **Spectrum** | 1,600 particles on a sphere scatter at your touch, then re-gather | Canvas 2D |

Each room owns a palette; the page cross-fades between them as you scroll and
the shader's motif changes with it — rings, a refracted fan of rays,
caustics, gravitational lensing, paper, a spectral veil.

## Controls

| Input | Result |
|-------|--------|
| **Move** | Bends every field. The cursor is a second light source. |
| **Scroll / drag** | Travels between rooms; palette follows the room in the centre. |
| **Sound toggle** | Starts a generative pad + occasional notes, one voice per room. |
| **Shuffle** (room 04) | Scrambles the word. |
| **Keyboard** | `Tab` through everything, `Enter`/`Space` to activate, `Esc`-free. |

## How it's built

Everything lives in `prism/`; the server aliases its absolute paths.

```
prism/index.html               Semantics + all six rooms of copy
prism/css/style.css            Design system, @property colour tokens, layout, motion
prism/js/main.js               Boot, scroll choreography, cursor, reveals, audio wiring
prism/js/webgl.js              The sky: one shader, six motifs
prism/js/core/palette.js       The six states of light + animated interpolation
prism/js/core/utils.js         Frame-rate independent maths, colour helpers
prism/js/scenes/base.js        DPR sizing, pointer state, visibility, static fallbacks
prism/js/scenes/flow.js        Refraction — flow field
prism/js/scenes/goo.js         Fluid — metaballs
prism/js/scenes/cloth.js       Gravity — spring lattice
prism/js/scenes/orb.js         Spectrum — particle sphere
prism/js/audio.js              Generative six-room instrument
prism/assets/fonts/            Self-hosted Space Grotesk + Instrument Serif (OFL)
```

Three decisions worth calling out:

**One frame loop.** A single `requestAnimationFrame` updates the shader, all
four canvas rooms, the scroll inertia, palette interpolation and the cursor.
Rooms that aren't near the viewport are skipped entirely, so the page costs
the same whether you're looking at one room or six.

**The palette is the interface.** Colours live as RGB triples in
`core/palette.js`, are interpolated every frame, and are handed to both CSS
(`--accent`, `--bg`, …) and the shader as uniforms — so the chrome, the
canvases and the atmosphere can never drift out of sync.

**Fallbacks everywhere.** No WebGL? A CSS gradient sky takes over. No
`IntersectionObserver`? Content reveals immediately. Reduced motion? Every
room renders a composed still. Module fails to load? A `setTimeout` in the
document lifts the curtain and reveals the type.

## Accessibility & performance

- Respects `prefers-reduced-motion` — no scroll hijack, no physics, no
  drifting grain; every room renders its still frame.
- Smooth scroll is opt-out: it's disabled for touch-primary devices and
  reduced motion, and never intercepts pinch-zoom.
- Semantic landmarks, one `h1`, labelled sections and buttons, a skip link,
  visible `:focus-visible` rings, `aria-current` on the chapter rail.
- HUD and cursor use `mix-blend-mode: difference`, so they stay legible on
  both night and daylight rooms without colour guessing.
- Device pixel ratio is capped and total pixel budgets are enforced per
  canvas; the blur-heavy fluid room softens further on small screens.
- Audio is never autoplayed — it is only created inside a click, and never
  more than one context exists.

## Tests

The experience is tested headlessly rather than by eye:

```bash
npm install          # dev-only: jsdom + glslang
npm test
```

| Suite | What it proves |
|-------|----------------|
| `test/snake` | The snake's whole rulebook (see above), including a full jsdom playthrough of the real page. |
| `test/assets` | Every HTML reference, anchor target and ES module resolves; all canvas rooms have factories. |
| `test/shader` | The vertex and fragment shaders compile as real GLSL (via glslang → SPIR-V), not just "look right". |
| `test/physics` | Particles stay finite and in bounds, the lattice deforms then relaxes to <0.5px, the orb scatters and returns, reduced-motion rendering never throws. |
| `test/boot` | A full jsdom boot: six rooms mount, the wheel hijack captures, the loader dismisses, palettes follow every room, the daylight flip works, the rail tracks the active chapter, zero uncaught errors. |

The suites caught two real bugs during development: a theme initialisation
race that aborted boot, and a lattice coupling term that used absolute
positions instead of displacement, leaving the grid permanently squashed.

## Credits

- **Type:** [Space Grotesk](https://github.com/floriankarsten/space-grotesk)
  and [Instrument Serif](https://github.com/Instrument/instrument-serif),
  both under the SIL Open Font License — licences in `prism/assets/fonts/`.
- **Everything else:** written for this project. WebGL, Canvas 2D, Web
  Audio, CSS. No libraries, no images, no video, no Lottie, no Three.js.

## Browser support

Modern evergreen browsers (Chrome/Edge 111+, Safari 16.4+, Firefox 128+ for
`@property` colour interpolation). Older browsers get the layout, type and
fallback backgrounds; the animated palette simply snaps instead of gliding.

## Licence

MIT — see [LICENSE](LICENSE).
