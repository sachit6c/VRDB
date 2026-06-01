// vrdb-config.example.js
// ─────────────────────────────────────────────────────────────
// 1. Copy this file to vrdb-config.js
// 2. Fill in your Supabase project URL + anon key, TMDB API key,
//    and the two partner names.
//    → Supabase: https://app.supabase.com → Project Settings → API
//    → TMDB:     https://www.themoviedb.org/settings/api
// 3. vrdb-config.js is gitignored — never commit real keys.
//
// ── Supabase SQL setup ───────────────────────────────────────
// Run these statements once in the Supabase SQL editor:
//
// CREATE TABLE IF NOT EXISTS titles (
//   tmdb_id       INTEGER PRIMARY KEY,
//   media_type    TEXT NOT NULL,
//   title         TEXT NOT NULL,
//   poster_path   TEXT,
//   overview      TEXT,
//   rating        NUMERIC,
//   runtime       INTEGER,
//   episode_count INTEGER,
//   genres        JSONB,
//   trailer_url   TEXT,
//   cached_at     TIMESTAMPTZ NOT NULL DEFAULT now()
// );
//
// CREATE TABLE IF NOT EXISTS user_title_states (
//   user_name    TEXT NOT NULL,
//   tmdb_id      INTEGER NOT NULL,
//   state        TEXT NOT NULL,
//   added_by_me  BOOLEAN NOT NULL DEFAULT false,
//   updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
//   PRIMARY KEY (user_name, tmdb_id),
//   FOREIGN KEY (tmdb_id) REFERENCES titles(tmdb_id) ON DELETE CASCADE
// );
//
// CREATE TABLE IF NOT EXISTS shared_list_order (
//   tmdb_id    INTEGER PRIMARY KEY,
//   position   INTEGER NOT NULL,
//   updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
//   FOREIGN KEY (tmdb_id) REFERENCES titles(tmdb_id) ON DELETE CASCADE
// );
//
// CREATE TABLE IF NOT EXISTS suggestions_cache (
//   surface      TEXT PRIMARY KEY,
//   tmdb_ids     JSONB NOT NULL,
//   generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
// );
//
// -- Enable Realtime on the tables we subscribe to:
// ALTER TABLE user_title_states  REPLICA IDENTITY FULL;
// ALTER TABLE shared_list_order  REPLICA IDENTITY FULL;
// -- Then go to Database → Replication → enable both tables.
//
// -- Permissive RLS (2-user trusted-URL app — intentional):
// ALTER TABLE titles             ENABLE ROW LEVEL SECURITY;
// ALTER TABLE user_title_states  ENABLE ROW LEVEL SECURITY;
// ALTER TABLE shared_list_order  ENABLE ROW LEVEL SECURITY;
// ALTER TABLE suggestions_cache  ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "anon all" ON titles            FOR ALL TO anon USING (true) WITH CHECK (true);
// CREATE POLICY "anon all" ON user_title_states FOR ALL TO anon USING (true) WITH CHECK (true);
// CREATE POLICY "anon all" ON shared_list_order FOR ALL TO anon USING (true) WITH CHECK (true);
// CREATE POLICY "anon all" ON suggestions_cache FOR ALL TO anon USING (true) WITH CHECK (true);
// ─────────────────────────────────────────────────────────────

export const SUPABASE_URL      = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'your-supabase-anon-key';

// TMDB v3 API key (the short one, not the long Read Access Token).
export const TMDB_API_KEY      = 'your-tmdb-api-key';

// The two partner names. These are the only valid identities in the app.
export const PARTNERS = ['Sachit', 'Partner'];
