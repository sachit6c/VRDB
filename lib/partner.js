// lib/partner.js
import { toastError } from "./toast.js";
// Partner screen: swipe on what your partner has added to *their* backlog.
// Subscribes to Supabase realtime so new partner adds appear live.

import { supabase } from './supabase-client.js';
import { listPartnerQueue, setMyState, getMyState, STATES } from './db.js';
import { getMe, getPartner } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';
import { mountCardStack } from './card-stack.js';
import { titleOf } from './tmdb-client.js';

const DIRECTION_TO_STATE = {
  right: STATES.WATCH_NOW,
  up:    STATES.WATCH_LATER,
  down:  STATES.WATCHED,
  left:  STATES.HELL_NO,
};

let stackContainer, emptyEl, hintEl, actionsEl, partnerLabelEl;
let stack = null;
let realtimeChannel = null;

export function initPartner() {
  stackContainer = document.getElementById('partner-stack');
  emptyEl        = document.getElementById('partner-empty-wrap');
  hintEl         = document.getElementById('partner-hint');
  actionsEl      = document.getElementById('partner-actions');
  partnerLabelEl = document.getElementById('partner-label');

  const partner = getPartner();
  if (partnerLabelEl && partner) partnerLabelEl.textContent = `What ${partner} added`;

  actionsEl.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => stack?.fling(btn.dataset.action));
  });

  subscribePartnerRealtime();
}

export async function refreshPartner({ force = false } = {}) {
  const me = getMe();
  const partner = getPartner();
  if (!me || !partner) return;

  // On plain tab re-entry, keep the existing stack so the user keeps their place.
  // Realtime updates and explicit refreshes pass force:true to rebuild.
  if (!force && stack && stack.size() > 0) return;

  let queue = [];
  try {
    queue = await listPartnerQueue({ me, partner });
  } catch (err) {
    toastError('Could not load partner queue.', err);
    setStatus('Could not load. Check your connection.');
    return;
  }
  if (queue.length === 0) {
    setStatus(`${partner} hasn't added anything new for you yet.`);
    return;
  }
  setStatus(null);
  if (stack) stack.destroy();
  stack = mountCardStack({
    containerEl: stackContainer,
    queue,
    onSwipe: handleSwipe,
    onTap:   handleTap,
    onEmpty: () => setStatus(`All caught up — wait for ${partner} to add more.`),
  });
}

function setStatus(msg) {
  if (msg) {
    emptyEl.querySelector('[data-msg]').textContent = msg;
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
  return setMyState({ me, tmdbId: item.id, state, addedByMe: false })
    .catch((err) => {
      toastError('Could not save swipe — card restored.', err);
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
    title: item._cachedTitle ?? {
      tmdb_id:     item.id,
      media_type:  item.media_type,
      title:       titleOf(item),
      poster_path: item.poster_path,
      overview:    item.overview,
      rating:      item.vote_average,
    },
  });
}

// ── Realtime ────────────────────────────────────────────────
// Refresh the partner queue whenever either side's state rows change.
// Debounced so a burst of edits only triggers one refresh.
let debounceTimer = null;
function scheduleRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => refreshPartner({ force: true }), 250);
}

function subscribePartnerRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel('vrdb-user-states')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_title_states' },
      (payload) => {
        // The subscription is deployment-wide; only react to rows for this pair
        // so other users' swipes don't trigger needless refetches.
        const name = payload.new?.user_name ?? payload.old?.user_name;
        const me = getMe(), partner = getPartner();
        if (name && name !== me && name !== partner) return;
        scheduleRefresh();
      },
    )
    .subscribe();
}
