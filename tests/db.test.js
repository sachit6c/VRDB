// tests/db.test.js
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseMock, filterValue } from './helpers/supabase-mock.js';

const sb = createSupabaseMock();
mock.module('../lib/supabase-client.js', { namedExports: { supabase: sb } });

const db = await import('../lib/db.js');

// Reset handlers between tests so each declares only what it needs.
beforeEach(() => {
  sb.onSelect(() => ({ data: [], error: null }));
  sb.onUpsert(() => ({ error: null }));
  sb.onDelete(() => ({ error: null }));
});

// ── STATE constants ─────────────────────────────────────────────────────────
test('STATES and STATE_LABELS cover all five states', () => {
  assert.deepEqual(Object.keys(db.STATES).sort(),
    ['HELL_NO', 'UNSEEN', 'WATCHED', 'WATCH_LATER', 'WATCH_NOW']);
  assert.equal(db.STATE_LABELS[db.STATES.WATCH_NOW], 'Watch now');
  assert.equal(db.STATE_LABELS.unseen, 'Not set');
});

// ── upsertTitle ───────────────────────────────────────────────────────────────
test('upsertTitle derives media_type and maps fields', async () => {
  let payload;
  sb.onUpsert((ctx) => { payload = ctx.payload; return { error: null }; });

  await db.upsertTitle({ id: 603, title: 'The Matrix', vote_average: 8.2, poster_path: '/m.jpg' });
  assert.equal(payload.tmdb_id, 603);
  assert.equal(payload.media_type, 'movie'); // has .title
  assert.equal(payload.title, 'The Matrix');
  assert.equal(payload.rating, 8.2);

  await db.upsertTitle({ id: 1399, name: 'Game of Thrones' });
  assert.equal(payload.media_type, 'tv'); // no .title, has .name
  assert.equal(payload.title, 'Game of Thrones');
});

test('upsertTitle respects an explicit media_type and falls back to (untitled)', async () => {
  let payload;
  sb.onUpsert((ctx) => { payload = ctx.payload; return { error: null }; });
  await db.upsertTitle({ id: 1, media_type: 'tv', title: 'X' });
  assert.equal(payload.media_type, 'tv');
  await db.upsertTitle({ id: 2 });
  assert.equal(payload.title, '(untitled)');
});

test('upsertTitle propagates DB errors', async () => {
  sb.onUpsert(() => ({ error: new Error('boom') }));
  await assert.rejects(() => db.upsertTitle({ id: 1, title: 'A' }), /boom/);
});

// ── setMyState ────────────────────────────────────────────────────────────────
test('setMyState writes user/tmdb/state and defaults addedByMe=false', async () => {
  let payload, opts;
  sb.onUpsert((ctx) => { payload = ctx.payload; opts = ctx.opts; return { error: null }; });
  await db.setMyState({ me: 'Alice', tmdbId: 42, state: 'watch_now' });
  assert.equal(payload.user_name, 'Alice');
  assert.equal(payload.tmdb_id, 42);
  assert.equal(payload.state, 'watch_now');
  assert.equal(payload.added_by_me, false);
  assert.equal(opts.onConflict, 'user_name,tmdb_id');
});

// ── getMyStatedIds ──────────────────────────────────────────────────────────
test('getMyStatedIds returns a Set of tmdb ids', async () => {
  sb.onSelect(() => ({ data: [{ tmdb_id: 1 }, { tmdb_id: 2 }, { tmdb_id: 2 }], error: null }));
  const ids = await db.getMyStatedIds('Alice');
  assert.ok(ids instanceof Set);
  assert.deepEqual([...ids].sort(), [1, 2]);
});

// ── listMyBacklog ─────────────────────────────────────────────────────────────
test('listMyBacklog reshapes joined rows', async () => {
  sb.onSelect(() => ({
    data: [{ state: 'watch_now', added_by_me: true, updated_at: 't', titles: { tmdb_id: 9, title: 'Z' } }],
    error: null,
  }));
  const out = await db.listMyBacklog('Alice');
  assert.deepEqual(out, [{ state: 'watch_now', addedByMe: true, updatedAt: 't', title: { tmdb_id: 9, title: 'Z' } }]);
});

// ── listShared (the matching core) ───────────────────────────────────────────
test('listShared intersects both backlogs and picks the later matchedAt', async () => {
  sb.onSelect((ctx) => {
    const user = filterValue(ctx, 'eq', 'user_name');
    if (user === 'Alice') {
      return { data: [
        { state: 'watch_now',  updated_at: '2026-01-01', titles: { tmdb_id: 1, title: 'Shared A' } },
        { state: 'watch_later', updated_at: '2026-01-05', titles: { tmdb_id: 2, title: 'Only Alice' } },
      ], error: null };
    }
    // Bob
    return { data: [
      { state: 'watch_now', updated_at: '2026-02-01', titles: { tmdb_id: 1, title: 'Shared A' } },
      { state: 'watch_now', updated_at: '2026-01-09', titles: { tmdb_id: 3, title: 'Only Bob' } },
    ], error: null };
  });

  const out = await db.listShared({ me: 'Alice', partner: 'Bob' });
  assert.equal(out.length, 1); // only tmdb_id 1 in both
  assert.equal(out[0].title.tmdb_id, 1);
  assert.equal(out[0].myState, 'watch_now');
  assert.equal(out[0].partnerState, 'watch_now');
  assert.equal(out[0].matchedAt, '2026-02-01'); // later of the two updated_at
});

