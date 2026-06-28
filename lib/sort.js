// lib/sort.js
// Shared sort options + comparators for the list views (Mine, Shared, Partner).
// Sorting is client-side over already-loaded data, so switching sort never refetches.

export const SORT_OPTIONS = Object.freeze([
  { id: 'recent',  label: 'Recently added' }, // default
  { id: 'title',   label: 'A–Z' },
  { id: 'rating',  label: 'Rating' },
  { id: 'release', label: 'Release date' },
  { id: 'runtime', label: 'Time to watch' },
]);

const DEFAULT_SORT = 'recent';
const VALID_IDS = new Set(SORT_OPTIONS.map((o) => o.id));

// Comparators always push missing values to the END (so unrated/undated items
// never pollute the top), and fall back to a stable A–Z tiebreak.
function byTitle(a, b, accessors) {
  return String(accessors.title(a) ?? '').localeCompare(
    String(accessors.title(b) ?? ''),
    undefined,
    { sensitivity: 'base' },
  );
}

// Generic "missing sinks to the end" wrapper for value-based comparators.
function nullsLast(va, vb, compare, a, b, accessors) {
  const aMissing = va == null || va === '';
  const bMissing = vb == null || vb === '';
  if (aMissing && bMissing) return byTitle(a, b, accessors);
  if (aMissing) return 1;
  if (bMissing) return -1;
  const c = compare(va, vb);
  return c !== 0 ? c : byTitle(a, b, accessors);
}

const COMPARATORS = {
  recent: (a, b, ac) =>
    nullsLast(ac.added(a), ac.added(b), (x, y) => (x < y ? 1 : x > y ? -1 : 0), a, b, ac),

  title: (a, b, ac) => byTitle(a, b, ac),

  rating: (a, b, ac) =>
    nullsLast(ac.rating(a), ac.rating(b), (x, y) => Number(y) - Number(x), a, b, ac),

  release: (a, b, ac) =>
    nullsLast(ac.release(a), ac.release(b), (x, y) => (x < y ? 1 : x > y ? -1 : 0), a, b, ac),

  // "Time to watch" — shortest first.
  runtime: (a, b, ac) =>
    nullsLast(ac.runtime(a), ac.runtime(b), (x, y) => Number(x) - Number(y), a, b, ac),
};

// Sort a copy of `items` by `sortId`. `accessors` maps each field to a getter:
//   { added, title, rating, release, runtime } : item -> value
export function sortItems(items, sortId, accessors) {
  const cmp = COMPARATORS[normalizeSort(sortId)] ?? COMPARATORS[DEFAULT_SORT];
  return [...items].sort((a, b) => cmp(a, b, accessors));
}

// "Time to watch" estimate in minutes from a cached title row.
// Movies use runtime; TV is approximated as episode_count * 30 min.
export function watchMinutes(title) {
  if (!title) return null;
  if (title.media_type === 'tv') {
    return title.episode_count ? title.episode_count * 30 : null;
  }
  return title.runtime ?? null;
}

export function normalizeSort(sortId) {
  return VALID_IDS.has(sortId) ? sortId : DEFAULT_SORT;
}

// Short, right-aligned label for the field a list is currently sorted by, so the
// value driving the order is visible on each row. Returns '' when the value is
// missing or when the sort needs no extra detail (A–Z — the title says it all).
export function formatSortDetail(sortId, item, accessors) {
  switch (normalizeSort(sortId)) {
    case 'rating': {
      const v = accessors.rating(item);
      return v == null ? '' : `★ ${Number(v).toFixed(1)}`;
    }
    case 'release': {
      const year = String(accessors.release(item) ?? '').slice(0, 4);
      return /^\d{4}$/.test(year) ? year : '';
    }
    case 'runtime':
      return formatMinutes(accessors.runtime(item));
    case 'recent':
      return formatDate(accessors.added(item));
    default:
      return '';
  }
}

function formatMinutes(mins) {
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return '';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return `${h}h ${r}m`;
  return h ? `${h}h` : `${r}m`;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Persistence (per-list, localStorage) ────────────────────
export function loadSort(listKey) {
  try {
    return normalizeSort(localStorage.getItem(`vrdb.sort.${listKey}`));
  } catch {
    return DEFAULT_SORT;
  }
}

export function saveSort(listKey, sortId) {
  try {
    localStorage.setItem(`vrdb.sort.${listKey}`, normalizeSort(sortId));
  } catch { /* private mode / quota — non-fatal */ }
}

// Build the <option> list for a sort <select>. `recentLabel` overrides the
// default "Recently added" wording (e.g. "Recently matched" for Shared).
export function populateSortSelect(selectEl, current, recentLabel) {
  selectEl.innerHTML = '';
  for (const opt of SORT_OPTIONS) {
    const el = document.createElement('option');
    el.value = opt.id;
    el.textContent = opt.id === 'recent' && recentLabel ? recentLabel : opt.label;
    if (opt.id === current) el.selected = true;
    selectEl.appendChild(el);
  }
}
