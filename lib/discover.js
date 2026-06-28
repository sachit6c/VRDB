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

// When the stack drops to this many cards (or fewer), prefetch the next batch
// so swiping never hits an unexpected empty deck on paginated surfaces.
const PREFETCH_AT = 5;

let stackContainer, emptyEl, hintEl, actionsEl, subEl, tabsEl, refreshBtn;
let stack = null;
let currentSurface = 'trending';
let lastLoadedSurface = null;

// Pagination state for the in-progress stack. Reset on every (re)load.
let trendingPage = 1;
let seenIds = new Set();   // every id already pushed into the current stack
let exhausted = false;     // the current surface has no more pages to fetch
let fetchingMore = false;  // a prefetch is in flight (guards against double-fetch)
let loadMe = null;         // the user the current stack was loaded for

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

  // Pull down on the empty/end-of-deck screen to force a refresh — mirrors the
  // refresh button for thumbs that are already at the bottom of the screen.
  _attachPullToRefresh(emptyEl, () => refreshDiscover({ force: true }));

  _syncTabUI();
}

// Lightweight pull-to-refresh: drag the element down past a threshold and
// release to fire `onRefresh`. Drag distance is damped for a rubber-band feel.
const PULL_THRESHOLD = 70;

function _attachPullToRefresh(el, onRefresh) {
  if (!el) return;
  let startY = null;

  const reset = () => {
    startY = null;
    el.style.transform = '';
    el.style.transition = 'transform 0.2s ease';
  };

  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || el.classList.contains('hidden')) return;
    startY = e.touches[0].clientY;
    el.style.transition = '';
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) el.style.transform = `translateY(${Math.min(dy * 0.4, 56)}px)`;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = (e.changedTouches[0]?.clientY ?? startY) - startY;
    reset();
    if (dy > PULL_THRESHOLD) onRefresh();
  }, { passive: true });

  el.addEventListener('touchcancel', reset, { passive: true });
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
    // Reset pagination state for the fresh load.
    trendingPage = 1;
    seenIds = new Set();
    exhausted = false;
    fetchingMore = false;
    loadMe = me;

    const queue = await _loadQueue(currentSurface, me, { force });
    if (queue == null) return; // status already set inside _loadQueue
    if (queue.length === 0) {
      setStatus(`That's all for today. Check back tomorrow or hit refresh.`);
      return;
    }
    // Only trending paginates; the suggestion surfaces hand back a finite deck.
    exhausted = currentSurface !== 'trending';
    queue.forEach((item) => seenIds.add(item.id));
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
    // Walk forward through trending pages until we hit one with titles the user
    // hasn't already stated. Refresh restarts this walk from `trendingPage` (1),
    // so it skips past pages that are fully swiped instead of reporting an empty
    // deck — otherwise refresh just re-shows page 1 and surfaces nothing new.
    const statedIds = await getMyStatedIds(me);
    for (let walked = 0; walked < MAX_PAGE_WALK; walked++) {
      const trending = await getTrending({ window: 'week', page: trendingPage });
      if (trending.length === 0) return []; // ran off the end — truly exhausted
      const fresh = trending.filter((item) => !statedIds.has(item.id));
      if (fresh.length > 0) return fresh;
      trendingPage += 1;
    }
    return [];
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

// Fetch the next batch for the current surface and push it onto the live stack.
// No-ops once the surface is exhausted, a fetch is already running, or the
// surface/user has changed out from under us since the stack was built.
async function _maybePrefetch() {
  if (exhausted || fetchingMore || !stack) return;
  const surface = currentSurface;
  const me = loadMe;
  fetchingMore = true;
  try {
    const more = await _loadMore(surface, me);
    // Bail if the user switched surfaces (or reloaded) while we were fetching.
    if (surface !== currentSurface || me !== loadMe || !stack) return;
    if (!more || more.length === 0) {
      exhausted = true;
      return;
    }
    for (const item of more) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      stack.push(item);
    }
  } catch (err) {
    // A failed top-up isn't fatal — the user can keep swiping what's left.
    // Don't latch `exhausted`, so the next swipe retries.
    toastError('Could not load more — try again in a moment.', err);
  } finally {
    fetchingMore = false;
  }
}

// Returns the next page of items for a paginated surface, or [] if none.
// Skips past pages where everything is already stated or seen (rather than
// reporting them as exhausted), but caps the walk so a fully-seen tail can't
// spin through every remaining page in one prefetch.
const MAX_PAGE_WALK = 5;

async function _loadMore(surface, me) {
  if (surface !== 'trending') return [];
  const statedIds = await getMyStatedIds(me);
  for (let walked = 0; walked < MAX_PAGE_WALK; walked++) {
    trendingPage += 1;
    const trending = await getTrending({ window: 'week', page: trendingPage });
    if (trending.length === 0) return []; // ran off the end — truly exhausted
    const fresh = trending.filter((item) => !statedIds.has(item.id) && !seenIds.has(item.id));
    if (fresh.length > 0) return fresh;
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

  // Top up the deck before it runs dry. size() still counts the card being
  // swiped away, so the post-swipe count is size() - 1. Fire-and-forget: the
  // returned promise below only gates swipe persistence, not the prefetch.
  if (stack && stack.size() - 1 <= PREFETCH_AT) _maybePrefetch();

  const state = DIRECTION_TO_STATE[dir];
  // Return the promise so the card stack can restore the card if this fails.
  // Swiping in Discover is a proactive add to *my own* backlog, so flag
  // added_by_me=true. That's what surfaces the title on my partner's Partner
  // tab. (Reacting to a partner's card in lib/partner.js stays false.)
  return upsertTitle(item)
    .then(() => setMyState({ me, tmdbId: item.id, state, addedByMe: true }))
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
