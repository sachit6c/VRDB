// tests/partner.test.js
// Behavior of the Partner swiping screen.
import { test, before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, simulateTap } from './helpers/jsdom-env.js';

installDom();
localStorage.setItem('vrdb.me', 'Alice');
localStorage.setItem('vrdb.partner', 'Bob');

// ── Configurable fakes ────────────────────────────────────────────────────────
let queueToReturn = [];
let queueError = null;
const recorded = [];     // setMyState calls
let lastOpened = null;   // openDetailSheet arg

const STATES = {
  WATCH_NOW: 'watch_now', WATCH_LATER: 'watch_later',
  WATCHED: 'watched', HELL_NO: 'hell_no', UNSEEN: 'unseen',
};

mock.module('../lib/supabase-client.js', {
  namedExports: { supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }) } },
});
mock.module('../lib/db.js', {
  namedExports: {
    listPartnerQueue: async () => { if (queueError) throw queueError; return queueToReturn; },
    setMyState: async (args) => { recorded.push(args); },
    STATES,
  },
});
mock.module('../lib/detail-sheet.js', {
  namedExports: { openDetailSheet: (e) => { lastOpened = e; } },
});

const partner = await import('../lib/partner.js');

const item = (id, extra = {}) => ({
  id, media_type: 'movie', title: `M${id}`, name: null,
  poster_path: `/p${id}.jpg`, overview: `plot ${id}`, vote_average: 7,
  _cachedTitle: { tmdb_id: id, media_type: 'movie', title: `M${id}`, poster_path: `/p${id}.jpg` },
  _partnerState: 'watch_now', ...extra,
});

const stack = () => document.getElementById('partner-stack');
const emptyWrap = () => document.getElementById('partner-empty-wrap');
const msg = () => emptyWrap().querySelector('[data-msg]').textContent;

before(() => partner.initPartner());

beforeEach(() => {
  queueToReturn = [];
  queueError = null;
  recorded.length = 0;
  lastOpened = null;
});

test('partner label shows the partner name', () => {
  assert.equal(document.getElementById('partner-label').textContent, 'What Bob added');
});

test('empty queue shows the empty state and hides the stack', async () => {
  queueToReturn = [];
  await partner.refreshPartner();
  assert.equal(emptyWrap().classList.contains('hidden'), false);
  assert.equal(stack().classList.contains('hidden'), true);
  assert.match(msg(), /Bob hasn't added anything new/);
});

test('non-empty queue mounts a card stack', async () => {
  queueToReturn = [item(1), item(2)];
  await partner.refreshPartner();
  assert.ok(stack().querySelector('.card'));
  assert.equal(emptyWrap().classList.contains('hidden'), true);
});

test('action buttons map to the correct states (addedByMe=false)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    queueToReturn = [item(1), item(2), item(3), item(4)];
    await partner.refreshPartner();
    const click = (dir) => {
      document.querySelector(`#partner-actions [data-action="${dir}"]`).click();
      mock.timers.tick(300); // let the fling animation finish before the next
    };
    click('right'); click('up'); click('down'); click('left');
    assert.deepEqual(recorded.map((r) => r.state), ['watch_now', 'watch_later', 'watched', 'hell_no']);
    assert.deepEqual(recorded.map((r) => r.tmdbId), [1, 2, 3, 4]);
    assert.ok(recorded.every((r) => r.addedByMe === false && r.me === 'Alice'));
  } finally {
    mock.timers.reset();
  }
});

test('tapping a card opens the detail sheet with the cached title', async () => {
  queueToReturn = [item(5)];
  await partner.refreshPartner();
  simulateTap(stack().querySelector('.card:last-child'));
  assert.ok(lastOpened);
  assert.equal(lastOpened.title, queueToReturn[0]._cachedTitle);
  assert.equal(lastOpened.state, STATES.UNSEEN);
});

test('load error shows the connection message', async () => {
  queueError = new Error('network');
  await partner.refreshPartner();
  assert.match(msg(), /Could not load/);
  assert.equal(stack().classList.contains('hidden'), true);
});
