// tests/router.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, installDocument, makeEl } from './helpers/dom-shim.js';

const TABS = ['discover', 'partner', 'shared', 'mine'];

const screens = TABS.map((t) => { const el = makeEl('section'); el.dataset.screen = t; return el; });
const tabButtons = TABS.map((t) => { const el = makeEl('button'); el.dataset.tab = t; return el; });

installLocalStorage();
installDocument({
  elements: {
    '[data-screen]': screens,
    '.tab-btn[data-tab]': tabButtons,
  },
});

const { initRouter, goTo, TABS: EXPORTED_TABS } = await import('../lib/router.js');

const activeScreen = () => screens.find((s) => s._classes.has('is-active'))?.dataset.screen;
const selectedTab = () => tabButtons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.tab;

beforeEach(() => {
  localStorage.clear();
  screens.forEach((s) => s._classes.clear());
  tabButtons.forEach((b) => b._attrs.clear());
});

test('exports the canonical tab list', () => {
  assert.deepEqual(EXPORTED_TABS, TABS);
});

test('goTo activates exactly one screen and marks its tab selected', () => {
  goTo('shared');
  assert.equal(activeScreen(), 'shared');
  assert.equal(selectedTab(), 'shared');
  assert.equal(screens.filter((s) => s._classes.has('is-active')).length, 1);
});

test('goTo persists the last tab', () => {
  goTo('mine');
  assert.equal(localStorage.getItem('vrdb.lastTab'), 'mine');
});

test('goTo ignores unknown tabs', () => {
  goTo('shared');
  goTo('nope');
  assert.equal(activeScreen(), 'shared'); // unchanged
});

test('goTo fires onChange with the tab', () => {
  let got = null;
  goTo('partner', { onChange: (t) => { got = t; } });
  assert.equal(got, 'partner');
});

test('initRouter restores last tab from storage', () => {
  localStorage.setItem('vrdb.lastTab', 'mine');
  initRouter();
  assert.equal(activeScreen(), 'mine');
});

test('initRouter falls back to discover for an invalid stored tab', () => {
  localStorage.setItem('vrdb.lastTab', 'garbage');
  initRouter();
  assert.equal(activeScreen(), 'discover');
});

test('initRouter fires onChange for the restored tab so it lazy-loads', () => {
  localStorage.setItem('vrdb.lastTab', 'shared');
  let got = null;
  initRouter({ onChange: (t) => { got = t; } });
  assert.equal(got, 'shared');
});

test('clicking a tab button navigates and fires onChange', () => {
  let got = null;
  initRouter({ onChange: (t) => { got = t; } });
  tabButtons.find((b) => b.dataset.tab === 'shared').click();
  assert.equal(activeScreen(), 'shared');
  assert.equal(got, 'shared');
});
