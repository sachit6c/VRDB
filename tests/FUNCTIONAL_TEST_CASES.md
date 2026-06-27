# VRDB — Functional Test Cases

Manual, end-to-end test cases for the whole app. These complement the automated
unit tests in `tests/*.test.js` (run with `npm test`). The unit tests cover pure
logic and data transforms; the cases below cover the browser flows, realtime sync,
and two-device behavior that need a running app + Supabase + TMDB.

## How to run

```bash
npm start          # serves the static site (default http://localhost:3000)
```

- **Two-user testing:** open the app in two browsers/profiles (e.g. one normal,
  one private window) so you can play both partners. Below, **U1** = first user,
  **U2** = partner. Their names must be entered as mirror images: U1's "me" =
  U2's "partner" and vice-versa.
- Reset a user by clearing site data, or via Settings → reset, or in DevTools:
  `localStorage.clear()` then reload.
- Watch the DevTools **Console** and **Network** tabs for errors / failed calls.

Legend: **P** = precondition, **S** = steps, **E** = expected result.

---

## 1. First-run & identity (`identity.js`, name picker)

### TC-1.1 First visit shows name picker
- P: No `vrdb.me` / `vrdb.partner` in localStorage.
- S: Load the app.
- E: Full-screen name picker overlay with the **VRDB** logo, tagline, and setup form. App shell/tabs are not interactive behind it.

### TC-1.2 Logo is not clipped on narrow screens
- P: First visit.
- S: Open DevTools device toolbar; set width to 320px (and 360/390px).
- E: "VRDB" logo is fully visible — no letters cut off at either edge — and visually centered. (Regression guard for the `clamp()`/letter-spacing fix.)

### TC-1.3 Setup requires both names
- S: Submit with one or both name fields blank / whitespace only.
- E: Submit is blocked (button disabled or error); setup is not completed; no navigation to the app shell.

### TC-1.4 Names are trimmed and persisted
- S: Enter me = "  Alice " and partner = " Bob ", submit; then reload.
- E: Names stored without surrounding spaces; app shell appears; reload does **not** show the picker again.

### TC-1.5 Reset returns to picker
- P: Setup complete.
- S: Use the reset/clear action (Settings) and reload.
- E: Name picker shown again; previous backlog still exists server-side and reappears if the same names are re-entered.

---

## 2. Navigation & routing (`router.js`)

### TC-2.1 Default landing tab
- P: No `vrdb.lastTab` stored.
- S: Complete setup / load app.
- E: **Discover** tab is active; its tab button shows the selected state.

### TC-2.2 Tab switching
- S: Tap each of the four tabs (Discover, Partner, Shared, Mine).
- E: Exactly one screen is visible at a time; the tapped tab is highlighted (`aria-selected=true`); the others are not.

### TC-2.3 Last tab is remembered
- S: Go to **Mine**, reload the page.
- E: App reopens on **Mine** (restored from `vrdb.lastTab`).

### TC-2.4 Corrupt stored tab falls back
- S: Set `localStorage['vrdb.lastTab'] = 'garbage'`, reload.
- E: App opens on **Discover** (invalid value ignored).

---

## 3. Discover — swiping & surfaces (`discover.js`, `card-stack.js`, `suggestions.js`)

### TC-3.1 Trending loads
- P: Setup complete; online.
- S: Open Discover → Trending.
- E: A card stack of trending movies/TV appears (top card interactive); a loading skeleton shows briefly first. Titles already rated by U1 are excluded.

### TC-3.2 Swipe directions map to the right state
- S: On the top card, perform each gesture (drag or arrow keys): right, up, down, left.
- E: While dragging past ~half threshold a decision hint label shows; on release the card flies off and the title is saved as:
  - right → **Watch now**
  - up → **Watch later**
  - down → **Watched**
  - left → **Hell no**
  Verify each by checking the Mine tab / detail sheet afterward.

### TC-3.3 Keyboard accessibility
- S: Tab focus onto the top card; use Arrow keys to decide and Enter/Space to open details.
- E: Arrow keys commit swipes; Enter/Space opens the detail sheet; focus moves to the next card after a keyboard swipe.

### TC-3.4 Below-threshold drag snaps back
- S: Start dragging the card a small distance (<90px) and release.
- E: Card animates back to center; no state is saved.

### TC-3.5 Tap opens details (not a swipe)
- S: Quick tap (no drag) on the top card.
- E: Detail sheet opens for that title; the card stays in the stack.

### TC-3.6 Empty / end-of-deck state
- S: Swipe through all cards in a surface.
- E: Friendly "that's all for today / check back / refresh" message; action buttons hidden.

### TC-3.7 Cold-start gating for personalized surfaces
- P: U1 has rated fewer than 10 titles.
- S: Open **For you** (and **For us**).
- E: Message "Rate N more title(s) to unlock personalized picks" with the correct remaining count; no deck shown.

