-- Rename per-user state values from want_* to watch_* so internal identifiers
-- match the user-facing "Watch now" / "Watch later" labels.

update public.user_title_states set state = 'watch_now'   where state = 'want_now';
update public.user_title_states set state = 'watch_later' where state = 'want_later';
