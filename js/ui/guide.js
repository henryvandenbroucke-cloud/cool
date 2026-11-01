/** "How to play" — the always-available manual, plus data provenance. */
import { CLUBS, CLUB_BY_ID, DATA_SNAPSHOT } from '../data/league.js';
import { crest } from './crest.js';
import { MATCHWEEK, totalRounds } from '../engine/state.js';

const STEPS = [
  {
    title: 'Check your squad',
    body: 'Sort by overall, filter by position, and click a player to read their attributes, fitness and season stats. Fitness recovers between matches; morale follows results.',
  },
  {
    title: 'Set the board',
    body: 'Drag shirts between slots or tap a shirt then a bench player. Each player has a natural position — square pegs cost you strength, which the Team report flags.',
  },
  {
    title: 'Pick a mentality',
    body: 'Attacking lifts your expected goals and the opponent’s. Defensive does the opposite. Balanced keeps it neutral. Change it before kick-off.',
  },
  {
    title: 'Play the match',
    body: 'The pre-match hub shows the opponent’s danger man and predicted XI. Kick off for live commentary and a running clock, or Sim to jump to the result and player ratings.',
  },
  {
    title: 'Follow the league',
    body: `All ${CLUBS.length} clubs play every matchday, so the table moves around you. Play out the rest of the ${DATA_SNAPSHOT.season} season, then review it and start another.`,
  },
];

export function renderGuide(store) {
  const game = store.game;
  const club = CLUB_BY_ID[game.clubId];
  const me = game.table[game.clubId];

  return `
    <div class="card guide-hero">
      <div>
        <div class="eyebrow">Guide</div>
        <h2 style="margin-top:8px">How to manage</h2>
        <p class="muted" style="margin-top:10px;max-width:58ch;font-size:14px;line-height:1.6">
          You are ${game.manager}, in charge of ${club.name} from matchweek ${MATCHWEEK + 1}, with ${totalRounds(store.game)} matchdays to play.
          Every matchday you pick the team, choose a plan, and live with the result.
        </p>
        <div class="row" style="gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="btn btn--primary" data-action="start-tour">Replay the tour</button>
          <button class="btn btn--ghost" data-nav="tactics">Open tactics</button>
          <span class="tag">${me.pts} pts · ${me.w}W ${me.d}D ${me.l}L</span>
        </div>
      </div>
      ${crest(game.clubId, 84, 'crest--hero')}
    </div>

    <div class="guide-steps">
      ${STEPS.map(
        (s, i) => `
        <div class="guide-step">
          <span class="guide-step__num">${i + 1}</span>
          <h3>${s.title}</h3>
          <p>${s.body}</p>
        </div>`,
      ).join('')}
    </div>

    <div class="layout-split">
      <div class="card">
        <div class="card__head">
          <div>
            <div class="card__title">The match engine, briefly</div>
            <div class="card__sub">What actually decides a result</div>
          </div>
        </div>
        <div class="card__body">
          <ul class="intel">
            <li><b>Your XI rating</b> is the average of each player’s overall, adjusted for how well he fits his slot and how fresh he is.</li>
            <li><b>Expected goals</b> come from your attack against their defence, plus home advantage and mentality. Better teams generate more chances — they do not guarantee goals.</li>
            <li><b>Goals are random</b> around that expectation, so upsets happen. A 20-shot afternoon can still end 0–1.</li>
            <li><b>Fitness, morale and form</b> carry between matches. Rotating a tired squad is a real decision, not decoration.</li>
            <li><b>Every other fixture is simulated too</b>, with the same engine, so the table is honest.</li>
          </ul>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><div class="card__title">Controls</div></div>
        <div class="card__body">
          <div class="stack" style="gap:9px;font-size:13px">
            <div class="row row--between"><span class="muted">Move a player</span><span><span class="kbd">drag</span> or <span class="kbd">tap</span> then <span class="kbd">tap</span></span></div>
            <div class="row row--between"><span class="muted">Open a player</span><span class="kbd">click row</span></div>
            <div class="row row--between"><span class="muted">Close a panel</span><span class="kbd">Esc</span></div>
            <div class="row row--between"><span class="muted">Match speed</span><span><span class="kbd">1×</span> <span class="kbd">2×</span> <span class="kbd">4×</span></span></div>
            <div class="row row--between"><span class="muted">Skip to full time</span><span class="kbd">Sim</span></div>
            <div class="row row--between"><span class="muted">Tour</span><span class="kbd">→</span> / <span class="kbd">Esc</span></div>
          </div>
          <p class="tiny dim" style="margin-top:14px">Your career saves automatically to this browser. Nothing leaves your device.</p>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head">
        <div>
          <div class="card__title">Where the data comes from</div>
          <div class="card__sub">Snapshot taken ${DATA_SNAPSHOT.date} · ${DATA_SNAPSHOT.season}</div>
        </div>
        <div class="card__spacer"></div>
        <span class="tag tag--accent">Real season data</span>
      </div>
      <div class="card__body stack">
        <p class="small" style="color:var(--ink-2);max-width:74ch;line-height:1.65">
          ${DATA_SNAPSHOT.result} The 20 clubs, their crests, grounds, the league table, last-five form, the closed
          summer transfer window and confirmed managers are real. Player ratings, attributes, ages and every result
          from matchweek ${MATCHWEEK + 1} onwards are TOUCHLINE’s own.
        </p>
        <div class="sources">
          ${DATA_SNAPSHOT.sources
            .map((s) => `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.label}<span aria-hidden="true">↗</span></a>`)
            .join('')}
        </div>
        <p class="tiny dim">Unofficial fan project. Not affiliated with the Premier League, any club, or Sports Interactive/SEGA.</p>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><div class="card__title">Questions</div></div>
      <div class="card__body faq">
        <details open>
          <summary>Is this the real league?</summary>
          <p>The 2026/27 Premier League, frozen on ${DATA_SNAPSHOT.date}. Standings, form and squads reflect public reporting up to that date. Ratings are editorial estimates, so treat them as TOUCHLINE’s opinion rather than official figures.</p>
        </details>
        <details>
          <summary>Why does the game start mid-season?</summary>
          <p>Because the real season is mid-season. You inherit each club’s actual record after nine matchweeks and play the remaining ${totalRounds(game)} (plus any catch-up games) from there, so the table you see is the one everyone is looking at today.</p>
        </details>
        <details>
          <summary>Can I lose my job?</summary>
          <p>Not yet in this build — but the board expectation on the club-picker card is the standard you are judged against in the end-of-season review.</p>
        </details>
        <details>
          <summary>Does it work offline?</summary>
          <p>Yes. No network calls at runtime: fonts, crests and data all ship with the site. Your save lives in this browser’s localStorage.</p>
        </details>
        <details>
          <summary>Where do the crests come from?</summary>
          <p>An open football logo library on GitHub, bundled locally as PNGs. They remain the trademarks of their clubs and are used here for identification in a non-commercial fan project.</p>
        </details>
      </div>
    </div>`;
}
