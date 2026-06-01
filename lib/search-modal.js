// lib/search-modal.js
// Search-to-add modal. Wraps a TMDB multi search and writes adds into Supabase.

import { searchMulti, posterUrl, yearOf, titleOf } from './tmdb-client.js';
import { upsertTitle, setMyState, getMyState } from './db.js';
import { getMe } from './identity.js';

const DEBOUNCE_MS = 300;

let modal, input, resultsEl, statusEl, closeBtn;
let debounceTimer = null;
let lastQuery = '';
let onAddedCallback = null;

export function initSearchModal({ onAdded } = {}) {
  modal     = document.getElementById('search-modal');
  input     = document.getElementById('search-input');
  resultsEl = document.getElementById('search-results');
  statusEl  = document.getElementById('search-status');
  closeBtn  = document.getElementById('search-close');
  onAddedCallback = onAdded;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(input.value), DEBOUNCE_MS);
  });

  closeBtn.addEventListener('click', closeSearchModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSearchModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeSearchModal();
  });
}

export function openSearchModal() {
  modal.classList.remove('hidden');
  input.value = '';
  resultsEl.innerHTML = '';
  statusEl.textContent = 'Type to search movies and TV.';
  setTimeout(() => input.focus(), 50);
}

export function closeSearchModal() {
  modal.classList.add('hidden');
  clearTimeout(debounceTimer);
}

async function runSearch(query) {
  const q = query.trim();
  if (q === lastQuery) return;
  lastQuery = q;

  if (!q) {
    resultsEl.innerHTML = '';
    statusEl.textContent = 'Type to search movies and TV.';
    return;
  }

  statusEl.textContent = 'Searching…';
  try {
    const results = await searchMulti(q);
    if (q !== lastQuery) return; // stale response
    renderResults(results);
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Search failed. Check your connection.';
  }
}

function renderResults(results) {
  resultsEl.innerHTML = '';
  if (results.length === 0) {
    statusEl.textContent = 'No matches.';
    return;
  }
  statusEl.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

  results.forEach((item) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'result-card';

    const img = posterUrl(item.poster_path, 'w185');
    const year = yearOf(item);
    const mediaLabel = item.media_type === 'tv' ? 'TV' : 'Movie';

    card.innerHTML = `
      <div class="result-card__poster">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="result-card__poster--empty">🎬</div>'}
      </div>
      <div class="result-card__meta">
        <div class="result-card__title">${escapeHtml(titleOf(item))}</div>
        <div class="result-card__sub">${mediaLabel}${year ? ' · ' + year : ''}</div>
      </div>
      <div class="result-card__add" aria-hidden="true">＋</div>
    `;

    card.addEventListener('click', () => handleAdd(card, item));
    resultsEl.appendChild(card);
  });
}

async function handleAdd(card, item) {
  const me = getMe();
  if (!me) return;
  card.disabled = true;
  card.classList.add('is-loading');

  try {
    const existing = await getMyState(me, item.id);
    if (existing) {
      card.classList.remove('is-loading');
      card.classList.add('is-added');
      card.querySelector('.result-card__add').textContent = '✓';
      return;
    }
    await upsertTitle(item);
    await setMyState({ me, tmdbId: item.id, state: 'want_later', addedByMe: true });
    card.classList.remove('is-loading');
    card.classList.add('is-added');
    card.querySelector('.result-card__add').textContent = '✓';
    onAddedCallback?.();
  } catch (err) {
    console.error(err);
    card.disabled = false;
    card.classList.remove('is-loading');
    statusEl.textContent = 'Add failed. Try again.';
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
