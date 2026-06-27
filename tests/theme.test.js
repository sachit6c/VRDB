// tests/theme.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage, installDocument } from './helpers/dom-shim.js';

installLocalStorage();
const doc = installDocument();
const { getTheme, setTheme, applyStoredTheme } = await import('../lib/theme.js');

beforeEach(() => {
  localStorage.clear();
  doc.documentElement._attrs.clear();
});

test('defaults to system when unset or invalid', () => {
  assert.equal(getTheme(), 'system');
  localStorage.setItem('vrdb.theme', 'neon');
  assert.equal(getTheme(), 'system');
});

test('setTheme persists and applies dark/light via data-theme', () => {
  setTheme('dark');
  assert.equal(getTheme(), 'dark');
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');

  setTheme('light');
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'light');
});

test('system mode removes the data-theme attribute', () => {
  setTheme('dark');
  setTheme('system');
  assert.equal(doc.documentElement.getAttribute('data-theme'), null);
});

test('setTheme rejects unknown modes', () => {
  assert.throws(() => setTheme('sepia'), /Unknown theme/);
});

test('applyStoredTheme reflects the stored value', () => {
  localStorage.setItem('vrdb.theme', 'dark');
  applyStoredTheme();
  assert.equal(doc.documentElement.getAttribute('data-theme'), 'dark');
});
