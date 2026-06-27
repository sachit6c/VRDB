// tests/identity.test.js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installLocalStorage } from './helpers/dom-shim.js';

installLocalStorage();
const { getMe, getPartner, hasCompletedSetup, setNames, clearMe } =
  await import('../lib/identity.js');

beforeEach(() => localStorage.clear());

test('getMe/getPartner are null before setup', () => {
  assert.equal(getMe(), null);
  assert.equal(getPartner(), null);
  assert.equal(hasCompletedSetup(), false);
});

test('setNames stores trimmed names', () => {
  setNames('  Alice ', ' Bob ');
  assert.equal(getMe(), 'Alice');
  assert.equal(getPartner(), 'Bob');
  assert.equal(hasCompletedSetup(), true);
});

test('setNames throws when either name is blank', () => {
  assert.throws(() => setNames('', 'Bob'), /required/);
  assert.throws(() => setNames('Alice', '   '), /required/);
});

test('blank/whitespace stored value reads back as null', () => {
  localStorage.setItem('vrdb.me', '   ');
  assert.equal(getMe(), null);
});

test('clearMe removes both names', () => {
  setNames('Alice', 'Bob');
  clearMe();
  assert.equal(getMe(), null);
  assert.equal(getPartner(), null);
  assert.equal(hasCompletedSetup(), false);
});