test('listShared sorts matches by matchedAt descending', async () => {
  sb.onSelect((ctx) => {
    const user = filterValue(ctx, 'eq', 'user_name');
    const rows = user === 'Alice'
      ? [
          { state: 'watch_now', updated_at: '2026-01-01', titles: { tmdb_id: 1, title: 'A' } },
          { state: 'watch_now', updated_at: '2026-03-01', titles: { tmdb_id: 2, title: 'B' } },
        ]
      : [
          { state: 'watch_now', updated_at: '2026-01-02', titles: { tmdb_id: 1, title: 'A' } },
          { state: 'watch_now', updated_at: '2026-03-02', titles: { tmdb_id: 2, title: 'B' } },
        ];
    return { data: rows, error: null };
  });
  const out = await db.listShared({ me: 'Alice', partner: 'Bob' });
  assert.deepEqual(out.map((m) => m.title.tmdb_id), [2, 1]); // newest match first
});

// ── listPartnerQueue ──────────────────────────────────────────────────────────
test('listPartnerQueue drops titles I have already reacted to and maps to card shape', async () => {
  sb.onSelect((ctx) => {
    const user = filterValue(ctx, 'eq', 'user_name');
    if (user === 'Bob') {
      // partner's adds
      return { data: [
        { state: 'watch_now', updated_at: 't1', titles: { tmdb_id: 10, media_type: 'movie', title: 'Fresh', poster_path: '/p.jpg', overview: 'o', rating: 7 } },
        { state: 'watch_later', updated_at: 't2', titles: { tmdb_id: 20, media_type: 'tv', title: 'Seen', poster_path: null, overview: null, rating: null } },
      ], error: null };
    }
    // getMyStatedIds(me) -> Alice already reacted to 20
    return { data: [{ tmdb_id: 20 }], error: null };
  });

  const out = await db.listPartnerQueue({ me: 'Alice', partner: 'Bob' });
  assert.equal(out.length, 1);
  const card = out[0];
  assert.equal(card.id, 10);
  assert.equal(card.media_type, 'movie');
  assert.equal(card.title, 'Fresh'); // movie -> title set, name null
  assert.equal(card.name, null);
  assert.equal(card.vote_average, 7);
  assert.equal(card._partnerState, 'watch_now');
  assert.ok(card._cachedTitle);
});

test('listPartnerQueue maps tv items to name (not title)', async () => {
  sb.onSelect((ctx) => {
    const user = filterValue(ctx, 'eq', 'user_name');
    if (user === 'Bob') {
      return { data: [
        { state: 'watch_now', updated_at: 't', titles: { tmdb_id: 30, media_type: 'tv', title: 'Andor' } },
      ], error: null };
    }
    return { data: [], error: null };
  });
  const out = await db.listPartnerQueue({ me: 'Alice', partner: 'Bob' });
  assert.equal(out[0].name, 'Andor');
  assert.equal(out[0].title, null);
});

// ── countMyStated / removeMyState ─────────────────────────────────────────────
test('countMyStated returns the count (0 when null)', async () => {
  sb.onSelect(() => ({ count: 7, error: null }));
  assert.equal(await db.countMyStated('Alice'), 7);
  sb.onSelect(() => ({ count: null, error: null }));
  assert.equal(await db.countMyStated('Alice'), 0);
});

test('removeMyState issues a delete and propagates errors', async () => {
  let op = null;
  sb.onDelete((ctx) => { op = ctx.op; return { error: null }; });
  await db.removeMyState({ me: 'Alice', tmdbId: 1 });
  assert.equal(op, 'delete');

  sb.onDelete(() => ({ error: new Error('nope') }));
  await assert.rejects(() => db.removeMyState({ me: 'Alice', tmdbId: 1 }), /nope/);
});

// ── getTitlesByIds ────────────────────────────────────────────────────────────
test('getTitlesByIds preserves request order and drops misses', async () => {
  sb.onSelect(() => ({ data: [{ tmdb_id: 2 }, { tmdb_id: 1 }], error: null }));
  const out = await db.getTitlesByIds([1, 2, 3]); // 3 missing
  assert.deepEqual(out.map((t) => t.tmdb_id), [1, 2]);
});

test('getTitlesByIds short-circuits on empty input', async () => {
  let called = false;
  sb.onSelect(() => { called = true; return { data: [], error: null }; });
  assert.deepEqual(await db.getTitlesByIds([]), []);
  assert.equal(called, false);
});
