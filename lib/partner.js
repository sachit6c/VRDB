// lib/partner.js
import { toastError } from "./toast.js";
// Partner screen: swipe on what your partner has added to *their* backlog.
// Subscribes to Supabase realtime so new partner adds appear live.

import { supabase } from './supabase-client.js';
import { listPartnerQueue, setMyState, STATES } from './db.js';
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

  refreshPartner();
  subscribePartnerRealtime();
}

export async function refreshPartner() {
  const me = getMe();
  const partner = getPartner();
  if (!me || !partner) return;

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
  if (!me) return;
  const state = DIRECTION_TO_STATE[dir];
  setMyState({ me, tmdbId: item.id, state, addedByMe: false })
    .catch((err) => toastError('Could not save swipe.', err));
}

function handleTap(item) {
  openDetailSheet({
    state: STATES.UNSEEN,
    addedByMe: false,
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
  debounceTimer = setTimeout(refreshPartner, 250);
}

function subscribePartnerRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel('vrdb-user-states')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_title_states' },
      () => scheduleRefresh(),
    )
    .subscribe();
}
