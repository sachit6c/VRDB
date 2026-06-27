// lib/detail-sheet.js
import { toast, toastError } from "./toast.js";
// Bottom sheet for a title detail. Shows metadata + state action buttons + remove.

import { posterUrl, getWatchProviders, providerLogoUrl } from './tmdb-client.js';
import { setMyState, removeMyState, STATES, STATE_LABELS } from './db.js';
import { getMe } from './identity.js';

let sheet, panelEl, closeBtn;
let currentEntry = null;
let onChangeCallback = null;

const ACTIONABLE_STATES = [
  STATES.WATCH_NOW,
  STATES.WATCH_LATER,
  STATES.WATCHED,
  STATES.HELL_NO,
];

export function initDetailSheet({ onChange } = {}) {
  sheet    = document.getElementById('detail-sheet');
  panelEl  = sheet.querySelector('.detail__panel');
  onChangeCallback = onChange;

  // Close on backdrop press. Use pointerdown, not click: on mobile the same
  // tap that opens the sheet fires a synthetic ("ghost") click ~300ms later at
  // the same coordinates, which would land on the backdrop and instantly close
  // the sheet. Ghost clicks are mouse-only and carry no pointerdown, so this is
  // immune to them.
  sheet.addEventListener('pointerdown', (e) => {
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

    <section class="detail__providers" aria-label="Where to watch">
      <div class="detail__providers-status">Loading streaming options…</div>
    </section>

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

  loadProviders(t);
}

async function loadProviders(t) {
  const section = panelEl.querySelector('.detail__providers');
  if (!section) return;
  try {
    const providers = await getWatchProviders({
      mediaType: t.media_type,
      id: t.tmdb_id,
    });
    if (!currentEntry || currentEntry.title.tmdb_id !== t.tmdb_id) return;
    section.innerHTML = renderProviders(providers);
  } catch (err) {
    console.warn('watch providers failed', err);
    section.innerHTML = '<div class="detail__providers-status">Streaming info unavailable.</div>';
  }
}

function renderProviders(p) {
  if (!p || (!p.flatrate.length && !p.rent.length && !p.buy.length)) {
    return '<div class="detail__providers-status">No US streaming providers listed.</div>';
  }
  const groups = [
    ['Stream', p.flatrate],
    ['Rent',   p.rent],
    ['Buy',    p.buy],
  ].filter(([, list]) => list && list.length);

  const linkHtml = p.link
    ? `<a class="detail__providers-link" href="${p.link}" target="_blank" rel="noopener">Open on TMDB →</a>`
    : '';

  return `
    <h3 class="detail__providers-heading">Where to watch <span class="detail__providers-region">(US)</span></h3>
    ${groups.map(([label, list]) => `
      <div class="detail__providers-group">
        <div class="detail__providers-label">${label}</div>
        <ul class="detail__providers-list">
          ${list.map((prov) => {
            const logo = providerLogoUrl(prov.logo_path, 'w92');
            const name = escapeHtml(prov.provider_name || '');
            return `<li class="detail__provider" title="${name}">
              ${logo ? `<img src="${logo}" alt="${name}" loading="lazy">` : `<span>${name}</span>`}
            </li>`;
          }).join('')}
        </ul>
      </div>
    `).join('')}
    <div class="detail__providers-attr">Data by JustWatch via TMDB. ${linkHtml}</div>
  `;
}

async function handleSetState(newState, btn) {
  if (!currentEntry) return;
  const me = getMe();
  if (!me) return;
  if (newState === currentEntry.state) {
    toast(`Already marked “${STATE_LABELS[newState] ?? newState}”.`);
    close();
    return;
  }

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
    toastError('Could not update.', err);
    btn.disabled = false;
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
    toastError('Could not remove.', err);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
