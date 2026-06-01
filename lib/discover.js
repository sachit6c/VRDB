// lib/discover.js
// Discover screen: trending card stack (Phase 4 + 5).
// Subtabs (For Us / For You / Surprise Me) come in Phase 7.

import { getTrending, titleOf } from './tmdb-client.js';
import { upsertTitle, setMyState, getMyStatedIds, STATES } from './db.js';
import { getMe } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';
import { mountCardStack } from './card-stack.js';

const DIRECTION_TO_STATE = {
  right: STATES.WATCH_NOW,
  up:    STATES.WATCH_LATER,
  down:  STATES.WATCHED,
  left:  STATES.HELL_NO,
};

let stackContainer, emptyEl, hintEl, actionsEl;
let stack = null;

export function initDiscover() {
  stackContainer = document.getElementById('discover-stack');
  emptyEl   = document.getElementById('discover-empty');
  hintEl    = document.getElementById('discover-hint');
  actionsEl = document.getElementById('discover-actions');

  actionsEl.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => stack?.fling(btn.dataset.action));
  });

  refreshDiscover();
}

export async function refreshDiscover() {
  const me = getMe();
  if (!me) return;

  setStatus('Loading…');
  try {
    const [trending, statedIds] = await Promise.all([
      getTrending({ window: 'week' }),
      getMyStatedIds(me),
    ]);
    const queue = trending.filter((item) => !statedIds.has(item.id));
    if (queue.length === 0) {
      setStatus('No new titles right now. Check back later.');
      return;
    }
    setStatus(null);
    if (stack) stack.destroy();
    stack = mountCardStack({
      containerEl: stackContainer,
      queue,
      onSwipe: handleSwipe,
      onTap:   handleTap,
      onEmpty: () => setStatus('That\'s all for now. Check back later.'),
    });
  } catch (err) {
    console.error('refreshDiscover failed', err);
    setStatus('Could not load trending. Check your connection.');
  }
}

function setStatus(msg) {
  if (msg) {
    emptyEl.textContent = msg;
    emptyEl.classList.remove('hidden');
    stackContainer.classList.add('hidden');
    actionsEl.classList.add('hidden');
    hintEl.classList.add('hidden');
  } else {
    emptyEl.classList.add('hidden');
    stackContainer.classList.remove('hidden');
    actionsEl.classList.remove('hidden');
    hintEl.classList.remove('hidden');
  }
}

function handleSwipe(item, dir) {
  const me = getMe();
  if (!me) return;
  const state = DIRECTION_TO_STATE[dir];
  upsertTitle(item)
    .then(() => setMyState({ me, tmdbId: item.id, state, addedByMe: false }))
    .catch((err) => console.error('persist swipe failed', err));
}

function handleTap(item) {
  openDetailSheet({
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
  });
}
