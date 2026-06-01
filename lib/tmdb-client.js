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

// TMDB /{media_type}/{id}/recommendations or /similar. Returns up to ~20 items.
export async function getRelated({ mediaType, id, kind = 'recommendations', page = 1 }) {
  if (mediaType !== 'movie' && mediaType !== 'tv') return [];
  const data = await tmdb(`/${mediaType}/${id}/${kind}`, { page });
  return (data.results ?? []).map((r) => ({ ...r, media_type: mediaType }));
}

// Discover top-rated in a given TMDB genre (movie or tv).
export async function discoverByGenre({ mediaType, genreId, page = 1 }) {
  if (mediaType !== 'movie' && mediaType !== 'tv') return [];
  const data = await tmdb(`/discover/${mediaType}`, {
    with_genres: genreId,
    sort_by: 'vote_average.desc',
    'vote_count.gte': 200,
    include_adult: false,
    page,
  });
  return (data.results ?? []).map((r) => ({ ...r, media_type: mediaType }));
}

// Watch providers for a title in a given region (default US). Returns
// { link, flatrate: [{ provider_name, logo_path }], rent: [...], buy: [...] }
// or null when no data is available for the region.
export async function getWatchProviders({ mediaType, id, region = 'US' }) {
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  const data = await tmdb(`/${mediaType}/${id}/watch/providers`);
  const r = data?.results?.[region];
  if (!r) return null;
  return {
    link:     r.link ?? null,
    flatrate: r.flatrate ?? [],
    rent:     r.rent ?? [],
    buy:      r.buy ?? [],
  };
}

// Logo URL helper for provider logos. Sizes: w45, w92, w154, original.
export function providerLogoUrl(logoPath, size = 'w92') {
  if (!logoPath) return null;
  return `${TMDB_IMG_BASE}/${size}${logoPath}`;
}

export const tmdbClient = { tmdb, searchMulti, posterUrl, yearOf, titleOf, getTrending, getRelated, discoverByGenre, getWatchProviders, providerLogoUrl };
