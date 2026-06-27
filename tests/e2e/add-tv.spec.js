// tests/e2e/add-tv.spec.js
// Reproduces "can't add TV shows to my list" and guards the fix.
//
// The live Supabase project is mocked at the REST layer so the test runs
// without a database. Two scenarios:
//   1. Buggy DB  — `titles` rejects media_type='tv' with a check-constraint
//      violation (code 23514). The add must fail visibly. This reproduces the
//      user's bug and is exactly what migration 0003 fixes server-side.
//   2. Fixed DB  — `titles` accepts the tv row. The add must succeed (✓).
// In both cases we assert the client emits a correct payload (media_type:'tv',
// state:'watch_later'), proving the client code is not the cause.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:4173';

const TV_ITEM = {
  id: 1399,
  media_type: 'tv',
  name: 'Game of Thrones',
  poster_path: '/got.jpg',
  overview: 'Nine noble families fight for control of the lands of Westeros.',
  vote_average: 8.4,
  first_air_date: '2011-04-17',
};

// Boot already "logged in" so we skip the name-setup screen, and land on Mine.
async function bootAsUser(page) {
  await page.addInitScript(() => {
    localStorage.setItem('vrdb.me', 'Akshita');
    localStorage.setItem('vrdb.partner', 'Soumit');
    localStorage.setItem('vrdb.lastTab', 'mine');
  });
}

// Intercept TMDB + Supabase REST. Returns a capture object whose `titleUpserts`
// / `stateUpserts` arrays collect the request bodies the client sent.
async function mockBackend(page, { rejectTvTitles = false } = {}) {
  const capture = { titleUpserts: [], stateUpserts: [] };

  await page.route('**/api.themoviedb.org/**', (route) => {
    const url = route.request().url();
    if (url.includes('/search/multi')) {
      return route.fulfill({ json: { page: 1, total_pages: 1, results: [TV_ITEM] } });
    }
    // trending / recommendations / anything else: empty
    return route.fulfill({ json: { page: 1, total_pages: 1, results: [] } });
  });

  await page.route('**/rest/v1/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const table = url.pathname.split('/rest/v1/')[1].split('?')[0];

    // Reads: getMyState (single), listMyBacklog / counts (array).
    if (method === 'GET' || method === 'HEAD') {
      const accept = req.headers()['accept'] || '';
      if (accept.includes('pgrst.object')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: '[]',
      });
    }

    // Writes (upsert => POST).
    const body = req.postDataJSON();
    const rows = Array.isArray(body) ? body : [body];

    if (table === 'titles') {
      capture.titleUpserts.push(...rows);
      if (rejectTvTitles && rows.some((r) => r.media_type === 'tv')) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: '23514',
            message:
              'new row for relation "titles" violates check constraint "titles_media_type_check"',
            details: 'Failing row contains (..., tv, ...).',
            hint: null,
          }),
        });
      }
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(rows) });
    }

    if (table === 'user_title_states') {
      capture.stateUpserts.push(...rows);
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }

    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  return capture;
}

async function searchAndClickTv(page) {
  await expect(page.locator('#screen-mine')).toHaveClass(/is-active/);
  await page.locator('#mine-fab').click();
  await expect(page.locator('#search-modal')).toBeVisible();
  await page.locator('#search-input').fill('game of thrones');
  const card = page.locator('.result-card').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('TV');
  await card.click();
  return card;
}

test('buggy DB: adding a TV show fails when titles rejects media_type=tv', async ({ page }) => {
  await bootAsUser(page);
  const capture = await mockBackend(page, { rejectTvTitles: true });
  await page.goto(BASE + '/');

  const card = await searchAndClickTv(page);

  // User-visible failure (the reported symptom).
  await expect(page.locator('#search-status')).toHaveText('Add failed. Try again.');
  await expect(card).not.toHaveClass(/is-added/);

  // The client *did* send a correct tv payload — so the fault is server-side.
  expect(capture.titleUpserts.some((r) => r.tmdb_id === 1399 && r.media_type === 'tv')).toBe(true);
});

test('fixed DB: adding a TV show succeeds when titles accepts media_type=tv', async ({ page }) => {
  await bootAsUser(page);
  const capture = await mockBackend(page, { rejectTvTitles: false });
  await page.goto(BASE + '/');

  const card = await searchAndClickTv(page);

  // Success: card flips to the added/✓ state.
  await expect(card).toHaveClass(/is-added/);
  await expect(card.locator('.result-card__add')).toHaveText('✓');

  // Correct payloads went out: tv title + watch_later state.
  expect(capture.titleUpserts.some((r) => r.tmdb_id === 1399 && r.media_type === 'tv')).toBe(true);
  expect(capture.stateUpserts.some((r) => r.tmdb_id === 1399 && r.state === 'watch_later')).toBe(true);
});
