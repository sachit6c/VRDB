// lib/mine.js
import { toastError } from "./toast.js";
// Mine tab: my backlog grouped by state + FAB to open search-to-add.

import { listMyBacklog, STATES, STATE_LABELS } from './db.js';
import { posterUrl } from './tmdb-client.js';
import { getMe } from './identity.js';
import { openSearchModal } from './search-modal.js';
import { openDetailSheet } from './detail-sheet.js';

const SECTION_ORDER = [STATES.WATCH_NOW, STATES.WATCH_LATER, STATES.WATCHED];

let listEl, emptyEl, fab;

export function initMine() {
  listEl  = document.getElementById('mine-list');
  emptyEl = document.getElementById('mine-empty-wrap');
  fab     = document.getElementById('mine-fab');

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
    toastError('Could not load your backlog.', err);
    emptyEl.querySelector('div:last-child').textContent =
      'Could not load your backlog. Check your connection.';
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    return;
  }

  if (entries.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');
  listEl.innerHTML = '';

  const grouped = new Map(SECTION_ORDER.map((s) => [s, []]));
  for (const entry of entries) {
    if (grouped.has(entry.state)) grouped.get(entry.state).push(entry);
  }

  for (const state of SECTION_ORDER) {
    const items = grouped.get(state);
    if (items.length === 0) continue;
    listEl.appendChild(renderSection(state, items));
  }
}

function renderSection(state, items) {
  const section = document.createElement('section');
  section.className = 'backlog-section';
  section.dataset.state = state;

  const header = document.createElement('h2');
  header.className = 'backlog-section__header';
  header.innerHTML = `
    <span>${STATE_LABELS[state]}</span>
    <span class="backlog-section__count">${items.length}</span>
  `;
  section.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'backlog-grid';
  items.forEach((entry) => grid.appendChild(renderCard(entry)));
  section.appendChild(grid);

  return section;
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
