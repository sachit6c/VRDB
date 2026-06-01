// lib/detail-sheet.js
// Bottom sheet for a title detail. Shows metadata + state action buttons + remove.

import { posterUrl } from './tmdb-client.js';
import { setMyState, removeMyState, STATES, STATE_LABELS } from './db.js';
import { getMe } from './identity.js';

let sheet, panelEl, closeBtn;
let currentEntry = null;
let onChangeCallback = null;

const ACTIONABLE_STATES = [
  STATES.WANT_NOW,
  STATES.WANT_LATER,
  STATES.WATCHED,
  STATES.HELL_NO,
];

export function initDetailSheet({ onChange } = {}) {
  sheet    = document.getElementById('detail-sheet');
  panelEl  = sheet.querySelector('.detail__panel');
  onChangeCallback = onChange;

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sheet.classList.contains('hidden')) close();
  });
}

export function openDetailSheet(entry) {
  currentEntry = entry;
  render();
  sheet.classList.remove('hidden');
}

function close() {
  sheet.classList.add('hidden');
  currentEntry = null;
}

function render() {
  const { title: t, state } = currentEntry;
  const img = posterUrl(t.poster_path, 'w500');
  const overview = t.overview || 'No description available.';
  const rating = t.rating ? Number(t.rating).toFixed(1) : null;
  const mediaLabel = t.media_type === 'tv' ? 'TV' : 'Movie';

  panelEl.innerHTML = `
    <button class="detail__close" type="button" aria-label="Close" title="Close">✕</button>
    <div class="detail__hero">
      <div class="detail__poster">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="detail__poster--empty">🎬</div>'}
      </div>
      <div class="detail__meta">
        <h2 class="detail__title">${escapeHtml(t.title)}</h2>
        <div class="detail__sub">
          ${mediaLabel}
          ${rating ? ` · ★ ${rating}` : ''}
        </div>
        <div class="detail__state">Current: <strong>${STATE_LABELS[state] ?? state}</strong></div>
      </div>
    </div>

    <p class="detail__overview">${escapeHtml(overview)}</p>

    <div class="detail__actions" role="group" aria-label="Set state">
      ${ACTIONABLE_STATES.map((s) => `
        <button type="button"
                class="detail__state-btn"
                data-state="${s}"
                aria-pressed="${s === state ? 'true' : 'false'}">
          ${STATE_LABELS[s]}
        </button>
      `).join('')}
    </div>

    <button class="detail__remove" type="button">Remove from my backlog</button>
  `;

  panelEl.querySelector('.detail__close').addEventListener('click', close);

  panelEl.querySelectorAll('.detail__state-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSetState(btn.dataset.state, btn));
  });

  panelEl.querySelector('.detail__remove').addEventListener('click', handleRemove);
}

async function handleSetState(newState, btn) {
  if (!currentEntry) return;
  const me = getMe();
  if (!me) return;
  if (newState === currentEntry.state) { close(); return; }

  btn.disabled = true;
  try {
    await setMyState({
      me,
      tmdbId: currentEntry.title.tmdb_id,
      state: newState,
      addedByMe: currentEntry.addedByMe,
    });
    onChangeCallback?.();
    close();
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    alert('Could not update. Try again.');
  }
}

async function handleRemove() {
  if (!currentEntry) return;
  const me = getMe();
  if (!me) return;
  if (!confirm(`Remove "${currentEntry.title.title}" from your backlog?`)) return;
  try {
    await removeMyState({ me, tmdbId: currentEntry.title.tmdb_id });
    onChangeCallback?.();
    close();
  } catch (err) {
    console.error(err);
    alert('Could not remove. Try again.');
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
