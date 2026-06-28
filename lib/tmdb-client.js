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

// Static TMDB genre id → name map (movie + tv genre lists merged). Lets us label
// list/search rows that only carry `genre_ids` without an extra API round-trip.
export const GENRE_NAMES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

// Genre names for a TMDB-ish item. Handles both `genres` (array of {id,name},
// as cached in our DB) and `genre_ids` (array of ids, on list/search rows).
// Returns up to `max` names.
export function genresOf(item, max = 3) {
  let names = [];
  if (Array.isArray(item.genres) && item.genres.length) {
    names = item.genres.map((g) => g.name || GENRE_NAMES[g.id ?? g]).filter(Boolean);
  } else if (Array.isArray(item.genre_ids)) {
    names = item.genre_ids.map((id) => GENRE_NAMES[id]).filter(Boolean);
  }
  return names.slice(0, max);
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

// Full TMDB detail object for a title (movie or tv). Carries fields the cached
// `titles` row doesn't, e.g. spoken_languages. Returns null for bad media types.
export async function getTitleDetails({ mediaType, id }) {
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  return tmdb(`/${mediaType}/${id}`);
}

// Audio/spoken language names from a TMDB detail object. Prefers the localized
// english_name, falls back to name. Returns up to `max` names.
export function spokenLanguagesOf(details, max = 4) {
  const list = details?.spoken_languages;
  if (!Array.isArray(list)) return [];
  return list.map((l) => l.english_name || l.name).filter(Boolean).slice(0, max);
}

// A Google search URL for a title (used by the detail sheet's "Search Google").
export function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
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

export const tmdbClient = { tmdb, searchMulti, posterUrl, yearOf, titleOf, genresOf, getTitleDetails, spokenLanguagesOf, googleSearchUrl, getTrending, getRelated, discoverByGenre, getWatchProviders, providerLogoUrl };
