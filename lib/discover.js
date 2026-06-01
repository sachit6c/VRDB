// lib/discover.js
// Discover screen: trending card stack with 4-direction swipe gestures.
//
// Swipe mapping (PRD):
//   right → want_now    (love it, soon)
//   up    → want_later  (save for later)
//   down  → watched     (already seen)
//   left  → hell_no     (never)
// Tap card → open detail sheet.

import { getTrending, posterUrl, yearOf, titleOf } from './tmdb-client.js';
import { upsertTitle, setMyState, getMyStatedIds, STATES } from './db.js';
import { getMe } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';

const SWIPE_THRESHOLD = 90;      // px the card must travel to trigger an action
const FLING_DURATION  = 280;     // ms for the off-screen animation

const DIRECTION_TO_STATE = {
  right: STATES.WANT_NOW,
  up:    STATES.WANT_LATER,
  down:  STATES.WATCHED,
  left:  STATES.HELL_NO,
};

const DIRECTION_LABEL = {
  right: 'Want now',
  up:    'Want later',
  down:  'Watched',
  left:  'Hell no',
};

let stackEl, emptyEl, hintEl, actionsEl;
let queue = [];          // raw TMDB items not yet swiped
let isAnimating = false;

export function initDiscover() {
  stackEl   = document.getElementById('discover-stack');
  emptyEl   = document.getElementById('discover-empty');
  hintEl    = document.getElementById('discover-hint');
  actionsEl = document.getElementById('discover-actions');

  actionsEl.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.action;
      flingTop(dir);
    });
  });

  refreshDiscover();
}

export async function refreshDiscover() {
  const me = getMe();
  if (!me) return;

  setEmpty('Loading…');
  try {
    const [trending, statedIds] = await Promise.all([
      getTrending({ window: 'week' }),
      getMyStatedIds(me),
    ]);
    queue = trending.filter((item) => !statedIds.has(item.id));
    if (queue.length === 0) {
      setEmpty('No new titles right now. Check back later.');
      return;
    }
    setEmpty(null);
    render();
  } catch (err) {
    console.error('refreshDiscover failed', err);
    setEmpty('Could not load trending. Check your connection.');
  }
}

function setEmpty(msg) {
  if (msg) {
    emptyEl.textContent = msg;
    emptyEl.classList.remove('hidden');
    stackEl.classList.add('hidden');
    actionsEl.classList.add('hidden');
    hintEl.classList.add('hidden');
  } else {
    emptyEl.classList.add('hidden');
    stackEl.classList.remove('hidden');
    actionsEl.classList.remove('hidden');
    hintEl.classList.remove('hidden');
  }
}

function render() {
  stackEl.innerHTML = '';
  // Render up to 3 cards so the next one peeks behind.
  const visible = queue.slice(0, 3);
  // Render bottom-to-top so the first item is on top.
  for (let i = visible.length - 1; i >= 0; i--) {
    const item = visible[i];
    const isTop = i === 0;
    stackEl.appendChild(buildCard(item, i, isTop));
  }
}

function buildCard(item, depth, isTop) {
  const card = document.createElement('article');
  card.className = 'card';
  card.dataset.tmdbId = item.id;
  card.style.zIndex = String(100 - depth);
  card.style.transform = depthTransform(depth);

  const img = posterUrl(item.poster_path, 'w780');
  const year = yearOf(item);
  const mediaLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : null;

  card.innerHTML = `
    <div class="card__poster">
      ${img ? `<img src="${img}" alt="" draggable="false">` : '<div class="card__poster--empty">🎬</div>'}
      <div class="card__overlay"></div>
      <div class="card__decision" data-decision></div>
    </div>
    <div class="card__meta">
      <h3 class="card__title">${escapeHtml(titleOf(item))}</h3>
      <div class="card__sub">
        ${mediaLabel}${year ? ' · ' + year : ''}${rating ? ' · ★ ' + rating : ''}
      </div>
      ${item.overview ? `<p class="card__overview">${escapeHtml(item.overview)}</p>` : ''}
    </div>
  `;

  if (isTop) attachGestures(card, item);
  return card;
}

