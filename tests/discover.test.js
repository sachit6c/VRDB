// tests/discover.test.js
// Behavior of the Discover screen: surfaces, cold-start gating, swipe/tap wiring.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, simulateTap } from './helpers/jsdom-env.js';

installDom();
localStorage.setItem('vrdb.me', 'Alice');
localStorage.setItem('vrdb.partner', 'Bob');

// ── Configurable test state (closed over by the mocks) ───────────────────────
let trendingToReturn = [];
let statedIds = [];
let statedCount = 0;
let forYouItems = [];
let forUsItems = [];
let surpriseItems = [];
let throwForYou = false;
let throwTrending = false;

let getTrendingCalls = 0;
let getForYouCalls = 0;
let getForUsCalls = 0;
let getSurpriseCalls = 0;
const setMyStateCalls = [];
let lastOpened = null;

const item = (id, extra = {}) => ({
  id, media_type: 'movie', title: `T${id}`, poster_path: `/p${id}.jpg`,
  vote_average: 7, overview: `o${id}`, ...extra,
});

mock.module('../lib/db.js', {
  namedExports: {
    upsertTitle: async () => {},
    setMyState: async (args) => { setMyStateCalls.push(args); },
    getMyState: async () => null,
    getMyStatedIds: async () => new Set(statedIds),
    countMyStated: async () => statedCount,
    STATES: { WATCH_NOW: 'watch_now', WATCH_LATER: 'watch_later', WATCHED: 'watched', HELL_NO: 'hell_no', UNSEEN: 'unseen' },
  },
});

mock.module('../lib/tmdb-client.js', {
  namedExports: {
    getTrending: async () => { getTrendingCalls++; if (throwTrending) throw new Error('trend boom'); return trendingToReturn; },
    titleOf: (i) => i.title || i.name || '(untitled)',
    posterUrl: (p, s) => (p ? `https://img/${s}${p}` : null),
    yearOf: () => '2020',
  },
});

mock.module('../lib/suggestions.js', {
  namedExports: {
    getForYou: async () => { getForYouCalls++; if (throwForYou) throw new Error('fy boom'); return { items: forYouItems }; },
    getForUs: async () => { getForUsCalls++; return { items: forUsItems }; },
    getSurpriseMe: async () => { getSurpriseCalls++; return { items: surpriseItems }; },
  },
});

mock.module('../lib/detail-sheet.js', {
  namedExports: { openDetailSheet: (e) => { lastOpened = e; } },
});

const discover = await import('../lib/discover.js');

const stackEl = () => document.getElementById('discover-stack');
const emptyEl = () => document.getElementById('discover-empty');
const subEl = () => document.getElementById('discover-sub');
const actionsEl = () => document.getElementById('discover-actions');
const tab = (surface) => document.querySelector(`.segmented--tabs [data-surface="${surface}"]`);
const flush = () => new Promise((r) => setTimeout(r, 15));

discover.initDiscover();

beforeEach(async () => {
  trendingToReturn = []; statedIds = []; statedCount = 0;
  forYouItems = []; forUsItems = []; surpriseItems = [];
  throwForYou = false; throwTrending = false;
  setMyStateCalls.length = 0; lastOpened = null;
  // Reset to the trending surface between tests (switching surface needs a tab click).
  if (tab('trending').getAttribute('aria-selected') !== 'true') {
    tab('trending').click();
    await flush();
  }
});

test('trending mounts a stack and filters out already-stated ids', async () => {
  trendingToReturn = [item(1), item(2), item(3)];
  statedIds = [2];
  await discover.refreshDiscover({ force: true });
  const cards = stackEl().querySelectorAll('.card');
  assert.equal(cards.length, 2); // id 2 filtered out
  assert.equal(subEl().textContent, 'Trending this week');
});

test('empty trending shows the end-of-deck message', async () => {
  trendingToReturn = [];
  await discover.refreshDiscover({ force: true });
  assert.match(emptyEl().textContent, /That's all for today/);
  assert.ok(emptyEl().classList.contains('hidden') === false);
});

test('for_you cold-start gates with the correct remaining count', async () => {
  statedCount = 3; // < 10
  tab('for_you').click();
  await flush();
  assert.match(emptyEl().textContent, /Rate 7 more titles to unlock/);
  assert.equal(stackEl().querySelectorAll('.card').length, 0);
  assert.equal(getForYouCalls, 0);
  assert.equal(subEl().textContent, 'Picks just for you');
});

test('cold-start uses singular "title" when one away', async () => {
  statedCount = 9;
  tab('for_you').click();
  await flush();
  assert.match(emptyEl().textContent, /Rate 1 more title to unlock/);
});

test('for_you past the threshold loads personalized picks', async () => {
  statedCount = 10;
  forYouItems = [item(11), item(12)];
  tab('for_you').click();
  await flush();
  assert.equal(getForYouCalls >= 1, true);
  assert.equal(stackEl().querySelectorAll('.card').length, 2);
});

test('for_us with a partner loads the couple deck', async () => {
  statedCount = 12;
  forUsItems = [item(21)];
  tab('for_us').click();
  await flush();
  assert.equal(getForUsCalls >= 1, true);
  assert.equal(subEl().textContent, 'Picks for both of you');
  assert.equal(stackEl().querySelectorAll('.card').length, 1);
});

test('surprise surface pulls the surprise deck', async () => {
  surpriseItems = [item(31), item(32)];
  tab('surprise').click();
  await flush();
  assert.equal(getSurpriseCalls >= 1, true);
  assert.equal(subEl().textContent, 'A genre you rarely pick');
  assert.equal(stackEl().querySelectorAll('.card').length, 2);
});

test('action buttons persist a swipe with the mapped state', async () => {
  trendingToReturn = [item(1), item(2)];
  await discover.refreshDiscover({ force: true });
  actionsEl().querySelector('[data-action="right"]').click();
  await flush();
  assert.equal(setMyStateCalls.length, 1);
  assert.equal(setMyStateCalls[0].state, 'watch_now');
  assert.equal(setMyStateCalls[0].addedByMe, false);
  assert.equal(setMyStateCalls[0].tmdbId, 1);
});

test('left action maps to hell_no', async () => {
  trendingToReturn = [item(5)];
  await discover.refreshDiscover({ force: true });
  actionsEl().querySelector('[data-action="left"]').click();
  await flush();
  assert.equal(setMyStateCalls[0].state, 'hell_no');
});

test('tapping a card opens the detail sheet', async () => {
  trendingToReturn = [item(7)];
  await discover.refreshDiscover({ force: true });
  simulateTap(stackEl().querySelector('.card:last-child'));
  await flush();
  assert.ok(lastOpened);
  assert.equal(lastOpened.title.tmdb_id, 7);
  assert.equal(lastOpened.state, 'unseen');
});

test('refresh button reloads the current surface', async () => {
  trendingToReturn = [item(1)];
  await discover.refreshDiscover({ force: true });
  const before = getTrendingCalls;
  document.getElementById('discover-refresh').click();
  await flush();
  assert.ok(getTrendingCalls > before);
});

test('a load error surfaces the connection message', async () => {
  statedCount = 10;
  throwForYou = true;
  tab('for_you').click();
  await flush();
  assert.match(emptyEl().textContent, /Could not load suggestions/);
});

test('clicking the already-active surface tab is a no-op', async () => {
  trendingToReturn = [item(1)];
  await discover.refreshDiscover({ force: true });
  const before = getTrendingCalls;
  tab('trending').click(); // already selected
  await flush();
  assert.equal(getTrendingCalls, before);
});
