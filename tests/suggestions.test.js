// tests/suggestions.test.js
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/dom-shim.js';
import { createSupabaseMock } from './helpers/supabase-mock.js';

installLocalStorage();
// suggestions.js -> db.js -> supabase-client.js (a network ESM import). Mock it so
// importing the module graph never touches the network.
mock.module('../lib/supabase-client.js', { namedExports: { supabase: createSupabaseMock() } });

const { _pairKey, _isStale, _union, _filterAndRank, _titleRowToTmdbShape } =
  await import('../lib/suggestions.js');

test('_pairKey is order-independent (same key for A+B and B+A)', () => {
  assert.equal(_pairKey('for_us', 'Alice', 'Bob'), _pairKey('for_us', 'Bob', 'Alice'));
  assert.equal(_pairKey('for_us', 'Bob', 'Alice'), 'for_us:Alice+Bob');
});

test('_isStale is true past the 24h TTL, false within', () => {
  const now = Date.now();
  assert.equal(_isStale(new Date(now - 1000).toISOString()), false);
  assert.equal(_isStale(new Date(now - 25 * 60 * 60 * 1000).toISOString()), true);
});

test('_union merges sets and dedupes', () => {
  const u = _union(new Set([1, 2]), new Set([2, 3]), new Set([3, 4]));
  assert.deepEqual([...u].sort((a, b) => a - b), [1, 2, 3, 4]);
});

test('_filterAndRank excludes ids then sorts by score desc', () => {
  const pool = [
    { item: { id: 1 }, score: 1 },
    { item: { id: 2 }, score: 5 },
    { item: { id: 3 }, score: 3 },
  ];
  const out = _filterAndRank(pool, { exclude: new Set([3]) });
  assert.deepEqual(out.map((i) => i.id), [2, 1]); // 3 removed, sorted by score
});

test('_titleRowToTmdbShape maps tv vs movie title/name fields', () => {
  const tv = _titleRowToTmdbShape({ tmdb_id: 7, media_type: 'tv', title: 'Severance', rating: 8.4 });
  assert.equal(tv.id, 7);
  assert.equal(tv.name, 'Severance');
  assert.equal(tv.title, null);
  assert.equal(tv.vote_average, 8.4);

  const movie = _titleRowToTmdbShape({ tmdb_id: 8, media_type: 'movie', title: 'Dune' });
  assert.equal(movie.title, 'Dune');
  assert.equal(movie.name, null);
});
