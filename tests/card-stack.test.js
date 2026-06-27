// tests/card-stack.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDirection, escapeHtml } from '../lib/card-stack.js';

// decideDirection maps a drag delta to right/left/up/down per the PRD gesture map:
//   right = watch now, up = watch later, down = watched, left = hell no.
test('returns null below threshold', () => {
  assert.equal(decideDirection(0, 0), null);
  assert.equal(decideDirection(50, 50), null); // both under default 90
  assert.equal(decideDirection(-89, 10), null);
});

test('horizontal dominant → right / left', () => {
  assert.equal(decideDirection(120, 10), 'right');
  assert.equal(decideDirection(-120, 10), 'left');
});

test('vertical dominant → down / up', () => {
  assert.equal(decideDirection(10, 120), 'down');
  assert.equal(decideDirection(10, -120), 'up');
});

test('larger axis wins when both exceed threshold', () => {
  assert.equal(decideDirection(200, 100), 'right'); // |x| > |y|
  assert.equal(decideDirection(100, 200), 'down');  // |y| > |x|
});

test('custom (lower) threshold triggers earlier — used for the live hint', () => {
  assert.equal(decideDirection(50, 0, 45), 'right');
  assert.equal(decideDirection(50, 0, 90), null);
});

test('escapeHtml neutralizes injection characters', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

test('escapeHtml coerces non-strings', () => {
  assert.equal(escapeHtml(42), '42');
});
