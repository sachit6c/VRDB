// tests/db-extra.test.js
// Coverage for the db.js read/cache helpers not exercised by db.test.js.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseMock, filterValue } from './helpers/supabase-mock.js';

const sb = createSupabaseMock();
mock.module('../lib/supabase-client.js', { namedExports: { supabase: sb } });
const db = await import('../lib/db.js');

beforeEach(() => {
  sb.onSelect(() => ({ data: [], error: null }));
  sb.onUpsert(() => ({ error: null }));
  sb.onDelete(() => ({ error: null }));
});

test('getMyState returns the single row (or null)', async () => {
  sb.onSelect(() => ({ data: { state: 'watch_now', added_by_me: true }, error: null }));
  assert.deepEqual(await db.getMyState('Alice', 5), { state: 'watch_now', added_by_me: true });
  sb.onSelect(() => ({ data: null, error: null }));
  assert.equal(await db.getMyState('Alice', 6), null);
});

test('getMyState propagates errors', async () => {
  sb.onSelect(() => ({ data: null, error: new Error('x') }));
  await assert.rejects(() => db.getMyState('Alice', 1), /x/);
});

test('getTitle fetches one cached title by id', async () => {
  sb.onSelect((ctx) => {
    assert.equal(filterValue(ctx, 'eq', 'tmdb_id'), 99);
    return { data: { tmdb_id: 99, title: 'Cached' }, error: null };
  });
  assert.equal((await db.getTitle(99)).title, 'Cached');
});

test('listSuggestionSeeds maps rows and defaults genres to []', async () => {
  sb.onSelect((ctx) => {
    assert.equal(filterValue(ctx, 'eq', 'user_name'), 'Alice');
    return { data: [
      { state: 'watch_now', updated_at: 't', titles: { tmdb_id: 1, media_type: 'movie', genres: [{ id: 28 }] } },
      { state: 'watched', updated_at: 't', titles: { tmdb_id: 2, media_type: 'tv', genres: null } },
    ], error: null };
  });
  const seeds = await db.listSuggestionSeeds('Alice', { limit: 5 });
  assert.deepEqual(seeds[0], { tmdbId: 1, mediaType: 'movie', genres: [{ id: 28 }], state: 'watch_now' });
  assert.deepEqual(seeds[1].genres, []);
});

test('listHellNoIds returns a union Set across both users', async () => {
  sb.onSelect((ctx) => {
    assert.deepEqual(filterValue(ctx, 'in', 'user_name'), ['Alice', 'Bob']);
    return { data: [{ tmdb_id: 1 }, { tmdb_id: 2 }, { tmdb_id: 1 }], error: null };
  });
  const ids = await db.listHellNoIds({ me: 'Alice', partner: 'Bob' });
  assert.ok(ids instanceof Set);
  assert.deepEqual([...ids].sort(), [1, 2]);
});

test('getCachedSuggestions returns null when absent, shaped object when present', async () => {
  sb.onSelect(() => ({ data: null, error: null }));
  assert.equal(await db.getCachedSuggestions('for_you:Alice'), null);

  sb.onSelect(() => ({ data: { tmdb_ids: [3, 4], generated_at: '2026-01-01' }, error: null }));
  assert.deepEqual(await db.getCachedSuggestions('for_you:Alice'), { tmdbIds: [3, 4], generatedAt: '2026-01-01' });
});

test('getCachedSuggestions tolerates a null tmdb_ids column', async () => {
  sb.onSelect(() => ({ data: { tmdb_ids: null, generated_at: 't' }, error: null }));
  assert.deepEqual((await db.getCachedSuggestions('s')).tmdbIds, []);
});

test('saveCachedSuggestions upserts the surface row', async () => {
  let payload, opts;
  sb.onUpsert((ctx) => { payload = ctx.payload; opts = ctx.opts; return { error: null }; });
  await db.saveCachedSuggestions('surprise:A+B', [1, 2, 3]);
  assert.equal(payload.surface, 'surprise:A+B');
  assert.deepEqual(payload.tmdb_ids, [1, 2, 3]);
  assert.equal(opts.onConflict, 'surface');
});

test('saveCachedSuggestions propagates errors', async () => {
  sb.onUpsert(() => ({ error: new Error('boom') }));
  await assert.rejects(() => db.saveCachedSuggestions('s', []), /boom/);
});

// ── error-path coverage: every read helper must surface DB errors ─────────────
test('select-backed reads all reject on a DB error', async () => {
  sb.onSelect(() => ({ data: null, error: new Error('db down') }));
  await assert.rejects(() => db.listMyBacklog('Alice'), /db down/);
  await assert.rejects(() => db.getMyStatedIds('Alice'), /db down/);
  await assert.rejects(() => db.getTitle(1), /db down/);
  await assert.rejects(() => db.listSuggestionSeeds('Alice'), /db down/);
  await assert.rejects(() => db.listHellNoIds({ me: 'A', partner: 'B' }), /db down/);
  await assert.rejects(() => db.getCachedSuggestions('s'), /db down/);
  await assert.rejects(() => db.countMyStated('Alice'), /db down/);
  await assert.rejects(() => db.getTitlesByIds([1]), /db down/);
});

test('listShared rejects when either side errors', async () => {
  // first call (mine) errors
  let n = 0;
  sb.onSelect(() => { n++; return n === 1 ? { data: null, error: new Error('mine err') } : { data: [], error: null }; });
  await assert.rejects(() => db.listShared({ me: 'A', partner: 'B' }), /mine err/);
  // second call (theirs) errors
  n = 0;
  sb.onSelect(() => { n++; return n === 2 ? { data: null, error: new Error('theirs err') } : { data: [], error: null }; });
  await assert.rejects(() => db.listShared({ me: 'A', partner: 'B' }), /theirs err/);
});

test('listPartnerQueue rejects when the partner query errors', async () => {
  sb.onSelect((ctx) => {
    if (filterValue(ctx, 'eq', 'added_by_me') === true) return { data: null, error: new Error('partner err') };
    return { data: [], error: null };
  });
  await assert.rejects(() => db.listPartnerQueue({ me: 'A', partner: 'B' }), /partner err/);
});

test('listMyBacklog / getMyStatedIds tolerate a null data payload', async () => {
  sb.onSelect(() => ({ data: null, error: null }));
  assert.deepEqual([...(await db.getMyStatedIds('Alice'))], []); // (data ?? []) branch
});
