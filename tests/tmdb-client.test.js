// tests/tmdb-client.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFetch, resetGlobals } from './helpers/dom-shim.js';
import {
  posterUrl, yearOf, titleOf, providerLogoUrl,
  searchMulti, getTrending, getRelated, discoverByGenre, getWatchProviders,
  TMDB_IMG_BASE,
} from '../lib/tmdb-client.js';

// ── Pure helpers ──────────────────────────────────────────────────────────────
test('posterUrl builds a sized image URL', () => {
  assert.equal(posterUrl('/abc.jpg'), `${TMDB_IMG_BASE}/w342/abc.jpg`);
  assert.equal(posterUrl('/abc.jpg', 'w780'), `${TMDB_IMG_BASE}/w780/abc.jpg`);
});

test('posterUrl returns null for missing path', () => {
  assert.equal(posterUrl(null), null);
  assert.equal(posterUrl(''), null);
  assert.equal(posterUrl(undefined), null);
});

test('providerLogoUrl builds a sized logo URL / null when missing', () => {
  assert.equal(providerLogoUrl('/n.png'), `${TMDB_IMG_BASE}/w92/n.png`);
  assert.equal(providerLogoUrl(null), null);
});

test('yearOf reads release_date (movie) and first_air_date (tv)', () => {
  assert.equal(yearOf({ release_date: '2010-07-16' }), '2010');
  assert.equal(yearOf({ first_air_date: '2016-07-15' }), '2016');
  assert.equal(yearOf({ release_date: '', first_air_date: '' }), '');
  assert.equal(yearOf({}), '');
});

test('titleOf falls back across title/name/untitled', () => {
  assert.equal(titleOf({ title: 'Inception' }), 'Inception');
  assert.equal(titleOf({ name: 'Stranger Things' }), 'Stranger Things');
  assert.equal(titleOf({}), '(untitled)');
});

// ── fetch-backed API ──────────────────────────────────────────────────────────
test('searchMulti returns [] for blank query without hitting network', async () => {
  let called = false;
  installFetch(() => { called = true; return {}; });
  assert.deepEqual(await searchMulti('   '), []);
  assert.equal(called, false);
  resetGlobals();
});

test('searchMulti filters out person results', async () => {
  installFetch(() => ({
    body: { results: [
      { id: 1, media_type: 'movie', title: 'A' },
      { id: 2, media_type: 'person', name: 'Someone' },
      { id: 3, media_type: 'tv', name: 'B' },
    ] },
  }));
  const out = await searchMulti('foo');
  assert.deepEqual(out.map((r) => r.id), [1, 3]);
  resetGlobals();
});

test('searchMulti sends api_key and query params', async () => {
  let seen = '';
  installFetch((url) => { seen = url; return { body: { results: [] } }; });
  await searchMulti('the matrix');
  assert.match(seen, /\/search\/multi\?/);
  assert.match(seen, /api_key=/);
  assert.match(seen, /query=the\+matrix/);
  assert.match(seen, /include_adult=false/);
  resetGlobals();
});

test('tmdb throws on non-ok response', async () => {
  installFetch(() => ({ ok: false, status: 404 }));
  await assert.rejects(() => getTrending(), /TMDB 404/);
  resetGlobals();
});

test('getTrending filters non movie/tv and defaults to week window', async () => {
  let seen = '';
  installFetch((url) => {
    seen = url;
    return { body: { results: [
      { id: 1, media_type: 'movie' },
      { id: 2, media_type: 'person' },
    ] } };
  });
  const out = await getTrending();
  assert.deepEqual(out.map((r) => r.id), [1]);
  assert.match(seen, /\/trending\/all\/week/);
  resetGlobals();
});

test('getRelated stamps media_type and rejects bad media types', async () => {
  installFetch(() => ({ body: { results: [{ id: 9 }] } }));
  const out = await getRelated({ mediaType: 'movie', id: 5, kind: 'similar' });
  assert.equal(out[0].media_type, 'movie');
  assert.deepEqual(await getRelated({ mediaType: 'bogus', id: 1 }), []);
  resetGlobals();
});

test('discoverByGenre passes genre + quality filters', async () => {
  let seen = '';
  installFetch((url) => { seen = url; return { body: { results: [{ id: 1 }] } }; });
  const out = await discoverByGenre({ mediaType: 'tv', genreId: 18 });
  assert.equal(out[0].media_type, 'tv');
  assert.match(seen, /\/discover\/tv/);
  assert.match(seen, /with_genres=18/);
  assert.match(seen, /vote_count.gte=200/);
  resetGlobals();
});

test('list endpoints tolerate a missing results array', async () => {
  installFetch(() => ({ body: {} })); // no .results
  assert.deepEqual(await searchMulti('x'), []);
  assert.deepEqual(await getTrending(), []);
  assert.deepEqual(await getRelated({ mediaType: 'movie', id: 1 }), []);
  assert.deepEqual(await discoverByGenre({ mediaType: 'movie', genreId: 1 }), []);
  resetGlobals();
});

test('getWatchProviders defaults missing groups/link', async () => {
  installFetch(() => ({ body: { results: { US: { flatrate: [{ provider_name: 'Hulu' }] } } } }));
  const us = await getWatchProviders({ mediaType: 'tv', id: 1 });
  assert.deepEqual(us.rent, []);   // rent ?? []
  assert.deepEqual(us.buy, []);    // buy ?? []
  assert.equal(us.link, null);     // link ?? null
  resetGlobals();
});

test('getWatchProviders returns region slice or null', async () => {
  installFetch(() => ({ body: { results: { US: { link: 'x', flatrate: [{ provider_name: 'Netflix' }] } } } }));
  const us = await getWatchProviders({ mediaType: 'movie', id: 1 });
  assert.equal(us.flatrate[0].provider_name, 'Netflix');
  assert.deepEqual(us.rent, []);

  installFetch(() => ({ body: { results: {} } }));
  assert.equal(await getWatchProviders({ mediaType: 'movie', id: 1 }), null);
  assert.equal(await getWatchProviders({ mediaType: 'person', id: 1 }), null);
  resetGlobals();
});
