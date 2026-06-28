// tests/detail-sheet.test.js
// DOM-level coverage of the title detail bottom sheet.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, setConfirm } from './helpers/jsdom-env.js';

installDom();
localStorage.setItem('vrdb.me', 'Alice');

// ── Controllable fakes ────────────────────────────────────────────────────────
const setMyStateCalls = [];
const removeMyStateCalls = [];
let providersResult = { link: null, flatrate: [], rent: [], buy: [] };
let providersError = false;

mock.module('../lib/db.js', {
  namedExports: {
    STATES: { WATCH_NOW: 'watch_now', WATCH_LATER: 'watch_later', WATCHED: 'watched', HELL_NO: 'hell_no', UNSEEN: 'unseen' },
    STATE_LABELS: { watch_now: 'Watch now', watch_later: 'Watch later', watched: 'Watched', hell_no: 'Hell no', unseen: 'Not set' },
    setMyState: async (args) => { setMyStateCalls.push(args); },
    removeMyState: async (args) => { removeMyStateCalls.push(args); },
  },
});

mock.module('../lib/tmdb-client.js', {
  namedExports: {
    posterUrl: (p, s) => (p ? `https://img/${s}${p}` : null),
    providerLogoUrl: (p) => (p ? `https://logo${p}` : null),
    getWatchProviders: async () => { if (providersError) throw new Error('nope'); return providersResult; },
    genresOf: () => [],
    getTitleDetails: async () => ({ spoken_languages: [] }),
    spokenLanguagesOf: (d) => (d?.spoken_languages ?? []).map((l) => l.english_name || l.name),
    googleSearchUrl: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
  },
});

const ds = await import('../lib/detail-sheet.js');

let onChangeCount = 0;
ds.initDetailSheet({ onChange: () => { onChangeCount++; } });

const sheet = document.getElementById('detail-sheet');
const panel = sheet.querySelector('.detail__panel');
const flush = () => new Promise((r) => setTimeout(r, 0));
const open = (entry) => ds.openDetailSheet(entry);
const entry = (titleOver = {}, entryOver = {}) => ({
  state: 'watch_later',
  addedByMe: false,
  title: { tmdb_id: 1, media_type: 'movie', title: 'The Matrix', poster_path: '/m.jpg', overview: 'Neo wakes up.', rating: 8.23, ...titleOver },
  ...entryOver,
});

beforeEach(() => {
  setMyStateCalls.length = 0;
  removeMyStateCalls.length = 0;
  onChangeCount = 0;
  providersResult = { link: null, flatrate: [], rent: [], buy: [] };
  providersError = false;
  setConfirm(true);
  sheet.classList.add('hidden');
});

// ── Rendering ─────────────────────────────────────────────────────────────────
test('renders metadata, rating, current state, and four action buttons', () => {
  open(entry());
  assert.equal(sheet.classList.contains('hidden'), false);
  assert.equal(panel.querySelector('.detail__title').textContent, 'The Matrix');
  assert.match(panel.querySelector('.detail__sub').textContent, /Movie/);
  assert.match(panel.querySelector('.detail__sub').textContent, /★ 8\.2/); // rounded to 1dp
  assert.match(panel.querySelector('.detail__state').textContent, /Watch later/);
  assert.ok(panel.querySelector('.detail__poster img'));

  const btns = panel.querySelectorAll('.detail__state-btn');
  assert.equal(btns.length, 4);
  const pressed = [...btns].filter((b) => b.getAttribute('aria-pressed') === 'true');
  assert.equal(pressed.length, 1);
  assert.equal(pressed[0].dataset.state, 'watch_later');
});

test('poster fallback emoji and default overview when missing', () => {
  open(entry({ poster_path: null, overview: null }));
  assert.ok(panel.querySelector('.detail__poster--empty'));
  assert.match(panel.querySelector('.detail__overview').textContent, /No description available\./);
});

test('tv label and no rating star when rating absent', () => {
  open(entry({ media_type: 'tv', rating: null }));
  const sub = panel.querySelector('.detail__sub').textContent;
  assert.match(sub, /TV/);
  assert.doesNotMatch(sub, /★/);
});

