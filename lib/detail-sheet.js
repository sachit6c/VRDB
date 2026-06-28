// lib/detail-sheet.js
import { toast, toastError } from "./toast.js";
// Bottom sheet for a title detail. Shows metadata + state action buttons + remove.

import { posterUrl, getWatchProviders, providerLogoUrl, genresOf, getTitleDetails, spokenLanguagesOf, googleSearchUrl, formatVoteCount } from './tmdb-client.js';
import { upsertTitle, setMyState, removeMyState, STATES, STATE_LABELS } from './db.js';
import { getMe } from './identity.js';
import { openSheet, closeSheet, makeDismissable } from './sheet.js';

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

  // Swipe the panel down to dismiss. The panel scrolls internally, so the drag
  // only takes over when it's scrolled to the top (see makeDismissable).
  makeDismissable(sheet, panelEl, close, panelEl);
}

export function openDetailSheet(entry) {
  currentEntry = entry;
  render();
  openSheet(sheet);
}

function close() {
  closeSheet(sheet, panelEl, () => { currentEntry = null; });
}

function render() {
  const { title: t, state } = currentEntry;
  const img = posterUrl(t.poster_path, 'w500');
  const overview = t.overview || 'No description available.';
  const rating = t.rating ? Number(t.rating).toFixed(1) : null;
  const votes = formatVoteCount(t.rating_count);
  const mediaLabel = t.media_type === 'tv' ? 'TV' : 'Movie';
  const genres = genresOf(t, 4).join(', ');
  const dateValue = t.release_date || t.first_air_date || '';
  const releaseDate = formatReleaseDate(dateValue);
  const year = dateValue.slice(0, 4);
  const googleUrl = googleSearchUrl([t.title, year, t.media_type === 'tv' ? 'tv show' : 'movie'].filter(Boolean).join(' '));

  panelEl.innerHTML = `
    <div class="sheet__grabber" aria-hidden="true"></div>
    <button class="detail__close" type="button" aria-label="Close" title="Close">✕</button>
    <div class="detail__hero">
      <div class="detail__poster">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="detail__poster--empty">🎬</div>'}
      </div>
      <div class="detail__meta">
        <h2 class="detail__title">${escapeHtml(t.title)}</h2>
        <div class="detail__sub">
          ${mediaLabel}
          ${year ? ` · ${year}` : ''}
          ${rating ? ` · ★ ${rating}${votes ? ` (${votes})` : ''}` : ''}
        </div>
        <dl class="detail__facts">
          ${releaseDate ? `<div class="detail__fact"><dt>Released</dt><dd>${escapeHtml(releaseDate)}</dd></div>` : ''}
          <div class="detail__fact" data-fact="genre"><dt>Genre</dt><dd${genres ? '' : ' class="detail__fact--loading"'}>${genres ? escapeHtml(genres) : 'Loading…'}</dd></div>
          <div class="detail__fact" data-fact="languages"><dt>Audio</dt><dd class="detail__fact--loading">Loading…</dd></div>
        </dl>
        <a class="detail__google" href="${googleUrl}" target="_blank" rel="noopener">🔍 Search Google</a>
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
  loadExtraDetails(t);
}

// Fill the Genre (when the cached row lacked it) and Audio facts from a single
// TMDB detail fetch. A fact left in its "Loading…" state with no data is removed.
async function loadExtraDetails(t) {
  const genreFact = panelEl.querySelector('[data-fact="genre"]');
  const langFact  = panelEl.querySelector('[data-fact="languages"]');
  const dropLoading = (fact) => {
    if (fact?.querySelector('dd')?.classList.contains('detail__fact--loading')) fact.remove();
  };

  let details;
  try {
    details = await getTitleDetails({ mediaType: t.media_type, id: t.tmdb_id });
  } catch (err) {
    console.warn('title details failed', err);
    dropLoading(genreFact);
    dropLoading(langFact);
    return;
  }
  if (!currentEntry || currentEntry.title.tmdb_id !== t.tmdb_id) return;

  fillFact(genreFact, genresOf(details, 4).join(', '));
  fillFact(langFact, spokenLanguagesOf(details, 4).join(', '));
}

// Fill a still-loading fact with a value, or remove it if there's nothing to show.
// Leaves already-resolved facts (e.g. genre from the cached row) untouched.
function fillFact(fact, value) {
  if (!fact) return;
  const dd = fact.querySelector('dd');
  if (!dd.classList.contains('detail__fact--loading')) return;
  if (!value) { fact.remove(); return; }
  dd.textContent = value;
  dd.classList.remove('detail__fact--loading');
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
    // Cache the title first. A user_title_states row has a foreign key to
    // titles, so for a title opened from the Discover deck (which isn't cached
    // until it's swiped) setting a state directly would fail the constraint.
    // The swipe path upserts before setMyState for the same reason; upsert is
    // idempotent, so this is a no-op for already-cached titles.
    await upsertTitle(cachedToTmdbShape(currentEntry.title));
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

// Rebuild a TMDB-shaped object from the detail sheet's cached title so it can
// be fed to upsertTitle (which reads raw-TMDB field names). Runtime/genres are
// passed through when present (list/backlog rows have them) and left undefined
// otherwise (Discover-opened titles) so upsertTitle nulls them — matching the
// swipe path, which never carries those on a list item either.
function cachedToTmdbShape(t) {
  return {
    id:                 t.tmdb_id,
    media_type:         t.media_type,
    title:              t.title,
    poster_path:        t.poster_path,
    overview:           t.overview,
    vote_average:       t.rating,
    runtime:            t.runtime,
    number_of_episodes: t.episode_count,
    genres:             t.genres,
    release_date:       t.release_date,
    first_air_date:     t.first_air_date,
  };
}

// "2023-11-17" → "Nov 17, 2023". Falls back to the raw value if unparseable.
function formatReleaseDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