function depthTransform(depth) {
  // Subtle stacking: lower cards are slightly scaled down and offset.
  const scale = 1 - depth * 0.04;
  const offsetY = depth * 8;
  return `translate3d(0, ${offsetY}px, 0) scale(${scale})`;
}

function attachGestures(card, item) {
  let startX = 0, startY = 0;
  let dx = 0, dy = 0;
  let dragging = false;
  let pointerId = null;
  let startTime = 0;

  const decisionEl = card.querySelector('[data-decision]');

  card.addEventListener('pointerdown', (e) => {
    if (isAnimating) return;
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startTime = performance.now();
    dx = 0; dy = 0;
    card.setPointerCapture(pointerId);
    card.classList.add('is-dragging');
  });

  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    dy = e.clientY - startY;
    const rot = dx / 18;
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;
    updateDecisionHint(decisionEl, dx, dy);
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    card.releasePointerCapture?.(pointerId);
    card.classList.remove('is-dragging');
    decisionEl.textContent = '';
    decisionEl.dataset.dir = '';

    const elapsed = performance.now() - startTime;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    const isTap = absX < 6 && absY < 6 && elapsed < 250;

    if (isTap) {
      card.style.transform = depthTransform(0);
      handleTap(item);
      return;
    }

    const dir = decideDirection(dx, dy);
    if (dir) {
      commitSwipe(card, item, dir);
    } else {
      // Snap back
      card.style.transition = 'transform 0.18s ease-out';
      card.style.transform = depthTransform(0);
      setTimeout(() => { card.style.transition = ''; }, 200);
    }
  };

  card.addEventListener('pointerup', finish);
  card.addEventListener('pointercancel', finish);
}

function updateDecisionHint(el, dx, dy) {
  const dir = decideDirection(dx, dy, SWIPE_THRESHOLD * 0.5);
  if (!dir) {
    el.textContent = '';
    el.dataset.dir = '';
    return;
  }
  el.dataset.dir = dir;
  el.textContent = DIRECTION_LABEL[dir];
}

function decideDirection(dx, dy, threshold = SWIPE_THRESHOLD) {
  const absX = Math.abs(dx), absY = Math.abs(dy);
  if (absX < threshold && absY < threshold) return null;
  if (absX > absY) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function flingTop(dir) {
  const top = stackEl.querySelector('.card');
  if (!top || isAnimating) return;
  const item = queue[0];
  if (!item) return;
  commitSwipe(top, item, dir);
}

async function commitSwipe(card, item, dir) {
  if (isAnimating) return;
  isAnimating = true;

  const me = getMe();
  if (!me) { isAnimating = false; return; }

  // Animate off-screen in chosen direction.
  const w = window.innerWidth + 200;
  const h = window.innerHeight + 200;
  const targets = {
    right: `translate3d(${w}px, ${0}px, 0) rotate(20deg)`,
    left:  `translate3d(${-w}px, ${0}px, 0) rotate(-20deg)`,
    up:    `translate3d(0, ${-h}px, 0)`,
    down:  `translate3d(0, ${h}px, 0)`,
  };
  card.style.transition = `transform ${FLING_DURATION}ms cubic-bezier(.2,.7,.3,1), opacity ${FLING_DURATION}ms`;
  card.style.transform = targets[dir];
  card.style.opacity = '0';

  // Persist in background.
  const state = DIRECTION_TO_STATE[dir];
  upsertTitle(item)
    .then(() => setMyState({ me, tmdbId: item.id, state, addedByMe: false }))
    .catch((err) => console.error('persist swipe failed', err));

  setTimeout(() => {
    queue.shift();
    if (queue.length === 0) {
      setEmpty('That\'s all for now. Check back later.');
    } else {
      render();
    }
    isAnimating = false;
  }, FLING_DURATION);
}

function handleTap(item) {
  // Open detail sheet using a synthetic entry — no state yet.
  const entry = {
    state: STATES.UNSEEN,
    addedByMe: false,
    title: {
      tmdb_id:     item.id,
      media_type:  item.media_type,
      title:       titleOf(item),
      poster_path: item.poster_path,
      overview:    item.overview,
      rating:      item.vote_average,
    },
  };
  openDetailSheet(entry);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
