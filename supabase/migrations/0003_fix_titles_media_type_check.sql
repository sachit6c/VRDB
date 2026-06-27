-- Adding a TV show silently fails ("Add failed" toast) while movies add fine.
--
-- Movies and TV go through the *same* client path (db.js upsertTitle ->
-- setMyState). Every column except `media_type` is populated identically for a
-- search-result add (runtime / episode_count / genres are all null for both).
-- So the only differing input between a movie add and a TV add is the value of
-- `titles.media_type` ('movie' vs 'tv'). The only thing that can therefore
-- reject TV while accepting movies is a CHECK constraint on media_type that
-- omits 'tv'.
--
-- Like the state column in migration 0002, the `titles` table was created in the
-- Supabase dashboard with a CHECK constraint that only allowed 'movie'. This
-- migration drops whatever CHECK constraint currently guards media_type (its
-- name is auto-generated and may vary) and recreates it allowing both values.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class      rel on rel.oid = con.conrelid
    join pg_namespace  nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'titles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%media_type%'
  loop
    execute format('alter table public.titles drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.titles
  add constraint titles_media_type_check
  check (media_type in ('movie', 'tv'));
