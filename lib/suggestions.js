// lib/suggestions.js
// Computes For You / For Us / Surprise Me decks from TMDB and caches per-surface in Supabase.

import { getRelated, discoverByGenre } from './tmdb-client.js';
import {
  listSuggestionSeeds,
  listHellNoIds,
  getMyStatedIds,
  getCachedSuggestions,
  saveCachedSuggestions,
  upsertTitle,
} from './db.js';
import { getMe, getPartner } from './identity.js';

const DECK_SIZE = 20;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEEDS = 12;

// ── Public API ──────────────────────────────────────────────────────────────

export async function getForYou({ refresh = false } = {}) {
  const me = getMe();
  return _surface(`for_you:${me}`, refresh, () => computeForYou(me));
}

export async function getForUs({ refresh = false } = {}) {
  const me = getMe();
  const partner = getPartner();
  return _surface(_pairKey('for_us', me, partner), refresh, () => computeForUs(me, partner));
}

export async function getSurpriseMe({ refresh = false } = {}) {
  const me = getMe();
  const partner = getPartner();
  return _surface(_pairKey('surprise', me, partner), refresh, () => computeSurpriseMe(me, partner));
}

// ── Cache wrapper ───────────────────────────────────────────────────────────

async function _surface(key, refresh, compute) {
  if (!refresh) {
    const cached = await getCachedSuggestions(key);
    if (cached && !_isStale(cached.generatedAt)) {
      // Cached row stores ids only. Re-resolve to TMDB-shaped items from `titles`.
      return { items: await _hydrateItems(cached.tmdbIds), fromCache: true };
    }
  }
  const items = await compute();
  await saveCachedSuggestions(key, items.map((i) => i.id));
  return { items, fromCache: false };
}

function _isStale(generatedAt) {
  return Date.now() - new Date(generatedAt).getTime() > CACHE_TTL_MS;
}

function _pairKey(prefix, me, partner) {
  const [a, b] = [me, partner].slice().sort();
  return `${prefix}:${a}+${b}`;
}

// Pull cached title rows and shape them like TMDB items for the card stack.
async function _hydrateItems(ids) {
  const { getTitlesByIds } = await import('./db.js');
  const rows = await getTitlesByIds(ids);
  return rows.map(_titleRowToTmdbShape);
}

function _titleRowToTmdbShape(row) {
  return {
    id:             row.tmdb_id,
    media_type:     row.media_type,
    title:          row.media_type === 'tv' ? null : row.title,
    name:           row.media_type === 'tv' ? row.title : null,
    poster_path:    row.poster_path,
    overview:       row.overview,
    vote_average:   row.rating,
    release_date:   null,
    first_air_date: null,
  };
}

// ── Compute functions ───────────────────────────────────────────────────────

async function computeForYou(me) {
  const partner = getPartner();
  const [seeds, hellNo, myStated] = await Promise.all([
    listSuggestionSeeds(me, { limit: MAX_SEEDS }),
    listHellNoIds({ me, partner }),
    getMyStatedIds(me),
  ]);
  const pool = await _poolFromSeeds(seeds);
  const filtered = _filterAndRank(pool, { exclude: _union(hellNo, myStated) });
  const top = filtered.slice(0, DECK_SIZE);
  await _cacheTitles(top);
  return top;
}

async function computeForUs(me, partner) {
  const [mySeeds, theirSeeds, hellNo, myStated, theirStated] = await Promise.all([
    listSuggestionSeeds(me, { limit: MAX_SEEDS }),
    listSuggestionSeeds(partner, { limit: MAX_SEEDS }),
    listHellNoIds({ me, partner }),
    getMyStatedIds(me),
    getMyStatedIds(partner),
  ]);
  const [myPool, theirPool] = await Promise.all([
    _poolFromSeeds(mySeeds),
    _poolFromSeeds(theirSeeds),
  ]);
  // Intersect by tmdb id; combine frequency scores.
  const theirById = new Map();
  for (const r of theirPool) {
    theirById.set(r.item.id, (theirById.get(r.item.id) ?? 0) + r.score);
  }
  const both = [];
  for (const r of myPool) {
    const theirScore = theirById.get(r.item.id);
    if (theirScore == null) continue;
    both.push({ item: r.item, score: r.score + theirScore });
  }
  const exclude = _union(hellNo, myStated, theirStated);
  const filtered = both
    .filter((r) => !exclude.has(r.item.id))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
  // Dedupe (in case both pools contributed the same id more than once)
  const seen = new Set();
  const top = [];
  for (const it of filtered) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    top.push(it);
    if (top.length >= DECK_SIZE) break;
  }
  await _cacheTitles(top);
  return top;
}

