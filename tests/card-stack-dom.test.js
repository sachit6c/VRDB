// tests/card-stack-dom.test.js
// DOM-level behavior of the mounted card stack (render, gestures, queue advance).
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom, simulateDrag, simulateTap } from './helpers/jsdom-env.js';

installDom();
const { mountCardStack } = await import('../lib/card-stack.js');

const movie = (id, over) => ({ id, media_type: 'movie', title: `M${id}`, poster_path: `/p${id}.jpg`, vote_average: 7.5, overview: over ?? `plot ${id}`, release_date: '2020-01-01' });

let container;
beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { mock.timers.reset(); container.remove(); });

function mount(queue, handlers = {}) {
  return mountCardStack({ containerEl: container, queue, ...handlers });
}

test('renders up to 3 cards, top first in DOM stacking', () => {
  mount([movie(1), movie(2), movie(3), movie(4)]);
  const cards = container.querySelectorAll('.card');
  assert.equal(cards.length, 3); // only 3 visible
  assert.equal(container.querySelector('.card:last-child').dataset.tmdbId, '1'); // top is appended last
});

test('renders poster, title and meta overlaid on the poster', () => {
  mount([movie(1)]);
  assert.ok(container.querySelector('.card__poster img'));
  // Title + meta now live inside the poster overlay, not a separate meta block.
  const info = container.querySelector('.card__poster .card__info');
  assert.ok(info);
  assert.equal(info.querySelector('.card__title').textContent, 'M1');
  assert.match(info.querySelector('.card__sub').textContent, /Movie/);
  // Description is intentionally omitted from the card (shown in the detail sheet).
  assert.equal(container.querySelector('.card__overview'), null);
});

test('poster falls back to emoji when no path', () => {
  mount([{ id: 9, media_type: 'tv', name: 'NoPoster', poster_path: null }]);
  assert.ok(container.querySelector('.card__poster--empty'));
  assert.match(container.querySelector('.card__sub').textContent, /TV/);
});

test('drag past threshold commits a swipe and advances the queue', () => {
  const swipes = [];
  const stack = mount([movie(1), movie(2)], { onSwipe: (it, dir) => swipes.push([it.id, dir]) });
  simulateDrag(container.querySelector('.card:last-child'), 200, 0);
  assert.deepEqual(swipes, [[1, 'right']]);
  mock.timers.tick(300); // fling animation completes, queue shifts
  assert.equal(stack.size(), 1);
  assert.equal(container.querySelector('.card:last-child').dataset.tmdbId, '2');
});

test('all four directions map correctly', () => {
  const dirs = [];
  const stack = mount([movie(1), movie(2), movie(3), movie(4)], { onSwipe: (_it, d) => dirs.push(d) });
  const top = () => container.querySelector('.card:last-child');
  simulateDrag(top(), 200, 0); mock.timers.tick(300);   // right
  simulateDrag(top(), -200, 0); mock.timers.tick(300);  // left
  simulateDrag(top(), 0, 200); mock.timers.tick(300);   // down
  simulateDrag(top(), 0, -200); mock.timers.tick(300);  // up
  assert.deepEqual(dirs, ['right', 'left', 'down', 'up']);
});

test('a tiny drag is treated as a tap (opens details), no swipe', () => {
  const taps = [], swipes = [];
  mount([movie(1)], { onTap: (it) => taps.push(it.id), onSwipe: () => swipes.push(1) });
  simulateTap(container.querySelector('.card:last-child'));
  assert.deepEqual(taps, [1]);
  assert.equal(swipes.length, 0);
});

test('sub-threshold drag snaps back (no swipe)', () => {
  const swipes = [];
  mount([movie(1)], { onSwipe: () => swipes.push(1) });
  simulateDrag(container.querySelector('.card:last-child'), 40, 10);
  assert.equal(swipes.length, 0);
});

test('fling() programmatically swipes the top card', () => {
  const dirs = [];
  const stack = mount([movie(1), movie(2)], { onSwipe: (_it, d) => dirs.push(d) });
  stack.fling('left');
  assert.deepEqual(dirs, ['left']);
  mock.timers.tick(300);
  assert.equal(stack.size(), 1);
});

test('onEmpty fires after the last card leaves', () => {
  let empty = 0;
  const stack = mount([movie(1)], { onEmpty: () => { empty++; } });
  stack.fling('right');
  mock.timers.tick(300);
  assert.equal(empty, 1);
  assert.equal(stack.size(), 0);
});

test('push appends and replace swaps the queue', () => {
  const stack = mount([movie(1)]);
  stack.push(movie(2));
  assert.equal(stack.size(), 2);
  stack.replace([movie(7), movie(8), movie(9)]);
  assert.equal(stack.size(), 3);
  assert.equal(container.querySelector('.card:last-child').dataset.tmdbId, '7');
});

test('destroy empties the container and queue', () => {
  const stack = mount([movie(1), movie(2)]);
  stack.destroy();
  assert.equal(stack.size(), 0);
  assert.equal(container.querySelectorAll('.card').length, 0);
});

test('fling is a no-op on an empty stack', () => {
  const dirs = [];
  const stack = mount([movie(1)], { onSwipe: (_i, d) => dirs.push(d) });
  stack.destroy();
  stack.fling('right');
  assert.deepEqual(dirs, []);
});
