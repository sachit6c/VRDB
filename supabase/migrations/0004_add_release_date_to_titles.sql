-- Add a cached release date to `titles` so the list views (Mine / Shared /
-- Partner) can offer a "Release date" sort.
--
-- TMDB exposes the date as `release_date` for movies and `first_air_date` for
-- TV. We store whichever applies in a single `release_date` column; the client
-- (db.js upsertTitle) picks the right source per media type.
--
-- Existing cached rows keep release_date = NULL until they are next re-cached.
-- Null dates sort to the end of the Release-date sort, so this degrades cleanly
-- without a backfill.

alter table public.titles
  add column if not exists release_date date;
