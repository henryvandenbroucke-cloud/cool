/**
 * Guided tour: a spotlight overlay that walks a new manager through the app.
 * Runs once (remembered in localStorage) or whenever the player asks for it.
 */

const SEEN_KEY = 'touchline.tour.v1';

/** rAF with a fallback for non-browser environments (tests, SSR). */
const nextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));

export const TOUR_STEPS = [
  {
    view: null,
    target: null,
    title: 'You are the manager',
    body: 'TOUCHLINE starts on 1 November 2026, with the real Premier League table where it stands after nine matchweeks. Pick your eleven, pick a plan, and play out the rest of the season. Two minutes and you will know your way around.',
  },
  {
    view: 'squad',
    target: '[data-tour="snapshot"]',
    title: 'Real-season data',
    body: 'Everything with this badge comes from the real 2026/27 season: the table, each club’s form, the summer transfers and the badges. Ratings are our own estimates. Future results are yours to write.',
  },
  {
    view: 'squad',
    target: '[data-tour="nav"]',
    title: 'Four screens, one club',
    body: 'Squad is your list. Tactics is the board. Match is where you kick off. Table is the league. The Guide tab reopens this tour and answers the usual questions.',
  },
  {
    view: 'squad',
    target: '[data-tour="squad-table"]',
    title: 'Read the squad',
    body: 'Tap a column header to sort. Filter by position or by the starting XI. Click any player for attributes, fitness and season stats. The lime bar on the left marks your current eleven.',
  },
  {
    view: 'tactics',
    target: '[data-tour="pitch"]',
    title: 'Build your eleven',
    body: 'Drag a shirt onto another slot to swap two players. Or tap a shirt, then tap a bench player. Every player has a natural position — out of position costs you strength, so watch the Team report.',
  },
  {
    view: 'tactics',
    target: '[data-tour="mentality"]',
    title: 'Choose the risk',
    body: 'Attacking raises your expected goals, but hands the same to the opponent. Defensive does the reverse. Balanced is the safe default; change it before kick-off, not during.',
  },
  {
    view: 'match',
    target: '[data-tour="kickoff"]',
    title: 'Kick off',
    body: 'The pre-match hub shows the opposition’s danger man and predicted XI. Kick off for live commentary on a running clock — or hit Sim to jump to full time. Ratings follow.',
  },
  {
    view: 'match',
    target: '[data-tour="rail"]',
    title: 'Never lose the plot',
    body: 'The right rail always shows your next fixture, league position and squad concerns. Play all 38 matchdays and the board will judge you in May. Good luck.',
  },
];

let active = null;

export const tourSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === 'done';
  } catch {
    return false;
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, 'done');
  } catch {
    /* ignore */
  }
};

export const tourRunning = () => Boolean(active);

/** Elements the tour can point at, resolved lazily after each render. */
function resolve(target) {
  if (!target) return null;
  const el = document.querySelector(target);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) return null;
  return rect;
}

function place(step) {
  const spot = document.querySelector('.tour__spot');
  const card = document.querySelector('.tour__card');
  if (!spot || !card) return;
  const rect = step.target ? resolve(step.target) : null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    spot.style.opacity = '0';
    spot.style.width = '0px';
    spot.style.height = '0px';
    card.style.left = `${Math.max(16, (vw - card.offsetWidth) / 2)}px`;
    card.style.top = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
    return;
  }

  spot.style.opacity = '1';
  spot.style.left = `${Math.max(4, rect.left - 8)}px`;
  spot.style.top = `${Math.max(4, rect.top - 8)}px`;
  spot.style.width = `${rect.width + 16}px`;
  spot.style.height = `${rect.height + 16}px`;

  const cardW = card.offsetWidth || 340;
  const cardH = card.offsetHeight || 180;
  const gap = 18;
  let left = rect.left + rect.width / 2 - cardW / 2;
  let top = rect.bottom + gap;
  if (top + cardH > vh - 16) top = rect.top - cardH - gap;
  if (top < 16) top = Math.min(vh - cardH - 16, Math.max(16, rect.bottom + gap));
  left = Math.max(16, Math.min(vw - cardW - 16, left));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function paint(store, actions) {
  const step = TOUR_STEPS[active.index];
  const card = document.querySelector('.tour__card');
  if (!card) return;
  card.innerHTML = `
    <div class="tour__step">Step ${active.index + 1} of ${TOUR_STEPS.length}</div>
    <h3 class="tour__title">${step.title}</h3>
    <p class="tour__body">${step.body}</p>
    <div class="tour__foot">
      <div class="tour__dots">${TOUR_STEPS.map((_, i) => `<i class="${i === active.index ? 'is-on' : ''}"></i>`).join('')}</div>
      ${active.index > 0 ? '<button class="btn btn--ghost btn--sm" data-tour-prev>Back</button>' : ''}
      <button class="btn btn--primary btn--sm" data-tour-next>${active.index === TOUR_STEPS.length - 1 ? 'Start managing' : 'Next'}</button>
      <button class="tour__skip" data-tour-end>Skip</button>
    </div>`;
  nextFrame(() => place(step));
}

function go(store, actions, index) {
  if (!active) return;
  const clamped = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
  const step = TOUR_STEPS[clamped];
  if (step.view && store.view !== step.view) {
    active.index = clamped;
    active.pending = true;
    actions.navigate(step.view);
    return;
  }
  active.index = clamped;
  active.pending = false;
  const el = step.target ? document.querySelector(step.target) : null;
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  nextFrame(() => paint(store, actions));
}

export function startTour(store, actions, startIndex = 0) {
  endTour(false);
  active = { index: startIndex, pending: false };
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour__spot"></div><div class="tour__card" role="dialog" aria-label="Guided tour"></div>';
  document.body.appendChild(root);

  root.addEventListener('click', (event) => {
    if (event.target.closest('[data-tour-next]')) {
      if (active.index >= TOUR_STEPS.length - 1) {
        endTour(true);
        return;
      }
      go(store, actions, active.index + 1);
    } else if (event.target.closest('[data-tour-prev]')) {
      go(store, actions, active.index - 1);
    } else if (event.target.closest('[data-tour-end]')) {
      endTour(true);
    }
  });

  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  go(store, actions, startIndex);
}

function reposition() {
  if (!active) return;
  place(TOUR_STEPS[active.index]);
}

/** Called after every app render so the spotlight follows the layout. */
export function tourAfterRender(store, actions) {
  if (!active) return;
  if (active.pending) {
    const step = TOUR_STEPS[active.index];
    if (step.view && store.view === step.view) {
      active.pending = false;
      setTimeout(() => go(store, actions, active.index), 60);
    }
    return;
  }
  nextFrame(() => paint(store, actions));
}

export function endTour(remember = true) {
  if (remember) markSeen();
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
  document.querySelector('.tour')?.remove();
  active = null;
}

export function handleTourKey(event) {
  if (!active) return false;
  if (event.key === 'Escape') {
    endTour(true);
    return true;
  }
  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    const next = document.querySelector('[data-tour-next]');
    if (next) next.click();
    return true;
  }
  if (event.key === 'ArrowLeft') {
    const prev = document.querySelector('[data-tour-prev]');
    if (prev) prev.click();
    return true;
  }
  return false;
}
