// tests/mine.test.js
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/jsdom-env.js';

installDom();
localStorage.setItem('vrdb.me', 'Alice');

// ── configurable mock state ───────────────────────────────────────────────────
let backlog = [];
let backlogError = null;
let openCount = 0;
let lastOpened = null;

const STATES = { WATCH_NOW: 'watch_now', WATCH_LATER: 'watch_later', WATCHED: 'watched', HELL_NO: 'hell_no', UNSEEN: 'unseen' };
const STATE_LABELS = { watch_now: 'Watch now', watch_later: 'Watch later', watched: 'Watched', hell_no: 'Hell no', unseen: 'Not set' };

mock.module('../lib/db.js', {
  namedExports: {
    listMyBacklog: async () => { if (backlogError) throw backlogError; return backlog; },
    STATES,
    STATE_LABELS,
  },
});
mock.module('../lib/tmdb-client.js', { namedExports: { posterUrl: (p) => (p ? `x${p}` : null) } });
mock.module('../lib/search-modal.js', { namedExports: { openSearchModal: () => { openCount++; } } });
mock.module('../lib/detail-sheet.js', { namedExports: { openDetailSheet: (e) => { lastOpened = e; } } });
mock.module('../lib/toast.js', { namedExports: { toast: () => {}, toastError: () => {} } });

const mine = await import('../lib/mine.js');
mine.initMine();

const listEl = document.getElementById('mine-list');
const emptyEl = document.getElementById('mine-empty-wrap');
const entry = (state, id, over = {}) => ({
  state, addedByMe: false, updatedAt: 't',
  title: { tmdb_id: id, media_type: 'movie', title: `T${id}`, poster_path: `/p${id}.jpg`, ...over },
});
const filterTab = (state) => document.querySelector(`#mine-filter [data-state="${state}"]`);

beforeEach(() => {
  backlog = [];
  backlogError = null;
  openCount = 0;
  lastOpened = null;
  // activeState is module-level and persists across tests; reset to the
  // default ("Now") filter so each test starts from a known state.
  const now = filterTab('watch_now');
  if (now.getAttribute('aria-selected') !== 'true') now.click();
});

test('empty backlog shows empty state, hides+clears list', async () => {
  await mine.refreshMine();
  assert.equal(emptyEl.classList.contains('hidden'), false);
  assert.equal(listEl.classList.contains('hidden'), true);
  assert.equal(listEl.innerHTML, '');
});

test('shows only the active filter, and switching filters re-renders', async () => {
  backlog = [
    entry('watched', 1),
    entry('watch_now', 2),
    entry('hell_no', 3),
    entry('watch_now', 5),
  ];
  await mine.refreshMine();

  // Default filter is "Now": only the two watch_now entries render.
  assert.equal(emptyEl.classList.contains('hidden'), true);
  assert.equal(listEl.classList.contains('hidden'), false);
  let cards = [...listEl.querySelectorAll('.backlog-card')];
  assert.deepEqual(cards.map((c) => c.dataset.state), ['watch_now', 'watch_now']);

  // Switch to "Watched": only the single watched entry renders.
  filterTab('watched').click();
  cards = [...listEl.querySelectorAll('.backlog-card')];
  assert.deepEqual(cards.map((c) => c.dataset.state), ['watched']);

  // Switch to "Later" (no entries): empty state shows, list is hidden.
  filterTab('watch_later').click();
  assert.equal(listEl.querySelectorAll('.backlog-card').length, 0);
  assert.equal(emptyEl.classList.contains('hidden'), false);
  assert.equal(listEl.classList.contains('hidden'), true);
});

test('card shows title, media label and poster (with emoji fallback)', async () => {
  backlog = [
    entry('watch_now', 1, { media_type: 'tv', title: 'Show', poster_path: null }),
    entry('watch_now', 2, { media_type: 'movie', title: 'Film', poster_path: '/p2.jpg' }),
  ];
  await mine.refreshMine();
  const cards = [...listEl.querySelectorAll('.backlog-card')];
  const tv = cards.find((c) => c.textContent.includes('Show'));
  const movie = cards.find((c) => c.textContent.includes('Film'));
  assert.match(tv.querySelector('.backlog-card__sub').textContent, /TV/);
  assert.ok(tv.querySelector('.backlog-card__poster--empty')); // emoji fallback
  assert.match(movie.querySelector('.backlog-card__sub').textContent, /Movie/);
  assert.ok(movie.querySelector('.backlog-card__poster img'));
});

test('clicking the FAB opens the search modal', () => {
  document.getElementById('mine-fab').click();
  assert.equal(openCount, 1);
});

test('clicking a backlog card opens the detail sheet with that entry', async () => {
  backlog = [entry('watch_now', 42)];
  await mine.refreshMine();
  listEl.querySelector('.backlog-card').click();
  assert.ok(lastOpened);
  assert.equal(lastOpened.title.tmdb_id, 42);
  assert.equal(lastOpened.state, 'watch_now');
});

test('load error shows connection message and hides the list', async () => {
  backlogError = new Error('network down');
  await mine.refreshMine();
  assert.match(emptyEl.querySelector('div:last-child').textContent, /Could not load your backlog/);
  assert.equal(emptyEl.classList.contains('hidden'), false);
  assert.equal(listEl.classList.contains('hidden'), true);
});

test('escapes HTML in titles', async () => {
  backlog = [entry('watch_now', 1, { title: '<b>x</b>' })];
  await mine.refreshMine();
  const titleEl = listEl.querySelector('.backlog-card__title');
  assert.equal(titleEl.textContent, '<b>x</b>');
  assert.equal(titleEl.querySelector('b'), null); // not parsed as markup
});
