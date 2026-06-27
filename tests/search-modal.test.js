// tests/search-modal.test.js
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/jsdom-env.js';

installDom();
localStorage.setItem('vrdb.me', 'Alice');

// ── Configurable mock state ──────────────────────────────────────────────────
let searchResults = [];
let searchThrows = false;
let existingState = null;
let setMyStateThrows = false;
let setMyStateCalls = [];
let upsertCalls = [];
let onAddedCount = 0;
let toastErrors = [];

mock.module('../lib/tmdb-client.js', {
  namedExports: {
    searchMulti: async (q) => { if (searchThrows) throw new Error('net'); return searchResults; },
    posterUrl: (p) => (p ? `x${p}` : null),
    yearOf: () => '2020',
    titleOf: (i) => i.title || i.name || '(untitled)',
  },
});
mock.module('../lib/db.js', {
  namedExports: {
    upsertTitle: async (i) => { upsertCalls.push(i); },
    setMyState: async (a) => { if (setMyStateThrows) throw new Error('add fail'); setMyStateCalls.push(a); },
    getMyState: async () => existingState,
  },
});
mock.module('../lib/toast.js', {
  namedExports: { toast: () => {}, toastError: (m) => { toastErrors.push(m); } },
});

const sm = await import('../lib/search-modal.js');
const onAdded = () => { onAddedCount++; };
sm.initSearchModal({ onAdded });

const $ = (id) => document.getElementById(id);
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

// Type into the search box and let the debounce + async search settle.
async function type(q) {
  const input = $('search-input');
  input.value = q;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  mock.timers.tick(300);
  await flush();
}

beforeEach(() => {
  searchResults = [];
  searchThrows = false;
  existingState = null;
  setMyStateThrows = false;
  setMyStateCalls = [];
  upsertCalls = [];
  onAddedCount = 0;
  toastErrors = [];
  mock.timers.enable({ apis: ['setTimeout'] });
});
afterEach(() => mock.timers.reset());

// ── open / close ─────────────────────────────────────────────────────────────
test('openSearchModal reveals the modal and resets status', () => {
  $('search-modal').classList.add('hidden');
  sm.openSearchModal();
  assert.equal($('search-modal').classList.contains('hidden'), false);
  assert.equal($('search-status').textContent, 'Type to search movies and TV.');
  assert.equal($('search-input').value, '');
});

test('close button hides the modal', () => {
  sm.openSearchModal();
  $('search-close').click();
  assert.ok($('search-modal').classList.contains('hidden'));
});

test('clicking the backdrop closes the modal', () => {
  sm.openSearchModal();
  $('search-modal').dispatchEvent(new Event('click', { bubbles: true })); // target === modal
  assert.ok($('search-modal').classList.contains('hidden'));
});

test('Escape closes the modal when open', () => {
  sm.openSearchModal();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  assert.ok($('search-modal').classList.contains('hidden'));
});

// ── search ───────────────────────────────────────────────────────────────────
test('typing runs a debounced search and renders result cards', async () => {
  searchResults = [
    { id: 1, media_type: 'movie', title: 'The Matrix', poster_path: '/m.jpg' },
    { id: 2, media_type: 'tv', name: 'Severance', poster_path: null },
  ];
  await type('matrix');
  const cards = $('search-results').querySelectorAll('.result-card');
  assert.equal(cards.length, 2);
  assert.equal(cards[0].querySelector('.result-card__title').textContent, 'The Matrix');
  assert.match(cards[0].querySelector('.result-card__sub').textContent, /Movie · 2020/);
  assert.match(cards[1].querySelector('.result-card__sub').textContent, /TV/);
  assert.equal($('search-status').textContent, '2 results');
});

test('single result uses singular label', async () => {
  searchResults = [{ id: 3, media_type: 'movie', title: 'Solo' }];
  await type('solo');
  assert.equal($('search-status').textContent, '1 result');
});

test('empty query clears results and shows the prompt', async () => {
  searchResults = [{ id: 4, media_type: 'movie', title: 'X' }];
  await type('something');
  await type('   '); // trims to empty
  assert.equal($('search-results').innerHTML, '');
  assert.equal($('search-status').textContent, 'Type to search movies and TV.');
});

test('no matches shows "No matches."', async () => {
  searchResults = [];
  await type('zzzznomatch');
  assert.equal($('search-status').textContent, 'No matches.');
});

test('search failure shows an error status and toasts', async () => {
  searchThrows = true;
  await type('boomquery');
  assert.equal($('search-status').textContent, 'Search failed. Check your connection.');
  assert.ok(toastErrors.length >= 1);
});

// ── add ──────────────────────────────────────────────────────────────────────
test('adding a fresh result upserts, sets watch_later, marks ✓ and calls onAdded', async () => {
  searchResults = [{ id: 10, media_type: 'movie', title: 'Add Me', poster_path: '/a.jpg' }];
  await type('addfresh');
  const card = $('search-results').querySelector('.result-card');
  card.click();
  await flush();
  assert.equal(upsertCalls.length, 1);
  assert.equal(setMyStateCalls.length, 1);
  assert.equal(setMyStateCalls[0].state, 'watch_later');
  assert.equal(setMyStateCalls[0].addedByMe, true);
  assert.equal(onAddedCount, 1);
  assert.equal(card.querySelector('.result-card__add').textContent, '✓');
  assert.ok(card.classList.contains('is-added'));
});

test('adding a result already in the backlog marks ✓ without writing state', async () => {
  existingState = { state: 'watch_now', added_by_me: false };
  searchResults = [{ id: 11, media_type: 'tv', name: 'Already', poster_path: null }];
  await type('already');
  const card = $('search-results').querySelector('.result-card');
  card.click();
  await flush();
  assert.equal(setMyStateCalls.length, 0);
  assert.equal(upsertCalls.length, 0);
  assert.equal(card.querySelector('.result-card__add').textContent, '✓');
});

test('add failure re-enables the card and shows a retry status', async () => {
  setMyStateThrows = true;
  searchResults = [{ id: 12, media_type: 'movie', title: 'Fails', poster_path: '/f.jpg' }];
  await type('failadd');
  const card = $('search-results').querySelector('.result-card');
  card.click();
  await flush();
  assert.equal(card.disabled, false);
  assert.equal(card.classList.contains('is-loading'), false);
  assert.equal($('search-status').textContent, 'Add failed. Try again.');
  assert.ok(toastErrors.length >= 1);
});
