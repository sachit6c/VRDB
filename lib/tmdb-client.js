// lib/tmdb-client.js
// TMDB v3 API client. Key inlined per the PRD threat model (2-user trusted-URL app).

const TMDB_API_KEY = 'd2f259c473c53955ce3ba3192a9a010b';
const TMDB_BASE    = 'https://api.themoviedb.org/3';
export const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p';

async function tmdb(path, params = {}) {
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', TMDB_API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} ${path}`);
  return res.json();
}

// Multi-search across movies + tv. Filters out `person` results.
export async function searchMulti(query) {
  const q = query.trim();
  if (!q) return [];
  const data = await tmdb('/search/multi', { query: q, include_adult: false, page: 1 });
  return (data.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

// Poster URL helper. Sizes: w92, w154, w185, w342, w500, w780, original.
export function posterUrl(posterPath, size = 'w342') {
  if (!posterPath) return null;
  return `${TMDB_IMG_BASE}/${size}${posterPath}`;
}

// Display year from a TMDB row (release_date for movies, first_air_date for tv).
export function yearOf(item) {
  const d = item.release_date || item.first_air_date || '';
  return d ? d.slice(0, 4) : '';
}

// Display title regardless of media_type.
export function titleOf(item) {
  return item.title || item.name || '(untitled)';
}

// Trending across both movie + tv. window = 'day' | 'week'.
export async function getTrending({ window = 'week', page = 1 } = {}) {
  const data = await tmdb(`/trending/all/${window}`, { page });
  return (data.results ?? []).filter((r) => r.media_type === 'movie' || r.media_type === 'tv');
}

export const tmdbClient = { tmdb, searchMulti, posterUrl, yearOf, titleOf, getTrending };
