// tests/suggestions-compute.test.js
// Covers the async public + compute paths of lib/suggestions.js
// (getForYou / getForUs / getSurpriseMe). Pure helpers live in suggestions.test.js.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/dom-shim.js';

installLocalStorage();
localStorage.setItem('vrdb.me', 'Alice');
localStorage.setItem('vrdb.partner', 'Bob');

// ── Configurable mock state ──────────────────────────────────────────────────
let seedsFor, hellNo, statedFor, cache, saved, relatedFor, discoverResult;
let getRelatedCalls, discoverCalls;

function reset() {
  seedsFor = {};
  hellNo = [];
  statedFor = {};
  cache = {};
  saved = {};
  relatedFor = {};
  discoverResult = [];
  getRelatedCalls = [];
  discoverCalls = [];
}
reset();

mock.module('../lib/db.js', {
  namedExports: {
    listSuggestionSeeds: async (me) => seedsFor[me] || [],
    listHellNoIds: async () => new Set(hellNo),
    getMyStatedIds: async (me) => new Set(statedFor[me] || []),
    getCachedSuggestions: async (key) => cache[key] ?? null,
    saveCachedSuggestions: async (key, ids) => { saved[key] = ids; },
    upsertTitle: async () => {},
    getTitlesByIds: async (ids) => ids.map((id) => ({
      tmdb_id: id, media_type: 'movie', title: 'T' + id, poster_path: null, overview: null, rating: 5,
    })),
  },
});

mock.module('../lib/tmdb-client.js', {
  namedExports: {
    getRelated: async ({ id, kind }) => { getRelatedCalls.push({ id, kind }); return relatedFor[id] || []; },
    discoverByGenre: async ({ genreId }) => { discoverCalls.push(genreId); return discoverResult; },
  },
});

const sug = await import('../lib/suggestions.js');

beforeEach(reset);

const nowIso = () => new Date().toISOString();
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();

// ── getForYou ────────────────────────────────────────────────────────────────
test('getForYou returns cached items without recomputing', async () => {
  cache['for_you:Alice'] = { tmdbIds: [1, 2], generatedAt: nowIso() };
  const { items, fromCache } = await sug.getForYou();
  assert.equal(fromCache, true);
  assert.deepEqual(items.map((i) => i.id), [1, 2]);
  assert.equal(getRelatedCalls.length, 0);   // compute never ran
  assert.equal(saved['for_you:Alice'], undefined);
});

test('getForYou computes from seeds, ranks, excludes hellNo+stated, caches', async () => {
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [{ id: 28 }], state: 'watch_now' }];
  relatedFor[100] = [{ id: 1 }, { id: 2 }, { id: 3 }];
  hellNo = [2];
  statedFor['Alice'] = [3];

  const { items, fromCache } = await sug.getForYou();
  assert.equal(fromCache, false);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes(1));
  assert.ok(!ids.includes(2), 'hellNo excluded');
  assert.ok(!ids.includes(3), 'already-stated excluded');
  assert.ok(getRelatedCalls.length >= 2, 'recommendations + similar fetched');
  assert.deepEqual(saved['for_you:Alice'], ids);
});

test('getForYou caps the deck at 20', async () => {
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [], state: 'watched' }];
  relatedFor[100] = Array.from({ length: 50 }, (_, i) => ({ id: 1000 + i }));
  const { items } = await sug.getForYou();
  assert.equal(items.length, 20);
});

test('getForYou refresh:true bypasses a fresh cache', async () => {
  cache['for_you:Alice'] = { tmdbIds: [1], generatedAt: nowIso() };
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [], state: 'watch_now' }];
  relatedFor[100] = [{ id: 7 }];
  const { items, fromCache } = await sug.getForYou({ refresh: true });
  assert.equal(fromCache, false);
  assert.deepEqual(items.map((i) => i.id), [7]);
  assert.ok(getRelatedCalls.length > 0);
});

test('getForYou recomputes a stale (>24h) cache', async () => {
  cache['for_you:Alice'] = { tmdbIds: [1], generatedAt: agoIso(25 * 60 * 60 * 1000) };
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [], state: 'watch_now' }];
  relatedFor[100] = [{ id: 9 }];
  const { items, fromCache } = await sug.getForYou();
  assert.equal(fromCache, false);
  assert.deepEqual(items.map((i) => i.id), [9]);
});

// ── getForUs ─────────────────────────────────────────────────────────────────
test('getForUs keeps only titles in BOTH pools and uses an order-independent key', async () => {
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [], state: 'watch_now' }];
  seedsFor['Bob'] = [{ tmdbId: 200, mediaType: 'movie', genres: [], state: 'watch_now' }];
  relatedFor[100] = [{ id: 1 }, { id: 2 }];
  relatedFor[200] = [{ id: 2 }, { id: 5 }];

  const { items, fromCache } = await sug.getForUs();
  assert.equal(fromCache, false);
  assert.deepEqual(items.map((i) => i.id), [2]); // only the shared id
  assert.ok('for_us:Alice+Bob' in saved);        // key sorted regardless of who is "me"
});

test('getForUs excludes ids either partner already acted on', async () => {
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [], state: 'watch_now' }];
  seedsFor['Bob'] = [{ tmdbId: 200, mediaType: 'movie', genres: [], state: 'watch_now' }];
  relatedFor[100] = [{ id: 2 }];
  relatedFor[200] = [{ id: 2 }];
  statedFor['Bob'] = [2];

  const { items } = await sug.getForUs();
  assert.deepEqual(items.map((i) => i.id), []);
});

// ── getSurpriseMe ────────────────────────────────────────────────────────────
test('getSurpriseMe pulls from a genre via discoverByGenre and filters excludes', async () => {
  seedsFor['Alice'] = [{ tmdbId: 100, mediaType: 'movie', genres: [{ id: 28 }], state: 'watched' }];
  seedsFor['Bob'] = [{ tmdbId: 200, mediaType: 'movie', genres: [{ id: 18 }], state: 'watched' }];
  discoverResult = [{ id: 10 }, { id: 11 }, { id: 12 }];
  hellNo = [11];

  const { items, fromCache } = await sug.getSurpriseMe();
  assert.equal(fromCache, false);
  const ids = items.map((i) => i.id);
  assert.ok(ids.includes(10) && ids.includes(12));
  assert.ok(!ids.includes(11), 'hellNo excluded');
  assert.ok(discoverCalls.length === 1);
  assert.ok(items.length <= 20);
});