### TC-3.8 For You after threshold
- P: U1 has rated ≥10 titles.
- S: Open **For you**.
- E: A personalized deck loads; excludes anything U1 already rated and anything either partner marked Hell no.

### TC-3.9 For Us requires a partner & overlap
- P: Both U1 and U2 have ≥10 rated titles with related tastes.
- S: U1 opens **For us**.
- E: Deck contains titles relevant to both; excludes each partner's already-rated and both partners' Hell no titles.

### TC-3.10 Surprise Me
- S: Open **Surprise me** repeatedly via Refresh.
- E: Deck pulls from an under-represented genre; sub-label reads "A genre you rarely pick"; excludes Hell no / already-rated.

### TC-3.11 Refresh forces recompute
- S: On a suggestion surface, tap the refresh button.
- E: Deck is recomputed (not served from cache); new/refreshed items appear.

### TC-3.12 Suggestion caching (24h)
- S: Open For you, note items; switch tabs and return within the day (no refresh).
- E: Same deck returns quickly from cache (no large TMDB fan-out in Network tab).

### TC-3.13 Action buttons mirror swipes
- S: Use the on-screen action buttons under the deck instead of dragging.
- E: Each button flings the top card in the corresponding direction and saves the matching state.

---

## 4. Partner queue (`partner.js`)

### TC-4.1 Shows partner's adds
- P: U2 has added titles to *their* backlog (added_by_me=true, state watch_now/later).
- S: U1 opens **Partner**.
- E: Header reads "What {partner} added"; a swipe deck of those titles appears.

### TC-4.2 Excludes already-reacted titles
- P: U1 has already swiped on one of U2's added titles.
- S: U1 opens Partner.
- E: That title does not appear in the queue.

### TC-4.3 Swiping persists U1's own state
- S: U1 swipes a partner card right/up/down/left.
- E: Saved as U1's state for that title (added_by_me=false); a right/up swipe makes it eligible for a Shared match.

### TC-4.4 Realtime: new partner add appears live
- P: U1 sits on the Partner tab.
- S: U2 adds a new title to their backlog (on the other device).
- E: Within ~1s the new card appears in U1's queue without a manual reload (debounced realtime refresh).

### TC-4.5 Empty state
- P: U2 has added nothing new for U1.
- S: U1 opens Partner.
- E: "{partner} hasn't added anything new for you yet." After clearing the deck: "All caught up — wait for {partner} to add more."

---

## 5. Shared / matches (`shared.js`)

### TC-5.1 Match appears when both want a title
- P: U1 and U2 both set the same title to watch_now or watch_later.
- S: Open **Shared** on either device.
- E: The title appears as a match row with poster, title, and media type.

### TC-5.2 "Both watch now" badge
- P: Both partners set the same title to **watch_now**.
- S: View Shared.
- E: Row shows the "Both watch now" badge. (Only when *both* are watch_now, not watch_later.)

