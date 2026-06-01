// lib/mine.js
// Mine tab: list of my backlog + FAB to open the search-to-add modal.

import { listMyBacklog } from './db.js';
import { posterUrl } from './tmdb-client.js';
import { getMe } from './identity.js';
import { initSearchModal, openSearchModal } from './search-modal.js';

let listEl, emptyEl, fab;

export function initMine() {
  listEl  = document.getElementById('mine-list');
  emptyEl = document.getElementById('mine-empty-wrap');
  fab     = document.getElementById('mine-fab');

  initSearchModal({ onAdded: refreshMine });
  fab.addEventListener('click', openSearchModal);

  refreshMine();
}

export async function refreshMine() {
  const me = getMe();
  if (!me) return;

  let entries = [];
  try {
    entries = await listMyBacklog(me);
  } catch (err) {
    console.error('listMyBacklog failed', err);
    emptyEl.querySelector('div:last-child').textContent =
      'Could not load your backlog. Check your connection.';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  if (entries.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';

  entries.forEach((entry) => {
    const t = entry.title;
    const card = document.createElement('div');
    card.className = 'backlog-card';
    card.dataset.state = entry.state;

    const img = posterUrl(t.poster_path, 'w342');
    card.innerHTML = `
      <div class="backlog-card__poster">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="backlog-card__poster--empty">🎬</div>'}
      </div>
      <div class="backlog-card__title">${escapeHtml(t.title)}</div>
      <div class="backlog-card__sub">${t.media_type === 'tv' ? 'TV' : 'Movie'}${
        entry.state === 'watched' ? ' · Watched' : ''
      }</div>
    `;
    listEl.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
