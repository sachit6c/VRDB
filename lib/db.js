// lib/db.js
// Thin data layer over Supabase for VRDB.
// Tables: titles, user_title_states.

import { supabase } from './supabase-client.js';

// Per-user state values from the PRD.
export const STATES = Object.freeze({
  WANT_NOW:   'want_now',
  WANT_LATER: 'want_later',
  WATCHED:    'watched',
  HELL_NO:    'hell_no',
  UNSEEN:     'unseen',
});

// Display labels for state pills / buttons.
export const STATE_LABELS = Object.freeze({
  want_now:   'Want now',
  want_later: 'Want later',
  watched:    'Watched',
  hell_no:    'Hell no',
  unseen:     'Not set',
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
    .in('state', ['want_now', 'want_later', 'watched'])
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
