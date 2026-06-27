// lib/mine.js
import { toastError } from "./toast.js";
// Mine tab: my backlog filtered by state tab + FAB to open search-to-add.

import { listMyBacklog, STATES } from './db.js';
import { posterUrl } from './tmdb-client.js';
import { getMe } from './identity.js';
import { openSearchModal } from './search-modal.js';
import { openDetailSheet } from './detail-sheet.js';
import { sortItems, watchMinutes, loadSort, saveSort, populateSortSelect } from './sort.js';

let listEl, emptyEl, fab, sortEl;
let allEntries = [];
let activeState = STATES.WATCH_NOW;
let activeSort = loadSort('mine');

// Read sortable fields off a Mine entry ({ updatedAt, title: <cached row> }).
const MINE_ACCESSORS = {
  added:   (e) => e.updatedAt,
  title:   (e) => e.title.title,
  rating:  (e) => e.title.rating,
  release: (e) => e.title.release_date,
  runtime: (e) => watchMinutes(e.title),
};

export function initMine() {
  listEl  = document.getElementById('mine-list');
  emptyEl = document.getElementById('mine-empty-wrap');
  fab     = document.getElementById('mine-fab');
  sortEl  = document.getElementById('mine-sort');

  fab.addEventListener('click', openSearchModal);

  populateSortSelect(sortEl, activeSort);
  sortEl.addEventListener('change', () => {
    activeSort = sortEl.value;
    saveSort('mine', activeSort);
    renderFiltered();
  });

  document.querySelectorAll('#mine-filter .segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mine-filter .segmented__btn').forEach((b) =>
        b.setAttribute('aria-selected', 'false')
      );
      btn.setAttribute('aria-selected', 'true');
      activeState = btn.dataset.state;
      renderFiltered();
    });
  });
}

export async function refreshMine() {
  const me = getMe();
  if (!me) return;

  try {
    allEntries = await listMyBacklog(me);
  } catch (err) {
    toastError('Could not load your backlog.', err);
    emptyEl.querySelector('div:last-child').textContent =
      'Could not load your backlog. Check your connection.';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  renderFiltered();
}

function renderFiltered() {
  const filtered = allEntries.filter((e) => e.state === activeState);
  const items = sortItems(filtered, activeSort, MINE_ACCESSORS);

  if (items.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';
  items.forEach((entry) => listEl.appendChild(renderCard(entry)));
}

function renderCard(entry) {
  const t = entry.title;
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'backlog-card';
  card.dataset.state = entry.state;

  const img = posterUrl(t.poster_path, 'w154');
  card.innerHTML = `
    <div class="backlog-card__poster">
      ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="backlog-card__poster--empty">🎬</div>'}
    </div>
    <div class="backlog-card__info">
      <div class="backlog-card__title">${escapeHtml(t.title)}</div>
      <div class="backlog-card__sub">${t.media_type === 'tv' ? 'TV' : 'Movie'}</div>
    </div>
  `;
  card.addEventListener('click', () => openDetailSheet(entry));
  return card;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
