# TOUCHLINE

**A browser football management game.** Pick a club, pick your eleven, and take
charge of every matchday of a full league season.

Ten clubs, 18 matchdays, 90 fixtures, five formations, a live match engine and a
league table that actually adds up. Hand-built with vanilla JavaScript, CSS and
SVG — **no frameworks, no build step, no runtime dependencies.**

```bash
npm start
# → http://localhost:4173
```

---

## The loop

1. **Take a job.** Choose from ten clubs — from title-or-nothing Man City to
   survival-brief Everton. The board's expectation changes with the squad.
2. **Pick your eleven.** Drag shirts between slots on the tactics board, or tap a
   shirt then a bench player to swap. Five shapes, each with its own slot map and
   player-role fit.
3. **Set the tone.** Defensive, Balanced or Attacking — it shifts your expected
   goals for *and* against.
4. **Play the match.** Kick off and watch the clock run with live commentary,
   goals, cards, chances, a scoreboard, in-play stats and full-time player
   ratings. Skip to full time if you're impatient.
5. **Watch the table.** Every other fixture in the round is simulated too, so the
   league moves around you.
6. **Repeat.** Eighteen matchdays, then a season review and a new campaign with
   aged squads and developing youngsters.

A career saves to `localStorage` automatically, so you can close the tab and
continue later.

## What's in it

| | |
|---|---|
| **Squad view** | Sortable, filterable list with condition, morale, goals, assists, value; click any player for an attribute dossier |
| **Tactics board** | 4-3-3, 4-2-3-1, 4-4-2, 3-4-2-1, 5-3-2 · drag-and-drop · role-fit warnings · auto-pick |
| **Match centre** | Pre-match opposition report, live commentary, in-play stats, post-match ratings |
| **League table** | Full standings, form guide, European/relegation zones, fixture list, recent results |
| **Season loop** | Board expectations, end-of-season review, squad ageing and progression between seasons |

## How the engine works

Everything is deterministic: a fixture's 90 minutes are generated from a seeded
PRNG derived from the club ids, season and round, so the same match always
replays the same way.

- **Expected goals** for each side come from the XI strength of the attack against
  the opponent's defence, adjusted for home advantage and mentality:
  `λ = 1.38 · e^(gap/10 · 0.46) · venue · style`.
- **Goals** are Poisson-sampled from λ; scorers and assisters are weighted by
  role and rating, so centre-backs score rarely and strikers score often.
- **Colour events** (saves, misses, cards) pace the commentary without touching
  the score.
- **After the whistle**, results are applied to the table, goals and assists are
  credited, condition drops by minutes played, morale tracks results, and every
  other fixture in the round is simulated.

Player attributes are derived from position, overall and age (with a small
deterministic jitter), so a squad list stays compact but a winger still has pace
and a keeper still has reflexes.

## Run it

```bash
npm start        # static server on 0.0.0.0:4173
npm test         # data + engine + render checks
npm run test:dom # optional jsdom click-through (needs: npm i --no-save jsdom)
```

`server.mjs` is a ~100-line dependency-free static server (correct MIME types,
path-traversal guard, no host allowlist). Any static file server works:

```bash
python3 -m http.server 4173
```

No bundler, no transpiler — the browser loads ES modules directly.

## Layout

```
index.html                  Shell, fonts, meta
css/style.css               Design system: tokens, layout, pitch, match UI
js/main.js                  Boot, routing, match clock, event delegation
js/store.js                 Career state + localStorage persistence
js/data/league.js           Ten clubs, ~180 players, colours, grounds
js/core/rng.js              Seeded PRNG (mulberry32) + Poisson/normal helpers
js/core/attrs.js            Derived attributes, role contribution, market value
js/core/formations.js       Shape definitions, role fit, auto-pick
js/engine/state.js          Squads, fixtures, table, season progression
js/engine/match.js          Match simulation, results, condition and morale
js/ui/*.js                  Landing, shell, squad, tactics, match, table views
test/                       Data, engine, render and jsdom integration tests
```

Three decisions worth calling out:

**Views are strings.** Every screen is a pure function of state returning markup,
so the whole UI can be asserted on in Node without a browser — `test/render.test.mjs`
catches undefined interpolations and broken empty states.

**One state object.** A career is plain JSON: squads, table, fixtures, lineup,
mentality. Saving is `JSON.stringify`, loading is `JSON.parse`, and there is no
migration code.

**The clock renders one view.** While a match runs, only the match panel is
repainted (six times a second), so the nav, rail and scroll position stay put.

## Accessibility & performance

Keyboard-reachable buttons, `aria-current` on the active nav item, focus rings,
`prefers-reduced-motion` support, and layout down to 360 px (the sidebar becomes
a bottom tab bar below 820 px). No network calls at runtime, no analytics.

## Data & disclaimer

An unofficial fan project made for fun. **Club names, player names and stadiums
are real; every rating, attribute, contract, result and table position is
invented** for this game. There is no official data, no live feed and no
affiliation with any club, league or Sports Interactive/SEGA.

Fonts: Space Grotesk and Instrument Serif, both self-hosted under the SIL Open
Font License (see `assets/fonts/`).
