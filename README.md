# 🎬 VRDB

A movie & TV backlog app for two. Tinder-style swiping, shared matched list, TMDB-powered.

**Live app:** _coming soon_

---

## Stack

- Vanilla JS + ES Modules (no build step)
- [Supabase](https://supabase.com) — storage + realtime sync
- [TMDB API](https://www.themoviedb.org/documentation/api) — all content data
- CSS with `clamp()` for fluid responsive layout
- Vercel — static deployment

## Setup (local dev)

1. Clone the repo
2. Copy `vrdb-config.example.js` → `vrdb-config.js` and fill in your Supabase + TMDB credentials and partner names
3. In your Supabase project, run the SQL from `vrdb-config.example.js` to create the tables and policies
4. Serve locally:

```bash
npm start
```

> **Note:** `vrdb-config.js` is gitignored. Deployed builds inline the same keys in `lib/*-client.js` (publishable anon key + TMDB key — see PRD threat model).

See [movie_tv_backlog_PRD.md](movie_tv_backlog_PRD.md) for the full product spec and [CLAUDE.md](CLAUDE.md) for agent/operational conventions.
