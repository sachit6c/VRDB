# VRDB — Product Requirements Document

*A movie & TV backlog app for two.*

## Overview
A mobile-first web app for couples to independently build their own watchlists, discover what they have in common, and create a shared prioritized list of content to watch together. Think Tinder-style swiping meets a shared streaming queue.

**Scope:** Everything in this document is v1.

---

## Core Concept
- Each partner maintains their **own private backlog**
- Partners can **view each other's backlogs**
- When both partners swipe right on the same title, it creates a **shared matched list**
- The shared matched list is the couple's joint watchlist, which they can prioritize and filter

---

## User Types
- **Solo users**: Not supported. This app is exclusively a **partner/couple experience**
- **Couple**: Two users linked together via invite link, invite code, or search

---

## Authentication & Onboarding
- **No login / no OAuth.** Identity is name-based, Pomodoro-style.
- On first visit, the user picks their name from a short list (the two partners). Selection is stored in `localStorage`.
- **Partner pairing is hardcoded** in a config file (e.g. `backlog-config.js`) — the two partner names are baked into the deployment. No invite links, no invite codes, no search.
- **One permanent pair.** No unpair, no re-pair, no multi-partner support. Ever.
- **Threat model:** This is a private 2-person app on an obscure URL. Anyone who knows the URL can pick either name and read/write all data. Acceptable for limited known users — not a mass-market app.
- The app is meaningless to anyone who isn't one of the two configured partners.

---

## Content & Data
- **Content types**: Movies and TV Shows (treated the same in logic, but filterable by type)
- **Data source**: The Movie Database (TMDB) API (free, reliable alternative to IMDb)
  - Movie/show title
  - Poster image
  - Description/synopsis
  - Runtime (movies) / episode count (TV shows)
  - TMDB rating
  - Genre
  - Trending data
- **Search**: Users can search TMDB directly within the app to find and add content

---

## Content States (per user, per title)
Every title in the system has a state **per user**. Defaults to `unseen` (no interaction yet).

| State | Meaning |
|---|---|
| `want_now` | High priority — want to watch soon |
| `want_later` | Interested, not urgent |
| `hell_no` | Not interested, hide from suggestions |
| `watched` | This user has personally seen it (alone or before pairing) |
| `unseen` | Default — no action taken |

States are **mutually exclusive** and **always editable** — nothing is permanent except the act of watching. A user can change any state at any time from their backlog detail view.

---

## The Three Lists

### 1. My Backlog
- Content the user has added themselves
- **Fully visible to their partner** (no real privacy — backlogs are conceptually "yours" but readable by your partner)
- Only the owner can add/remove items from their own backlog
- Shows their own swipe states

### 2. Partner's Backlog (Read + Swipe)
- Content your partner has added
- You can swipe on it (right = want to watch, left = not interested)
- Swiping right on a partner's content + partner having added it = **match → goes to shared list**

### 3. Shared Matched List (Joint)
- Content both partners have swiped right on
- Real-time updates when one partner makes changes
- Filterable by:
  - Content type (Movie / TV Show)
  - TMDB rating
- Manually reorderable by priority (either partner can reorder, updates in real time)
- Each item can be marked as:
  - **Watched Together**
  - **Watched Alone** (by which partner)
  - Unmarked (not yet watched)
- Once marked watched, it stays on the list but is marked accordingly

---

## Card Gestures (Tinder-style)