test('unknown state falls back to the raw state string', () => {
  open(entry({}, { state: 'weird' }));
  assert.match(panel.querySelector('.detail__state').textContent, /weird/);
});

test('escapes HTML in the title', () => {
  open(entry({ title: 'A & <b>x</b>' }));
  assert.equal(panel.querySelector('.detail__title').textContent, 'A & <b>x</b>');
  assert.equal(panel.querySelector('.detail__title').children.length, 0); // not parsed as markup
});

// ── Providers ─────────────────────────────────────────────────────────────────
test('renders Stream/Rent/Buy groups, region, link, and logos', async () => {
  providersResult = {
    link: 'http://tmdb/x',
    flatrate: [{ provider_name: 'Netflix', logo_path: '/n.png' }],
    rent: [{ provider_name: 'Apple TV' }],
    buy: [],
  };
  open(entry());
  await flush();
  const section = panel.querySelector('.detail__providers');
  assert.match(section.textContent, /Where to watch/);
  assert.match(section.textContent, /\(US\)/);
  assert.ok(section.querySelector('.detail__providers-link'));
  const labels = [...section.querySelectorAll('.detail__providers-label')].map((e) => e.textContent);
  assert.deepEqual(labels, ['Stream', 'Rent']); // empty Buy filtered out
  assert.ok(section.querySelector('img[src="https://logo/n.png"]'));
});

test('shows "no providers" when all lists are empty', async () => {
  open(entry());
  await flush();
  assert.match(panel.querySelector('.detail__providers').textContent, /No US streaming providers listed\./);
});

test('shows "unavailable" when the providers call rejects', async () => {
  providersError = true;
  open(entry());
  await flush();
  assert.match(panel.querySelector('.detail__providers').textContent, /Streaming info unavailable\./);
});

// ── State actions ─────────────────────────────────────────────────────────────
test('selecting a different state saves, notifies, and closes', async () => {
  open(entry()); // current = watch_later
  panel.querySelector('.detail__state-btn[data-state="watch_now"]').click();
  await flush();
  assert.equal(setMyStateCalls.length, 1);
  assert.deepEqual(setMyStateCalls[0], { me: 'Alice', tmdbId: 1, state: 'watch_now', addedByMe: false });
  assert.equal(onChangeCount, 1);
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('passes through addedByMe when set', async () => {
  open(entry({}, { addedByMe: true }));
  panel.querySelector('.detail__state-btn[data-state="watched"]').click();
  await flush();
  assert.equal(setMyStateCalls[0].addedByMe, true);
});

test('tapping the current state just closes without saving', async () => {
  open(entry());
  panel.querySelector('.detail__state-btn[data-state="watch_later"]').click();
  await flush();
  assert.equal(setMyStateCalls.length, 0);
  assert.equal(sheet.classList.contains('hidden'), true);
});

// ── Remove ────────────────────────────────────────────────────────────────────
test('remove (confirmed) deletes, notifies, and closes', async () => {
  setConfirm(true);
  open(entry());
  panel.querySelector('.detail__remove').click();
  await flush();
  assert.equal(removeMyStateCalls.length, 1);
  assert.deepEqual(removeMyStateCalls[0], { me: 'Alice', tmdbId: 1 });
  assert.equal(onChangeCount, 1);
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('remove (cancelled) does nothing', async () => {
  setConfirm(false);
  open(entry());
  panel.querySelector('.detail__remove').click();
  await flush();
  assert.equal(removeMyStateCalls.length, 0);
  assert.equal(sheet.classList.contains('hidden'), false);
});

// ── Dismissal ─────────────────────────────────────────────────────────────────
test('✕ button closes', () => {
  open(entry());
  panel.querySelector('.detail__close').click();
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('backdrop press closes, inner press does not', () => {
  open(entry());
  // pointerdown on the panel bubbles to the sheet but target != sheet → stays open
  panel.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(sheet.classList.contains('hidden'), false);
  // pointerdown whose target is the sheet itself → closes
  sheet.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('Escape closes when open', () => {
  open(entry());
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(sheet.classList.contains('hidden'), true);
});