### TC-5.3 Sort order = newest match first
- P: Multiple matches created at different times.
- S: View Shared.
- E: Most recently matched title is at the top (matchedAt = the later of the two partners' update times).

### TC-5.4 Realtime match after swiping (regression)
- P: U1 viewing Shared; one title already wanted by U2.
- S: U2 swipes that title to watch_now/later.
- E: Match appears on U1's Shared tab live, without reload. (Guards commit `d06777b`.)

### TC-5.5 No-match empty state
- P: No overlap between the two backlogs.
- S: View Shared.
- E: "No matches yet — swipe to find common ground!"

### TC-5.6 Opening a match
- S: Tap a match row.
- E: Detail sheet opens showing U1's current state for that title.

---

## 6. Mine / backlog (`mine.js`, `search-modal.js`)

### TC-6.1 Backlog grouped by state
- P: U1 has titles in watch_now / watch_later / watched.
- S: Open **Mine**.
- E: Sections in order Watch now → Watch later → Watched, each with a count; Hell no and Not set are not shown. Empty sections are omitted.

### TC-6.2 Empty backlog
- P: U1 has no watch_now/later/watched titles.
- S: Open Mine.
- E: Empty-state prompt to start adding/swiping.

### TC-6.3 FAB opens search
- S: Tap the add (+) FAB.
- E: Search modal opens, input focused, prompt "Type to search movies and TV."

### TC-6.4 Search debounce & results
- S: Type a query (e.g. "matrix").
- E: After ~300ms, "Searching…" then a result list (movies + TV, no people); result count label is correct; year + media type shown per row.

### TC-6.5 Stale-response guard
- S: Type quickly then change the query before results return.
- E: Only results for the final query are shown (no flicker of stale results).

### TC-6.6 Add a title
- S: Tap a search result's add button.
- E: Button shows loading then ✓ (is-added); title added to U1's backlog as **watch_later**, added_by_me=true; Mine refreshes to include it.

### TC-6.7 Add an already-tracked title
- P: A search result is already in U1's backlog.
- S: Tap its add button.
- E: Marked ✓ without creating a duplicate or overwriting the existing state.

### TC-6.8 Search failure handling
- P: Simulate offline (DevTools → offline) during a search.
- S: Type a query.
- E: Error toast + "Search failed. Check your connection." status; no crash.

### TC-6.9 Tap a backlog card
- S: Tap any card in Mine.
- E: Detail sheet opens with that entry's state preselected.

---

## 7. Detail sheet (`detail-sheet.js`)

### TC-7.1 Renders metadata
- S: Open the detail sheet for any title.
- E: Poster (or 🎬 fallback), title, media type, rating (if any), current state, and overview (or "No description available.").

### TC-7.2 Change state
- S: Tap a different state button (e.g. Watch later → Watch now).
- E: State saved; sheet closes; originating list refreshes to reflect the change.

### TC-7.3 Tapping the current state just closes
- S: Tap the already-active state button.
- E: Sheet closes with no write.

### TC-7.4 Remove from backlog (with confirm)
- S: Tap "Remove from my backlog"; confirm the dialog.
- E: State row deleted; sheet closes; title disappears from Mine/Shared as appropriate. Cancelling the confirm makes no change.

### TC-7.5 Streaming providers (US)
- P: Title with US providers (e.g. a popular movie).
- S: Open detail sheet; wait for the providers section.
- E: "Loading streaming options…" then grouped Stream/Rent/Buy provider logos, "(US)" region label, and JustWatch/TMDB attribution + "Open on TMDB" link.

### TC-7.6 No providers / failure
- P: Title with no US providers, or simulate the providers call failing.
- S: Open detail sheet.
- E: "No US streaming providers listed." (no data) or "Streaming info unavailable." (error) — no crash.

### TC-7.7 Dismissal
- S: Click the backdrop, the ✕ button, and press Escape (one each).
- E: Each closes the sheet.

### TC-7.8 Race guard on providers
- S: Quickly open one title's sheet, close, open a different title before the first providers call resolves.
- E: The first (stale) providers response does not overwrite the second sheet's content.

---

## 8. Theme (`theme.js`, Settings)

### TC-8.1 Default = system
- P: No `vrdb.theme` stored.
- S: Load app under OS light, then OS dark mode.
- E: App follows the OS scheme (no `data-theme` attribute on `<html>`).

### TC-8.2 Explicit light / dark
- S: In Settings, choose Light, then Dark.
- E: `<html data-theme>` is set accordingly and colors update immediately; choice persists across reload.

### TC-8.3 Back to system
- S: Choose System.
- E: `data-theme` attribute removed; app follows OS again.

---

## 9. Cross-cutting

### TC-9.1 Offline detection
- S: Toggle DevTools offline while using the app.
- E: Offline indicator/toast shown; data actions fail gracefully with error toasts rather than silent failure or crashes.

### TC-9.2 Toasts
- S: Trigger an error (e.g. offline add) and a normal info action.
- E: Toast appears top-of-stack, is dismissable by tap, and auto-dismisses; multiple toasts stack.

### TC-9.3 PWA install / offline shell
- P: Served over HTTPS (or localhost).
- S: Check the install prompt; install; relaunch; go offline and reopen.
- E: App is installable (manifest + icons); service worker (`sw.js`) caches the shell so it opens offline (data calls still need network).

### TC-9.4 XSS safety of titles/overviews
- S: (If feasible) add/search a title whose name contains `<`, `>`, `&`, `"` characters.
- E: Text renders literally as characters — no HTML injected anywhere it's shown (cards, rows, detail sheet). Guards `escapeHtml`.

### TC-9.5 Two independent pairs don't collide
- P: Two different name-pairs use the same deployment.
- S: Pair A (Alice/Bob) and Pair B (Carol/Dan) each build backlogs.
- E: Each user only sees their own backlog, their own partner's queue, and their own matches — no leakage across pairs.

---

## Coverage map (automated vs manual)

| Area | Automated (`npm test`) | Manual (this doc) |
|------|------------------------|-------------------|
| TMDB helpers & API params | ✅ `tmdb-client.test.js` | — |
| Identity / setup rules | ✅ `identity.test.js` | TC-1.x |
| Theme logic | ✅ `theme.test.js` | TC-8.x |
| Router state | ✅ `router.test.js` | TC-2.x |
| Swipe direction & escaping | ✅ `card-stack.test.js` | TC-3.2, TC-9.4 |
| Suggestion ranking/cache helpers | ✅ `suggestions.test.js` | TC-3.7–3.12 |
| DB transforms (shared/partner/backlog) | ✅ `db.test.js` | TC-4.x, TC-5.x, TC-6.x |
| Realtime sync | — | TC-4.4, TC-5.4 |
| DOM rendering / gestures / sheets | — | TC-3, TC-6, TC-7 |
| PWA / offline | — | TC-9.1, TC-9.3 |
