// lib/shared.js
import { toastError } from "./toast.js";
// Shared tab: titles both partners currently want to watch (state ∈ {watch_now, watch_later}).

import { supabase } from './supabase-client.js';
import { listShared, STATES, STATE_LABELS } from './db.js';
import { posterUrl } from './tmdb-client.js';
import { getMe, getPartner } from './identity.js';
import { openDetailSheet } from './detail-sheet.js';

let listEl, emptyEl;
let realtimeChannel = null;

export function initShared() {
  listEl  = document.getElementById('shared-list');
  emptyEl = document.getElementById('shared-empty-wrap');
  subscribeSharedRealtime();
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

  if (matches.length === 0) {
    emptyEl.querySelector('[data-msg]').textContent = 'No matches yet — swipe to find common ground!';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';

  for (const m of matches) {
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
