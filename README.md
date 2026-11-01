# TOUCHLINE

**The 2026/27 Premier League, nine matchweeks in — and the rest of the season is yours.**

A browser football management game built on the real current season. Take over one of the
twenty clubs, inherit its actual league position, pick your eleven, and play out the
remaining matchdays. Real crests, real squads, real table. No frameworks, no build step,
no runtime dependencies.

```bash
npm start
# → http://localhost:4173
```

---

## What "real" means here

A data snapshot is baked into the app, dated **1 November 2026**:

| Real | Estimated by TOUCHLINE |
|---|---|
| The 20 clubs, their crests, grounds and capacities | Player overall ratings and ages |
| The 2026/27 league table after nine matchweeks | Derived attributes (pace, shooting, reflexes…) |
| Each club's last five results and points | Market values, contracts, shirt numbers |
| The closed summer 2026 transfer window | Every match simulated from matchweek 10 |
| Managers where publicly confirmed | The remaining fixture calendar |

Because the real season is mid-season, so is the game: you start at matchweek 10 with the
table exactly as it stands today, four clubs holding a game in hand, and 29–30 matchdays to
play. Nothing about the past is invented; everything in the future is.

The **Guide** tab lists the sources and states this plainly inside the app, and the top bar
always carries the snapshot date. To refresh the data, edit `js/data/league.js`
(`record`, `form`, `squad`, `manager`) and bump `DATA_SNAPSHOT.date` — nothing else needs to
change.

## The loop

1. **Take a job.** Twenty clubs, from title-or-nothing Manchester City to a Sunderland side
   that has lost six of nine. The board expectation on each card reflects the table you inherit.
2. **Read the squad.** Sortable, filterable, with condition, morale, goals and value. Click
   any player for a full attribute dossier.
3. **Build the eleven.** Drag shirts between slots on the tactics board — or tap a shirt, then
   a bench player. Five shapes, each with its own role fit, plus an auto-pick.
4. **Choose a mentality.** Attacking raises your expected goals and your opponent's.
   Defensive does the reverse. Balanced keeps it level.
5. **Play the match.** An opposition report with a danger man and predicted XI, then live
   commentary on a running clock, in-play stats, goal flashes and full-time player ratings.
   Sim if you want the result now.
6. **Follow the league.** Every other fixture is simulated with the same engine, so the table
   moves around you. Review the season, then start the next one with aged squads.

A career saves to `localStorage` automatically.

## A two-minute tutorial, built in

A spotlight tour runs the first time you take a job and walks through the snapshot badge,
the navigation, the squad table, the tactics board, mentality, kick-off and the rail. It can
be replayed from the Guide tab or the sidebar at any time, and it is skipped for good once
completed. The Guide tab is the permanent manual: five steps, the match-engine rules in
plain language, controls, data provenance and an FAQ.

## How the engine works

Deterministic by design: a fixture's 90 minutes come from a seeded PRNG derived from the club
ids, season and round, so the same match always replays the same way.

- **XI rating** = each starter's overall, scaled by how well he fits his slot (natural 100%,
  capable 90%, out of position 78%, badly out of position 62%) and by condition.
- **Expected goals** = `1.38 · e^(gap/10 · 0.46) · venue · mentality`, where `gap` is your
  attack against their defence.
- **Goals** are Poisson-sampled from that expectation; scorers and assisters are weighted by
  role and rating, so centre-backs score rarely and strikers score often.
- **Colour events** (saves, misses, cards) pace the commentary without touching the score.
- **After the whistle**, results hit the table, condition drops by minutes played, morale
  tracks results, and the other nine fixtures in the round are simulated too.

## Run it

```bash
npm start        # static server on 0.0.0.0:4173
npm test         # 31 data + engine + render checks
npm run test:dom # 13-step jsdom click-through (needs: npm i --no-save jsdom)
```

`server.mjs` is a ~100-line dependency-free static server (correct MIME types,
path-traversal guard, no host allowlist). Any static file server works:

```bash
python3 -m http.server 4173
```

## Layout

```
index.html                    Shell, fonts, meta
css/style.css                 Design system: tokens, layout, pitch, match UI, tour
js/main.js                    Boot, routing, match clock, event delegation
js/store.js                   Career state + localStorage persistence
js/data/league.js             20 clubs, ~380 players, real records, snapshot sources
js/core/rng.js                Seeded PRNG (mulberry32) + Poisson/normal helpers
js/core/attrs.js              Derived attributes, role contribution, market value
js/core/formations.js         Shape definitions, role fit, auto-pick
js/engine/state.js            Squads, real table, remaining calendar, season rollover
js/engine/match.js            Match simulation, results, condition and morale
js/ui/landing.js              Club picker and dossier
js/ui/shell.js                Sidebar, top bar, right rail
js/ui/squad.js                Squad table and player drawer
js/ui/tactics.js              Drag-and-drop tactics board
js/ui/match.js                Pre-match hub, live commentary, post-match
js/ui/table.js                League table, fixtures, recent results
js/ui/guide.js                How to play, engine rules, data sources
js/ui/tour.js                 Spotlight onboarding tour
assets/crests/*.png           20 real club crests, bundled locally
test/                         Data, engine, render and jsdom integration tests
```

Three decisions worth calling out:

**Views are strings.** Every screen is a pure function of state returning markup, so the whole
UI is asserted on in Node without a browser — `test/render.test.mjs` catches undefined
interpolations, missing crests and broken empty states.

**One state object.** A career is plain JSON: squads, table, calendar, lineup, mentality.
Saving is `JSON.stringify`; loading is `JSON.parse`; no migrations.

**The clock renders one view.** During a match only the match panel is repainted, so the nav,
rail and scroll position stay put while the commentary scrolls under your eyes.

## Accessibility & performance

Keyboard-reachable controls, `aria-current` on the active nav item, focus rings, `Esc` closes
panels, arrow keys drive the tour, `prefers-reduced-motion` support, and layout down to 360 px
(the sidebar becomes a bottom tab bar below 860 px). No network calls at runtime, no
analytics, ~560 KB of crests and ~100 KB of JS.

## Credits & disclaimer

An unofficial fan project. **Club names, player names, crests, grounds and the current league
table are real; every rating, attribute, contract and future result is invented** for this
game. No official data feed, no affiliation with the Premier League, any club, or Sports
Interactive/SEGA.

- Crests: [luukhopman/football-logos](https://github.com/luukhopman/football-logos), bundled
  locally. Club crests remain the trademarks of their clubs and are used here for
  identification in a non-commercial fan project.
- Season data: [2026–27 Premier League](https://en.wikipedia.org/wiki/2026%E2%80%9327_Premier_League)
  and [ESPN's summer 2026 ins and outs](https://www.espn.com/soccer/story/_/id/48955344/premier-league-2026-summer-transfers-all-confirmed-ins-outs-every-club).
- Fonts: Space Grotesk and Instrument Serif, self-hosted under the SIL Open Font License
  (see `assets/fonts/`).
