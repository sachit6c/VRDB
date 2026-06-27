// lib/discover.js
// Discover screen: 4 surfaces (Trending / For us / For you / Surprise me).
// Card-stack swipes persist into user_title_states; suggestions cached daily in suggestions_cache.

import { getTrending, titleOf } from './tmdb-client.js';
import { upsertTitle, setMyState, getMyState, getMyStatedIds, countMyStated, STATES } from './db.js';
import { getForYou, getForUs, getSurpriseMe } from './suggestions.js';
import { getMe, getPartner } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';
import { mountCardStack } from './card-stack.js';
import { toastError } from './toast.js';

const DIRECTION_TO_STATE = {
  right: STATES.WATCH_NOW,
  up:    STATES.WATCH_LATER,
  down:  STATES.WATCHED,
  left:  STATES.HELL_NO,
};

const SUB_LABEL = {
  trending: 'Trending this week',
  for_us:   'Picks for both of you',
  for_you:  'Picks just for you',
  surprise: 'A genre you rarely pick',
};

const COLD_START_MIN = 10;

let stackContainer, emptyEl, hintEl, actionsEl, subEl, tabsEl, refreshBtn;
let stack = null;
let currentSurface = 'trending';
let lastLoadedSurface = null;

export function initDiscover() {
  stackContainer = document.getElementById('discover-stack');
  emptyEl    = document.getElementById('discover-empty');
  hintEl     = document.getElementById('discover-hint');
  actionsEl  = document.getElementById('discover-actions');
  subEl      = document.getElementById('discover-sub');
  tabsEl     = document.querySelector('.segmented--tabs');
  refreshBtn = document.getElementById('discover-refresh');

  actionsEl.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => stack?.fling(btn.dataset.action));
  });

  tabsEl?.querySelectorAll('[data-surface]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.surface === currentSurface) return;
      currentSurface = btn.dataset.surface;
      _syncTabUI();
      refreshDiscover();
    });
  });

  refreshBtn?.addEventListener('click', () => refreshDiscover({ force: true }));

  _syncTabUI();
}

export async function refreshDiscover({ force = false } = {}) {
  const me = getMe();
  if (!me) return;

  // Returning to a surface that's already loaded: keep the in-progress stack so
  // the user doesn't lose their place (and we skip a redundant fetch).
  if (!force && stack && stack.size() > 0 && lastLoadedSurface === currentSurface) return;

  if (subEl) subEl.textContent = SUB_LABEL[currentSurface];
  setStatus('Loading…');

  try {
    const queue = await _loadQueue(currentSurface, me, { force });
    if (queue == null) return; // status already set inside _loadQueue
    if (queue.length === 0) {
      setStatus(`That's all for today. Check back tomorrow or hit refresh.`);
      return;
    }
    setStatus(null);
    if (stack) stack.destroy();
    stack = mountCardStack({
      containerEl: stackContainer,
      queue,
      onSwipe: handleSwipe,
      onTap:   handleTap,
      onEmpty: () => setStatus(`That's all for today. Check back tomorrow or hit refresh.`),
    });
    lastLoadedSurface = currentSurface;
  } catch (err) {
    toastError('Could not load suggestions.', err);
    setStatus('Could not load suggestions. Check your connection.');
  }
}

async function _loadQueue(surface, me, { force }) {
  if (surface === 'trending') {
    const [trending, statedIds] = await Promise.all([
      getTrending({ window: 'week' }),
      getMyStatedIds(me),
    ]);
    return trending.filter((item) => !statedIds.has(item.id));
  }

  if (surface === 'for_you' || surface === 'for_us') {
    const stated = await countMyStated(me);
    if (stated < COLD_START_MIN) {
      const need = COLD_START_MIN - stated;
      setStatus(`Rate ${need} more title${need === 1 ? '' : 's'} to unlock personalized picks.`);
      return null;
    }
    const partner = getPartner();
    if (surface === 'for_us' && partner) {
      const { items } = await getForUs({ refresh: force });
      return items;
    }
    const { items } = await getForYou({ refresh: force });
    return items;
  }

  if (surface === 'surprise') {
    const { items } = await getSurpriseMe({ refresh: force });
    return items;
  }
  return [];
}

function _syncTabUI() {
  tabsEl?.querySelectorAll('[data-surface]').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.surface === currentSurface ? 'true' : 'false');
  });
}

function setStatus(msg) {
  if (msg) {
    if (msg === 'Loading…') {
      stackContainer.innerHTML = '<div class="skeleton skeleton-card"></div>';
      stackContainer.classList.remove('hidden');
      emptyEl.classList.add('hidden');
      actionsEl.classList.add('hidden');
      hintEl.classList.add('hidden');
      return;
    }
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
  if (!me) return Promise.resolve();
  const state = DIRECTION_TO_STATE[dir];
  // Return the promise so the card stack can restore the card if this fails.
  return upsertTitle(item)
    .then(() => setMyState({ me, tmdbId: item.id, state, addedByMe: false }))
    .catch((err) => {
      toastError('Could not save your swipe — card restored.', err);
      throw err;
    });
}

async function handleTap(item) {
  const me = getMe();
  let existing = null;
  try {
    if (me) existing = await getMyState(me, item.id);
  } catch { /* fall back to unseen */ }
  openDetailSheet({
    state: existing?.state ?? STATES.UNSEEN,
    addedByMe: existing?.added_by_me ?? false,
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
