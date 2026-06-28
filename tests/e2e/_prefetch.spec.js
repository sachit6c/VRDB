import { test, expect } from '@playwright/test';

// Verifies the discover deck tops itself up before running dry: page 1 is
// swiped down toward the low-water mark, which should trigger a page=2 fetch
// and push fresh cards in — never reaching the "that's all" empty state.

function pageItems(base, label) {
  return Array.from({ length: 8 }, (_, i) => ({
    id: base + i,
    media_type: 'movie',
    title: `${label} ${i + 1}`,
    poster_path: null,
    overview: `${label} ${i + 1}.`,
    vote_average: 7,
  }));
}

test('deck prefetches the next trending page before emptying', async ({ page }) => {
  const requestedPages = [];

  await page.addInitScript(() => {
    localStorage.setItem('vrdb.me', 'Alice');
    localStorage.setItem('vrdb.partner', 'Bob');
    localStorage.setItem('vrdb.lastTab', 'discover');
  });

  await page.route('**/api.themoviedb.org/**', (r) => {
    const url = r.request().url();
    if (url.includes('/trending/')) {
      const m = url.match(/[?&]page=(\d+)/);
      const pg = m ? Number(m[1]) : 1;
      requestedPages.push(pg);
      const results = pg === 1 ? pageItems(101, 'Page1') : pageItems(201, 'Page2');
      return r.fulfill({ json: { results } });
    }
    return r.fulfill({ json: { results: [] } });
  });
  // Intercept Supabase by REST path, not host: the project URL is a subdomain
  // (…​.supabase.co) that a `**/supabase.co/**` glob doesn't match, which would
  // leak reads/writes to the real DB. All Supabase calls go through /rest/v1/.
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, json: [] }));

  await page.goto('http://localhost:4173/');
  await page.waitForSelector('#discover-stack .card');

  // Swipe down the page-1 deck. Prefetch fires when the post-swipe count hits
  // the low-water mark (5), so a handful of swipes should trigger page 2.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
  }

  // Page 2 was fetched...
  await expect.poll(() => requestedPages.includes(2)).toBe(true);

  // ...and the empty/"that's all" state never showed.
  await expect(page.locator('#discover-empty')).toBeHidden();

  // Keep swiping past where page 1 alone would have run out (8 cards). If the
  // top-up worked, cards are still present.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(350);
  }
  await expect(page.locator('#discover-stack .card').first()).toBeVisible();
  await expect(page.locator('#discover-empty')).toBeHidden();
});