Applied uniformly on all card surfaces (partner's backlog, suggestion feeds, search results).

| Gesture | Action |
|---|---|
| Swipe **right** | Set state to `want_later` |
| Swipe **left** | Set state to `hell_no` |
| Swipe **up** | Set state to `want_now` |
| Swipe **down** | Set state to `watched` (personal — "I've seen it") |
| Single tap | Open detail modal (no state change) |
| Double tap | Play trailer (TMDB → YouTube) |
| Tap **Undo** button (bottom of screen, Tinder-style) | Revert the last swipe |

**Discoverability:**
- One-time onboarding overlay on first visit showing all 4 swipe directions with labels.
- Persistent `?` help icon re-shows the gesture legend.
- Visible action button row under every card (✕ → ▲ ▼ ▶︎) — buttons mirror gestures, aid discoverability, and provide desktop fallback.
- Keyboard shortcuts on desktop: arrow keys mirror swipes, Enter opens details, Space plays trailer.

**Detail modal (single tap):** Uses labeled buttons only (no swiping inside the modal). Same 4 state actions plus a close button.

## Swiping & Matching Logic

- All swiping happens on **card surfaces** — not on your own backlog (own backlog uses tap-to-edit).
- A **match** occurs when both partners have state ∈ {`want_now`, `want_later`} on the same title.
- **Default sort on shared list:** Items where *either* partner has `want_now` rank higher than items where both have `want_later`. Within each tier, newest matches first. Users can still manually reorder.
- Matches appear in the **Shared Matched List** — discovered when opening the shared list (no push notification).
- If both partners independently mark a title `watched`, the shared list auto-promotes it to **"Watched Together"** (no prompt needed).
- If one partner has `watched` and the other has a `want_*` state, no match; the wanting partner sees a subtle note on the card: "Your partner has seen this."

### Hell No Rules
- If you mark something `hell_no`, it is **hidden from suggestion cards** shown to your partner.
- It **is visible** in a dedicated "Rejected" list your partner can browse if they choose — but never surfaces in cards/suggestions.
- Always reversible from the backlog detail view.

### Watched Rules
- Stays visible, marked as watched.
- Not suggested again to that user.
- Auto-promotes to "Watched Together" on the shared list when both partners mark it watched.

---

## Suggestions Engine

### Algorithm
Pure TMDB API — no ML, no backend service.

- **For You (Personal):** For each title in the user's `want_now`, `want_later`, or `watched` lists, fetch TMDB's `/recommendations` and `/similar` endpoints. Pool results, dedupe, score by frequency. Filter out anything the user has already interacted with and anything either partner marked `hell_no`.
- **For Us (Partnership):** Run the same algorithm for both partners separately, then rank by titles that appear in **both** pools. Tiebreak on combined frequency score.
- **Trending:** TMDB `/trending/all/week`, filtered for `hell_no` exclusions from either partner.
- **Surprise Me:** Pick a genre that is underrepresented in the combined backlogs of both partners. Surface a top-rated TMDB title in that genre that neither partner has interacted with.

### Caching & Refresh
- Suggestions are computed **once per day per surface** and cached in a Supabase `suggestions_cache` table with a `generated_at` timestamp.
- Each surface holds a **fixed deck of ~20 cards**. When swiped through, the UI shows "That's all for today — check back tomorrow" or offers a manual **Refresh** button to force recompute.

### Cold Start
- Until a user has interacted with **≥10 titles**, the "For You" and "For Us" tabs show a friendly empty state: "Rate at least 10 titles to unlock personalized suggestions." Trending and Surprise Me remain available from day one.

### UI
- A single **Discover** tab with a segmented control at the top: `Trending | For Us | For You | Surprise Me`. Same card gestures on all sub-tabs.

---

## Content Detail View (Single Tap on Card)
Opens a modal with:
- Poster
- Title
- Description/synopsis
- TMDB rating
- Runtime / episode info
- Genre tags
- Trailer link
- **Action buttons** for all 4 states (no swiping inside modal)
- Close button

---

## Filtering & Discovery
- Filter shared list by: **Movie vs TV Show**, **TMDB Rating**
- Browse content by: **Trending**, **Personalized Suggestions**, **Partner's Backlog**
- "Surprise Me" button for serendipitous discovery

---

## Real-Time Features
- Shared matched list priority updates in **real time** when either partner reorders
- Watched status updates in real time

---

## Information Architecture

Four-tab bottom navigation (mobile-first).

| Tab | Contents |
|---|---|
| 🎬 **Discover** | Segmented control: `Trending \| For Us \| For You \| Surprise Me`. Card-swiping surface. |
| 💞 **Partner** | Partner's backlog as a card-swiping surface. Sub-tab toggle: `New Cards \| Rejected` (browse what partner marked `hell_no`). |
| ⭐ **Shared** | Matched list. Filters by media type and rating. Manual reorder. Watched section at bottom. |
| 📚 **Mine** | Your backlog as a list view (not cards). Sub-sections: To Watch, Watched, Rejected. Tap any item to edit state. Search-to-add via FAB `+` button. Gear icon top-right opens settings. |

### Badges
In-app only (no push). Computed on app open:
- **Partner** tab: count of new cards partner added since you last visited.
- **Shared** tab: count of new matches since you last visited.

### Empty States
- Discover / Trending: works immediately from TMDB.
- Discover / For Us, For You: "Rate 10 titles to unlock personalized suggestions."
- Partner: "Your partner hasn't added anything yet."
- Shared: "No matches yet — start swiping!"
- Mine: "Search to add your first title."

### Settings (gear icon on Mine tab)
- Switch user (overrides localStorage in case the wrong name is set)
- Re-show the gesture legend / help overlay

## Key UX Principles
- Mobile-first web app (responsive, works great on phone browser)
- Card-based swiping UI (Tinder-style) with 4-direction swipes + tap actions
- **Undo button** at bottom of screen (Tinder-style) reverts the most recent swipe
- Visible button row under every card for discoverability and desktop use
- Keep it simple — no in-app messaging, no group features, no notes on rejections
- Separate lists for My Backlog, Partner's Backlog, and Shared List
- No solo user mode

---

## Edge Cases & Behaviors

1. **Both partners add the same title independently.** Instant match — appears in Shared immediately. Neither sees it on their Partner-tab swipe surface.
2. **`hell_no` persists** even if partner later removes the title from their backlog. Taste hasn't changed.
3. **Partner adds a title you've already marked `hell_no`.** It never appears on your Partner-tab surface. Partner sees a small indicator on their backlog item: "Partner passed on this."
4. **TMDB metadata refresh.** Cached forever in MVP. Add a 30-day TTL later if it becomes a problem (`cached_at` already exists).
5. **Remove vs `hell_no`.** Two distinct actions:
   - **Remove from backlog** = delete the `user_title_states` row entirely (state returns to `unseen`). For "added by mistake" cases. Confirmation required.
   - **`hell_no`** = explicit rejection, hides from suggestions, persists.
6. **TV shows = series-level only in MVP.** No season/episode tracking. `watched` means "I've seen this show (whatever that means to me)."
7. **Movie sequels / franchises** treated as separate titles per TMDB. No grouping.
8. **Offline / Supabase down.** Read-only graceful degradation: show last cached state, disable swipes, toast "Connection lost." No offline write queue.
9. **Multi-device per user.** Same name in localStorage on each device. Supabase realtime keeps them in sync. Last-write-wins per row.
10. **Search results that already have state.** Display with a state badge ("Already in your backlog: Want Later"). Tap opens detail modal to edit.
11. **Suggestions daily refresh.** Lazy — on app open, if `generated_at > 24h`, recompute on the client. No backend cron.

## Visual Identity

**Vibe:** Cinema/theater — deep blacks, warm accents, poster art as hero on every card.

### Light Mode
| Token | Value |
|---|---|
| Background | `#FAF7F2` (warm off-white) |
| Surface (cards) | `#FFFFFF` with soft shadow |
| Accent | `#B8231C` (curtain red) |
| Text | `#1A1A1A` |

### Dark Mode
| Token | Value |
|---|---|
| Background | `#0A0A0A` (theater dark) |
| Surface (cards) | `#1C1C1C` |
| Accent | `#E8B547` (marquee gold) |
| Text | `#F0F0F0` |

### Typography
- **Display / titles:** Bebas Neue (Google Fonts, cinema-poster feel)
- **Body:** system sans-serif

### Cards
- **Full-viewport bleed**, Tinder-style.
- Poster fills top **70%**.
- Bottom **30%** gradient overlay with title, rating, and tap-for-more affordance.

### Theme Toggle
- Defaults to `prefers-color-scheme`.
- Manual override in Settings (gear icon on Mine tab).

## Onboarding & First Launch
1. First visit → **Name picker** (choose which of the two configured names you are). Stored in `localStorage`.
2. One-time **gesture tutorial overlay** showing the 4 swipe directions + tap actions.
3. Land on **Discover → Trending** sub-tab (works immediately, no rating threshold).

## Out of Scope (for now)
- Group watch features
- In-app chat or comments
- Push notifications (matches discovered on opening app)
- "Currently Watching" state
- Multiple partners

---

## Technical Decisions
- **Stack:** Vanilla JS + ES modules, no build step (mirrors the Pomodoro app pattern)
- **Hosting:** Vercel, auto-deploy on push to `main`
- **Database + realtime:** Supabase (publishable anon key inlined client-side, RLS for table-level safety)
- **Content data:** TMDB API
  - API key **inlined client-side** — same threat model as the obscure-URL auth. Accept the risk; revisit only if abuse occurs.
  - Free tier is sufficient for 2 users.
- **Realtime scope:** Shared matched list + swipes on partner's backlog. Own-backlog edits don't need realtime.
- **Conflict handling on shared list reorder:** Last-write-wins. Two partners reordering at the same second is vanishingly rare for a 2-user app; not worth CRDT complexity.
- **Styling:** CSS with `clamp()` for fluid responsive layout (Pomodoro pattern)

## Data Model (Supabase)

```sql
-- One row per title ever added by either partner. Cached TMDB metadata.
create table titles (
  tmdb_id       integer primary key,
  media_type    text not null,        -- 'movie' | 'tv'
  title         text not null,
  poster_path   text,
  overview      text,
  rating        numeric,
  runtime       integer,              -- minutes (movies)
  episode_count integer,              -- (tv)
  genres        jsonb,                -- array of genre names
  trailer_url   text,
  cached_at     timestamptz default now()
);

-- Per-user, per-title state. Heart of the app.
-- Absence of a row = `unseen` (not stored explicitly).
create table user_title_states (
  user_name    text not null,         -- from config: 'sachit' | 'partner'
  tmdb_id      integer not null,
  state        text not null,         -- 'want_now' | 'want_later' | 'hell_no' | 'watched'
  added_by_me  boolean not null,      -- true if this user added the title to their backlog
  updated_at   timestamptz default now(),
  primary key (user_name, tmdb_id),
  foreign key (tmdb_id) references titles(tmdb_id)
);

-- Manual reorder of the shared matched list. Items without a row use default sort.
create table shared_list_order (
  tmdb_id    integer primary key,
  position   integer not null,
  updated_at timestamptz default now(),
  foreign key (tmdb_id) references titles(tmdb_id)
);

-- Cached suggestion decks, refreshed daily.
create table suggestions_cache (
  surface      text primary key,      -- 'for_you_sachit' | 'for_you_partner' | 'for_us' | 'trending' | 'surprise'
  tmdb_ids     jsonb not null,        -- array of ~20 ids in order
  generated_at timestamptz default now()
);
```

### Derived Concepts (not stored)
- **My Backlog** = titles where I have `added_by_me = true` OR any non-`hell_no` state.
- **Partner's Backlog (swipe surface)** = titles where partner has `added_by_me = true` AND I have no state yet.
- **Match** = both partners have state ∈ {`want_now`, `want_later`} on the same `tmdb_id`.
- **Watched Together** = both partners have `state = 'watched'` on the same `tmdb_id`.
- **Rejected list (per partner)** = titles where that partner has `state = 'hell_no'`.

### RLS
- Permissive: anon role can read/write all rows on all four tables.
- Documented as **intentional** for a 2-user trusted-URL app. Tighten only if abuse occurs.

---

## Folder Reference
Project folder on desktop: `movie_TV_backlog`
