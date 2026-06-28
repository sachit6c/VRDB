// lib/shared.js
import { toastError } from "./toast.js";
// Shared tab: titles both partners currently want to watch (state ∈ {watch_now, watch_later}).

import { supabase } from './supabase-client.js';
import { listShared, STATES, STATE_LABELS } from './db.js';
import { posterUrl } from './tmdb-client.js';
import { getMe, getPartner } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';
import { sortItems, watchMinutes, loadSort, saveSort, populateSortSelect, formatSortDetail } from './sort.js';

let listEl, emptyEl, sortEl;
let realtimeChannel = null;
let lastMatches = [];
let activeSort = loadSort('shared');

// Read sortable fields off a Shared match ({ matchedAt, title: <cached row> }).
const SHARED_ACCESSORS = {
  added:   (m) => m.matchedAt,
  title:   (m) => m.title.title,
  rating:  (m) => m.title.rating,
  release: (m) => m.title.release_date,
  runtime: (m) => watchMinutes(m.title),
};

// "Watch now" outranks "watch later". Score = how many partners want it now
// (2 = both now, 1 = one now, 0 = both later). Higher bands sort first,
// above whatever the user's chosen sort produces within each band.
function priorityScore(m) {
  return (m.myState === STATES.WATCH_NOW ? 1 : 0) +
         (m.partnerState === STATES.WATCH_NOW ? 1 : 0);
}

export function initShared() {
  listEl  = document.getElementById('shared-list');
  emptyEl = document.getElementById('shared-empty-wrap');
  sortEl  = document.getElementById('shared-sort');
  subscribeSharedRealtime();

  populateSortSelect(sortEl, activeSort, 'Recently matched');
  sortEl.addEventListener('change', () => {
    activeSort = sortEl.value;
    saveSort('shared', activeSort);
    renderMatches();
  });
}

// Matches are created when *either* partner swipes, often on another device.
// Subscribe so the Shared tab updates live instead of only on reload. Debounced
// so a burst of edits triggers a single refresh.
let debounceTimer = null;
function subscribeSharedRealtime() {
  if (realtimeChannel) return;
  realtimeChannel = supabase
    .channel('vrdb-shared-states')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_title_states' },
      (payload) => {
        // Deployment-wide subscription; ignore rows that aren't ours.
        const name = payload.new?.user_name ?? payload.old?.user_name;
        const me = getMe(), partner = getPartner();
        if (name && name !== me && name !== partner) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(refreshShared, 250);
      },
    )
    .subscribe();
}

export async function refreshShared() {
  const me = getMe();
  const partner = getPartner();
  if (!me || !partner) return;

  let matches = [];
  try {
    matches = await listShared({ me, partner });
  } catch (err) {
    toastError('Could not load shared list.', err);
    emptyEl.querySelector('[data-msg]').textContent = 'Could not load. Check your connection.';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  lastMatches = matches;
  renderMatches();
}

function renderMatches() {
  if (lastMatches.length === 0) {
    emptyEl.querySelector('[data-msg]').textContent = 'No matches yet — swipe to find common ground!';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';

  // Sort by the active field first, then stable-sort by priority so "watch now"
  // items group to the top while keeping the chosen order within each band.
  const sorted = sortItems(lastMatches, activeSort, SHARED_ACCESSORS)
    .sort((a, b) => priorityScore(b) - priorityScore(a));
  for (const m of sorted) {
    listEl.appendChild(renderRow(m));
  }
}

function renderRow(match) {
  const t = match.title;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'shared-row';

  const img = posterUrl(t.poster_path, 'w185');
  const bothNow = match.myState === STATES.WATCH_NOW && match.partnerState === STATES.WATCH_NOW;
  const detail = formatSortDetail(activeSort, match, SHARED_ACCESSORS);

  row.innerHTML = `
    <div class="shared-row__poster">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="shared-row__poster--empty">🎬</div>'}
    </div>
    <div class="shared-row__meta">
      <div class="shared-row__title">${escapeHtml(t.title)}</div>
      <div class="shared-row__sub">
        ${t.media_type === 'tv' ? 'TV' : 'Movie'}
        ${bothNow ? ' · <span class="shared-row__badge">Both watch now</span>' : ''}
      </div>
    </div>
    ${detail ? `<div class="shared-row__detail">${escapeHtml(detail)}</div>` : ''}
    <div class="shared-row__chev">›</div>
  `;
  row.addEventListener('click', () => {
    openDetailSheet({
      state: match.myState,
      addedByMe: false,
      title: t,
    });
  });
  return row;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
