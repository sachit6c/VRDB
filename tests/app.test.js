// tests/app.test.js
// Bootstrap wiring in app.js: setup flow, bootApp, settings sheet, theme
// segmented control, empty-state seeding, connection toasts.
//
// app.js runs side effects at import time and is imported ONCE; tests drive it
// by dispatching DOMContentLoaded / DOM events in controlled localStorage states.
import { test, before, beforeEach } from 'node:test';
import { mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, setConfirm } from './helpers/jsdom-env.js';

const window = installDom();
// app.js uses the bare `location` global; Node doesn't define it. Point it at
// jsdom's location (reload() then just no-ops navigation — no throw). The reload
// lines still execute for coverage; we assert observable state instead.
globalThis.location = window.location;

// Inert spies for the data/UI modules so importing app.js never touches supabase.
const calls = [];
let searchOpts = null, detailOpts = null;
for (const [path, names] of [
  ['../lib/mine.js',     ['initMine', 'refreshMine']],
  ['../lib/discover.js', ['initDiscover', 'refreshDiscover']],
  ['../lib/partner.js',  ['initPartner', 'refreshPartner']],
  ['../lib/shared.js',   ['initShared', 'refreshShared']],
]) {
  const namedExports = {};
  for (const n of names) namedExports[n] = () => { calls.push(n); };
  mock.module(path, { namedExports });
}
mock.module('../lib/search-modal.js', { namedExports: { initSearchModal: (o) => { searchOpts = o; } } });
mock.module('../lib/detail-sheet.js', { namedExports: { initDetailSheet: (o) => { detailOpts = o; } } });

await import('../app.js');

const $ = (id) => document.getElementById(id);
const fireDCL = () => document.dispatchEvent(new window.Event('DOMContentLoaded'));
function fill(el, value) {
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

beforeEach(() => { calls.length = 0; });

test('first visit (no names) shows the name picker, hides nothing else prematurely', () => {
  localStorage.clear();
  $('name-picker').classList.add('hidden');
  fireDCL();
  assert.equal($('name-picker').classList.contains('hidden'), false);
});

test('submit button enables only once both names are filled', () => {
  localStorage.clear();
  fireDCL();
  const my = $('setup-my-name');
  const partner = $('setup-partner-name');
  const submit = $('setup-form').querySelector('.setup-submit');

  fill(my, '');
  fill(partner, '');
  assert.equal(submit.disabled, true);

  fill(my, 'Alice');
  assert.equal(submit.disabled, true, 'still disabled with only one name');

  fill(partner, 'Bob');
  assert.equal(submit.disabled, false);
});

test('submitting setup stores names, hides the picker and reveals the app', () => {
  localStorage.clear();
  fireDCL();
  fill($('setup-my-name'), '  Alice ');
  fill($('setup-partner-name'), ' Bob ');
  $('setup-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  assert.equal(localStorage.getItem('vrdb.me'), 'Alice');     // trimmed
  assert.equal(localStorage.getItem('vrdb.partner'), 'Bob');
  assert.equal($('name-picker').classList.contains('hidden'), true);
  assert.equal($('app').classList.contains('hidden'), false);
});

test('bootApp wires the UI modules and search/detail callbacks', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL(); // setup complete -> bootApp()
  for (const n of ['initMine', 'initDiscover', 'initPartner', 'initShared']) {
    assert.ok(calls.includes(n), `${n} called`);
  }
  assert.equal(typeof searchOpts.onAdded, 'function');
  assert.equal(typeof detailOpts.onChange, 'function');
});

test('bootApp seeds empty-state copy with the names', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  assert.match($('partner-empty').textContent, /Bob/);
  assert.match($('mine-empty').textContent, /Alice/);
});

test('detail/search onChange callbacks refresh every tab', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  calls.length = 0;
  detailOpts.onChange();
  for (const n of ['refreshMine', 'refreshDiscover', 'refreshPartner', 'refreshShared']) {
    assert.ok(calls.includes(n), `${n} refreshed`);
  }
});

test('settings: open reflects current theme, theme buttons apply, close hides', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  localStorage.setItem('vrdb.theme', 'dark');
  fireDCL();

  $('settings-btn').click();
  const sheet = $('settings-sheet');
  assert.equal(sheet.classList.contains('hidden'), false);
  const darkBtn = sheet.querySelector('[data-theme-mode="dark"]');
  assert.equal(darkBtn.getAttribute('aria-pressed'), 'true');

  sheet.querySelector('[data-theme-mode="light"]').click();
  assert.equal(document.documentElement.getAttribute('data-theme'), 'light');
  assert.equal(sheet.querySelector('[data-theme-mode="light"]').getAttribute('aria-pressed'), 'true');

  $('settings-close').click();
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('settings: backdrop click closes the sheet', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  const sheet = $('settings-sheet');
  $('settings-btn').click();
  assert.equal(sheet.classList.contains('hidden'), false);
  // click directly on the backdrop (target === sheet)
  sheet.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('settings save: blank name warns and does not reload', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  $('settings-btn').click();
  fill($('settings-my-name'), '');
  fill($('settings-partner-name'), 'Bob');
  $('settings-save').click();
  assert.equal(localStorage.getItem('vrdb.me'), 'Alice'); // unchanged
  assert.ok(document.querySelector('.toast'), 'a warning toast was shown');
});

test('settings save: unchanged names hides the sheet without reloading', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  const sheet = $('settings-sheet');
  $('settings-btn').click();
  fill($('settings-my-name'), 'Alice');
  fill($('settings-partner-name'), 'Bob');
  $('settings-save').click();
  assert.equal(sheet.classList.contains('hidden'), true);
});

test('settings save: changed names persist and reload', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  $('settings-btn').click();
  fill($('settings-my-name'), 'Carol');
  fill($('settings-partner-name'), 'Dan');
  $('settings-save').click();
  assert.equal(localStorage.getItem('vrdb.me'), 'Carol'); // changed -> persisted (+ reload())
});

test('logout confirms, clears names and reloads', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  $('settings-btn').click();
  setConfirm(true);
  $('switch-user-btn').click();
  assert.equal(localStorage.getItem('vrdb.me'), null); // cleared (+ reload())
});

test('logout cancelled keeps the session', () => {
  localStorage.setItem('vrdb.me', 'Alice');
  localStorage.setItem('vrdb.partner', 'Bob');
  fireDCL();
  $('settings-btn').click();
  setConfirm(false);
  $('switch-user-btn').click();
  assert.equal(localStorage.getItem('vrdb.me'), 'Alice');
});

test('connection toasts fire on offline/online', () => {
  document.getElementById('toast-stack')?.remove();
  window.dispatchEvent(new window.Event('offline'));
  assert.ok(document.querySelector('.toast'), 'offline toast');
  window.dispatchEvent(new window.Event('online'));
  assert.ok(document.querySelectorAll('.toast').length >= 2, 'online toast too');
});
