-- Migration 0001 renamed the per-user state *data* from want_* to watch_* but left
-- the CHECK constraint on user_title_states.state untouched. The base table was
-- created in the Supabase dashboard with a constraint allowing the old values
-- (want_now / want_later / ...), so any insert/upsert of 'watch_now' or
-- 'watch_later' is rejected by Postgres. That's why adding a title to "Watch now"
-- or "Watch later" silently fails ("Add failed" toast) while "Watched" / "Hell no"
-- still work — those values were never renamed.
--
-- This migration drops whatever CHECK constraint currently guards the state column
-- (name is auto-generated and may vary) and recreates it with the current,
-- canonical set of values.

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
      and rel.relname = 'user_title_states'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%state%'
  loop
    execute format('alter table public.user_title_states drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.user_title_states
  add constraint user_title_states_state_check
  check (state in ('watch_now', 'watch_later', 'watched', 'hell_no', 'unseen'));
