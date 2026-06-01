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

export const tmdbClient = { tmdb };
