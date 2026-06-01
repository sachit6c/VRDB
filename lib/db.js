// lib/db.js
// Thin data layer over Supabase for VRDB.
// Tables: titles, user_title_states.

import { supabase } from './supabase-client.js';

// Per-user state values from the PRD.
export const STATES = Object.freeze({
  WATCH_NOW:   'watch_now',
  WATCH_LATER: 'watch_later',
  WATCHED:     'watched',
  HELL_NO:     'hell_no',
  UNSEEN:      'unseen',
});

// Display labels for state pills / buttons.
// NOTE: keys (watch_now, watch_later) are stable DB identifiers; labels are user-facing.
export const STATE_LABELS = Object.freeze({
  watch_now:   'Watch now',
  watch_later: 'Watch later',
  watched:     'Watched',
  hell_no:     'Hell no',
  unseen:      'Not set',
});

// Cache a TMDB result row in `titles` (idempotent upsert).
// `tmdbItem` is a raw TMDB search/detail object (movie or tv).
export async function upsertTitle(tmdbItem) {
  const mediaType = tmdbItem.media_type ?? (tmdbItem.title ? 'movie' : 'tv');
  const row = {
    tmdb_id:     tmdbItem.id,
    media_type:  mediaType,
    title:       tmdbItem.title || tmdbItem.name || '(untitled)',
    poster_path: tmdbItem.poster_path ?? null,
    overview:    tmdbItem.overview ?? null,
    rating:      tmdbItem.vote_average ?? null,
    runtime:     tmdbItem.runtime ?? null,
    episode_count: tmdbItem.number_of_episodes ?? null,
    genres:      tmdbItem.genres ?? null,
    trailer_url: null,
    cached_at:   new Date().toISOString(),
  };

  const { error } = await supabase
    .from('titles')
    .upsert(row, { onConflict: 'tmdb_id' });
  if (error) throw error;
  return row;
}

// Set my state for a title. Auto-marks added_by_me=true if it's a fresh add.
export async function setMyState({ me, tmdbId, state, addedByMe = false }) {
  const row = {
    user_name:   me,
    tmdb_id:     tmdbId,
    state,
    added_by_me: addedByMe,
    updated_at:  new Date().toISOString(),
  };
  const { error } = await supabase
    .from('user_title_states')
    .upsert(row, { onConflict: 'user_name,tmdb_id' });
  if (error) throw error;
}

// Get my full backlog (anything not 'hell_no' or 'unseen'), joined with title metadata.
export async function listMyBacklog(me) {
  const { data, error } = await supabase
    .from('user_title_states')
    .select('state, added_by_me, updated_at, titles!inner(*)')
    .eq('user_name', me)
    .in('state', ['watch_now', 'watch_later', 'watched'])
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    state: r.state,
    addedByMe: r.added_by_me,
    updatedAt: r.updated_at,
    title: r.titles,
  }));
}

// Get my state row for a single title (or null).
export async function getMyState(me, tmdbId) {
  const { data, error } = await supabase
    .from('user_title_states')
    .select('state, added_by_me')
    .eq('user_name', me)
    .eq('tmdb_id', tmdbId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Remove my state for a title (true removal from my backlog).
export async function removeMyState({ me, tmdbId }) {
  const { error } = await supabase
    .from('user_title_states')
    .delete()
    .eq('user_name', me)
    .eq('tmdb_id', tmdbId);
  if (error) throw error;
}

// Fetch a single cached title by tmdb_id (or null if not cached yet).
export async function getTitle(tmdbId) {
  const { data, error } = await supabase
    .from('titles')
    .select('*')
    .eq('tmdb_id', tmdbId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Return a Set of tmdb_ids the user already has any state on (used to filter Discover queue).
export async function getMyStatedIds(me) {
  const { data, error } = await supabase
    .from('user_title_states')
    .select('tmdb_id')
    .eq('user_name', me);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.tmdb_id));
}

// Titles partner added to *their* backlog (added_by_me=true on their row) and
// that I have NOT yet reacted to. Used for the Partner swiping queue.
export async function listPartnerQueue({ me, partner }) {
  const [partnerRows, statedIds] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('user_title_states')
        .select('state, updated_at, titles!inner(*)')
        .eq('user_name', partner)
        .eq('added_by_me', true)
        .in('state', ['watch_now', 'watch_later']) // ignore things they already nuked
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    })(),
    getMyStatedIds(me),
  ]);
  return partnerRows
    .filter((r) => !statedIds.has(r.titles.tmdb_id))
    .map((r) => ({
      // Shape mirrors a TMDB item so card-stack renders it.
      id:           r.titles.tmdb_id,
      media_type:   r.titles.media_type,
      title:        r.titles.media_type === 'tv' ? null : r.titles.title,
      name:         r.titles.media_type === 'tv' ? r.titles.title : null,
      poster_path:  r.titles.poster_path,
      overview:     r.titles.overview,
      vote_average: r.titles.rating,
      release_date: null,
      first_air_date: null,
      _cachedTitle: r.titles,
      _partnerState: r.state,
    }));
}

// Titles both users currently want to watch (state in watch_now or watch_later for both).
// Returns rows shaped { title, myState, partnerState, addedAt }.
export async function listShared({ me, partner }) {
  const wanted = ['watch_now', 'watch_later'];
  const [{ data: mine, error: e1 }, { data: theirs, error: e2 }] = await Promise.all([
    supabase
      .from('user_title_states')
      .select('state, updated_at, titles!inner(*)')
      .eq('user_name', me)
      .in('state', wanted),
    supabase
      .from('user_title_states')
      .select('state, updated_at, titles!inner(*)')
      .eq('user_name', partner)
      .in('state', wanted),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const theirsByTmdb = new Map((theirs ?? []).map((r) => [r.titles.tmdb_id, r]));
  const matches = [];
  for (const m of (mine ?? [])) {
    const p = theirsByTmdb.get(m.titles.tmdb_id);
    if (!p) continue;
    matches.push({
      title:        m.titles,
      myState:      m.state,
      partnerState: p.state,
      // Use the later of the two updated_at values as "matched at".
      matchedAt:    m.updated_at > p.updated_at ? m.updated_at : p.updated_at,
    });
  }
  matches.sort((a, b) => (a.matchedAt < b.matchedAt ? 1 : -1));
  return matches;
}
