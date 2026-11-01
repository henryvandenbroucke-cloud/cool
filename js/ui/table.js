/** League table, plus the club's own fixture list. */
import { CLUB_BY_ID } from '../data/league.js';
import { fixtureFor, sortTable, userProgress } from '../engine/state.js';
import { crest } from './crest.js';
import { formDots, escapeHtml } from './dom.js';

export function renderTable(store) {
  const game = store.game;
  const progress = userProgress(game);
  const rows = sortTable(game);
  const me = game.clubId;
  const played = game.table[me].p;
  const position = rows.findIndex((r) => r.clubId === me) + 1;

  const fixtures = game.fixtures
    .filter((f) => f.round > game.round)
    .map((f) => ({ round: f.round, fixture: f.fixtures.find((x) => x.home === me || x.away === me) }))
    .filter((x) => x.fixture)
    .slice(0, 6);

  const recent = game.results.slice(-6).reverse();

  return `
    <div class="stats">
      <div class="stat"><span class="stat__label">Position</span><span class="stat__value">${position}<span class="dim" style="font-size:14px">/20</span></span><span class="stat__sub">${game.table[me].pts} points</span></div>
      <div class="stat"><span class="stat__label">Record</span><span class="stat__value" style="font-size:20px">${game.table[me].w}–${game.table[me].d}–${game.table[me].l}</span><span class="stat__sub">W–D–L</span></div>
      <div class="stat"><span class="stat__label">Goal difference</span><span class="stat__value" style="font-size:20px">${game.table[me].gf - game.table[me].ga > 0 ? '+' : ''}${game.table[me].gf - game.table[me].ga}</span><span class="stat__sub">${game.table[me].gf} for · ${game.table[me].ga} against</span></div>
      <div class="stat"><span class="stat__label">Season progress</span><span class="stat__value" style="font-size:20px">${progress.done}<span class="dim" style="font-size:13px">/${progress.total}</span></span><span class="stat__sub">${progress.total - progress.done} matchdays left</span></div>
    </div>

    <div class="layout-table">
      <div class="card">
        <div class="card__head"><div class="card__title">Premier League</div><div class="card__spacer"></div><span class="tag">Season ${game.season}</span></div>
        <div class="card__body card__body--flush table-wrap">
          <table class="league">
            <thead>
              <tr>
                <th>#</th><th>Club</th><th>Form</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map((row, i) => {
                  const pos = i + 1;
                  const zone = pos <= 4 ? 'zone-ucl' : pos <= 6 ? 'zone-eur' : pos >= rows.length - 2 ? 'zone-rel' : '';
                  return `
                  <tr class="${row.clubId === me ? 'is-me' : ''} ${zone}">
                    <td class="pos">${pos}</td>
                    <td>
                      <div class="row" style="gap:9px">
                        ${crest(row.clubId, 22)}
                        <span>${escapeHtml(CLUB_BY_ID[row.clubId].name)}</span>
                      </div>
                    </td>
                    <td>${formDots(row.form)}</td>
                    <td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td>
                    <td>${row.gf}</td><td>${row.ga}</td>
                    <td>${row.gf - row.ga > 0 ? '+' : ''}${row.gf - row.ga}</td>
                    <td class="pts">${row.pts}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>
          <div class="legend" style="padding:14px 16px">
            <span><i style="background:var(--accent)"></i> Champions League</span>
            <span><i style="background:rgba(124,196,255,.6)"></i> Europe</span>
            <span><i style="background:var(--bad)"></i> Relegation</span>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="card__head"><div class="card__title">Coming up</div></div>
          <div class="card__body stack">
            ${
              fixtures.length
                ? fixtures
                    .map(({ round, fixture }) => {
                      const home = fixture.home === me;
                      const opp = home ? fixture.away : fixture.home;
                      return `<div class="row" style="gap:9px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04)">
                        <span class="tiny dim mono" style="width:26px">${round}</span>
                        ${crest(opp, 20)}
                        <span class="small" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${CLUB_BY_ID[opp].name}</span>
                        <span class="tag">${home ? 'H' : 'A'}</span>
                      </div>`;
                    })
                    .join('')
                : '<p class="tiny dim">Season finished.</p>'
            }
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title">Recent results</div></div>
          <div class="card__body stack">
            ${
              recent.length
                ? recent
                    .map((r) => {
                      const home = r.home === me;
                      const mine = home ? r.hg : r.ag;
                      const theirs = home ? r.ag : r.hg;
                      const tone = mine > theirs ? 'good' : mine < theirs ? 'bad' : 'warn';
                      return `<div class="row" style="gap:9px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:12px">
                        <span class="tag tag--${tone}" style="min-width:22px;justify-content:center">${mine > theirs ? 'W' : mine < theirs ? 'L' : 'D'}</span>
                        <span class="dim" style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${home ? 'v' : '@'} ${CLUB_BY_ID[home ? r.away : r.home].name}</span>
                        <b class="mono">${mine}–${theirs}</b>
                      </div>`;
                    })
                    .join('')
                : `<p class="tiny dim" style="margin-bottom:10px">Your career starts from matchweek 10. These are the real last-five results you inherit:</p>
                   <div class="row" style="gap:6px;flex-wrap:wrap">${game.table[me].form.map((r) => `<span class="dot dot--${r}">${r}</span>`).join('')}</div>`
            }
          </div>
        </div>
      </div>
    </div>`;
}

export { fixtureFor };
