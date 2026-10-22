# PRISM

**An interactive study in six states of light.**

PRISM is a scroll-driven web experience: six rooms, six palettes, one continuous
atmosphere rendered by a single WebGL fragment shader. Particles refract, colour
melts, a lattice remembers its shape, type finds a rhythm, and a sphere of light
scatters around your cursor and gathers itself again.

Hand-built with vanilla JavaScript, CSS, Canvas 2D, GLSL and the Web Audio API.
**No frameworks, no build step, no runtime dependencies.**

---

## The six rooms

| # | Room | What happens | Engine |
|---|------|--------------|--------|
| 00 | **Aperture** | Giant kinetic wordmark, aperture rings, cursor parallax | WebGL · CSS |
| 01 | **Refraction** | 2,000 particles trace an invisible flow field; your cursor adds a vortex | Canvas 2D |
| 02 | **Fluid** | Luminous colour fields pool, merge and leave a wake when you stir | Canvas 2D + CSS |
| 03 | **Gravity** | A spring lattice you can pull; it deforms and remembers | Canvas 2D physics |
| 04 | **Rhythm** | The daylight room: kinetic marquees, scrambling type, a meter | CSS |
| 05 | **Spectrum** | 1,600 particles on a sphere scatter at your touch, then re-gather | Canvas 2D |

Each room owns a palette; the page cross-fades between them as you scroll and the
shader's motif changes with it — rings, a refracted fan of rays, caustics,
gravitational lensing, paper, a spectral veil.

## Controls

| Input | Result |
|-------|--------|
| **Move** | Bends every field. The cursor is a second light source. |
| **Scroll / drag** | Travels between rooms; palette follows the room in the centre. |
| **Sound toggle** | Starts a generative pad + occasional notes, one voice per room. |
| **Shuffle** (room 04) | Scrambles the word. |
| **Keyboard** | `Tab` through everything, `Enter`/`Space` to activate, `Esc`-free. |

## Run it

```bash
npm start
# → http://localhost:4173
```

`server.mjs` is a ~100-line dependency-free static server (binds `0.0.0.0`,
correct MIME types, traversal guard, no host allowlist). Any static server works:

```bash
python3 -m http.server 4173
```

It's a fully static site — nothing is compiled at runtime.

## How it's built

```
index.html               Semantics + all six rooms of copy
css/style.css            Design system, @property colour tokens, layout, motion
js/main.js               Boot, scroll choreography, cursor, reveals, audio wiring
js/webgl.js              The sky: one shader, six motifs
js/core/palette.js       The six states of light + animated interpolation
js/core/utils.js         Frame-rate independent maths, colour helpers
js/scenes/base.js        DPR sizing, pointer state, visibility, static fallbacks
js/scenes/flow.js        Refraction — flow field
js/scenes/goo.js         Fluid — metaballs
js/scenes/cloth.js       Gravity — spring lattice
js/scenes/orb.js         Spectrum — particle sphere
js/audio.js              Generative six-room instrument
assets/fonts/            Self-hosted Space Grotesk + Instrument Serif (OFL)
```

Three decisions worth calling out:

**One frame loop.** A single `requestAnimationFrame` updates the shader, all four
canvas rooms, the scroll inertia, palette interpolation and the cursor. Rooms that
aren't near the viewport are skipped entirely, so the page costs the same whether
you're looking at one room or six.

**The palette is the interface.** Colours live as RGB triples in
`core/palette.js`, are interpolated every frame, and are handed to both CSS
(`--accent`, `--bg`, …) and the shader as uniforms — so the chrome, the canvases
and the atmosphere can never drift out of sync.

**Fallbacks everywhere.** No WebGL? A CSS gradient sky takes over. No
`IntersectionObserver`? Content reveals immediately. Reduced motion? Every room
renders a composed still. Module fails to load? A `setTimeout` in the document
lifts the curtain and reveals the type.

## Accessibility & performance

- Respects `prefers-reduced-motion` — no scroll hijack, no physics, no drifting
  grain; every room renders its still frame.
- Smooth scroll is opt-out: it's disabled for touch-primary devices and reduced
  motion, and never intercepts pinch-zoom.
- Semantic landmarks, one `h1`, labelled sections and buttons, a skip link,
  visible `:focus-visible` rings, `aria-current` on the chapter rail.
- HUD and cursor use `mix-blend-mode: difference`, so they stay legible on both
  night and daylight rooms without colour guessing.
- Device pixel ratio is capped and total pixel budgets are enforced per canvas;
  the blur-heavy fluid room softens further on small screens.
- Audio is never autoplayed — it is only created inside a click, and never more
  than one context exists.

## Tests

The experience is tested headlessly rather than by eye:

```bash
npm install          # dev-only: jsdom + glslang
npm test
```

| Suite | What it proves |
|-------|----------------|
| `test/assets` | Every HTML reference, anchor target and ES module resolves; all canvas rooms have factories. |
| `test/shader` | The vertex and fragment shaders compile as real GLSL (via glslang → SPIR-V), not just "look right". |
| `test/physics` | Particles stay finite and in bounds, the lattice deforms then relaxes to <0.5px, the orb scatters and returns, reduced-motion rendering never throws. |
| `test/boot` | A full jsdom boot: six rooms mount, the wheel hijack captures, the loader dismisses, palettes follow every room, the daylight flip works, the rail tracks the active chapter, zero uncaught errors. |

The suites caught two real bugs during development: a theme initialisation race
that aborted boot, and a lattice coupling term that used absolute positions
instead of displacement, leaving the grid permanently squashed.

## Credits

- **Type:** [Space Grotesk](https://github.com/floriankarsten/space-grotesk) and
  [Instrument Serif](https://github.com/Instrument/instrument-serif), both under
  the SIL Open Font License — licences in `assets/fonts/`.
- **Everything else:** written for this project. WebGL, Canvas 2D, Web Audio, CSS.
  No libraries, no images, no video, no Lottie, no Three.js.

## Browser support

Modern evergreen browsers (Chrome/Edge 111+, Safari 16.4+, Firefox 128+ for
`@property` colour interpolation). Older browsers get the layout, type and
fallback backgrounds; the animated palette simply snaps instead of gliding.

## Licence

MIT — see [LICENSE](LICENSE).