async function computeSurpriseMe(me, partner) {
  const [mySeeds, theirSeeds, hellNo, myStated, theirStated] = await Promise.all([
    listSuggestionSeeds(me, { limit: MAX_SEEDS * 2 }),
    listSuggestionSeeds(partner, { limit: MAX_SEEDS * 2 }),
    listHellNoIds({ me, partner }),
    getMyStatedIds(me),
    getMyStatedIds(partner),
  ]);

  // Tally genre frequency across both backlogs (uses cached titles.genres jsonb).
  const genreCount = new Map();
  for (const s of [...mySeeds, ...theirSeeds]) {
    for (const g of (s.genres ?? [])) {
      const gid = g.id ?? g; // tolerate either shape
      if (!gid) continue;
      genreCount.set(gid, (genreCount.get(gid) ?? 0) + 1);
    }
  }
  // Pick from a small set of popular TMDB genres that are underrepresented (count 0–1).
  const POPULAR_GENRES = [
    { id: 28,    media: 'movie' }, // Action
    { id: 12,    media: 'movie' }, // Adventure
    { id: 35,    media: 'movie' }, // Comedy
    { id: 80,    media: 'movie' }, // Crime
    { id: 18,    media: 'movie' }, // Drama
    { id: 14,    media: 'movie' }, // Fantasy
    { id: 27,    media: 'movie' }, // Horror
    { id: 9648,  media: 'movie' }, // Mystery
    { id: 10749, media: 'movie' }, // Romance
    { id: 878,   media: 'movie' }, // Sci-Fi
    { id: 53,    media: 'movie' }, // Thriller
    { id: 10759, media: 'tv'    }, // Action & Adventure
    { id: 10765, media: 'tv'    }, // Sci-Fi & Fantasy
    { id: 99,    media: 'movie' }, // Documentary
  ];
  const ranked = POPULAR_GENRES
    .map((g) => ({ ...g, count: genreCount.get(g.id) ?? 0 }))
    .sort((a, b) => a.count - b.count);
  const pick = ranked[Math.floor(Math.random() * Math.min(3, ranked.length))];

  const candidates = await discoverByGenre({ mediaType: pick.media, genreId: pick.id });
  const exclude = _union(hellNo, myStated, theirStated);
  const top = candidates.filter((c) => !exclude.has(c.id)).slice(0, DECK_SIZE);
  await _cacheTitles(top);
  return top;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// Fan out to TMDB /recommendations and /similar for each seed; pool with frequency score.
async function _poolFromSeeds(seeds) {
  const requests = [];
  for (const s of seeds) {
    requests.push(getRelated({ mediaType: s.mediaType, id: s.tmdbId, kind: 'recommendations' }));
    requests.push(getRelated({ mediaType: s.mediaType, id: s.tmdbId, kind: 'similar' }));
  }
  const settled = await Promise.allSettled(requests);
  const scores = new Map(); // id -> { item, score }
  for (const r of settled) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      if (!item || !item.id) continue;
      const cur = scores.get(item.id);
      if (cur) cur.score += 1;
      else scores.set(item.id, { item, score: 1 });
    }
  }
  return [...scores.values()];
}

function _filterAndRank(pool, { exclude }) {
  return pool
    .filter((r) => !exclude.has(r.item.id))
    .sort((a, b) => b.score - a.score)
    .map((r) => r.item);
}

function _union(...sets) {
  const out = new Set();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

// Persist suggested titles into `titles` so realtime / detail sheet have metadata.
async function _cacheTitles(items) {
  await Promise.allSettled(items.map((it) => upsertTitle(it)));
}
