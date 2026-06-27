// tests/toast.test.js
import { test, before, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/jsdom-env.js';

installDom();
const { toast, toastError } = await import('../lib/toast.js');

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  document.getElementById('toast-stack')?.remove();
});
afterEach(() => mock.timers.reset());

test('toast renders a message into an auto-created stack', () => {
  toast('Saved!');
  const stack = document.getElementById('toast-stack');
  assert.ok(stack, 'stack created');
  const el = stack.querySelector('.toast');
  assert.equal(el.textContent, 'Saved!');
  assert.ok(el.classList.contains('is-visible'));
});

test('kind sets a modifier class', () => {
  toast('Oops', { kind: 'error' });
  assert.ok(document.querySelector('.toast--error'));
});

test('auto-dismisses after the duration', () => {
  toast('bye', { duration: 1000 });
  const el = document.querySelector('.toast');
  mock.timers.tick(1000);       // hide() -> removes is-visible, schedules removal
  assert.equal(el.classList.contains('is-visible'), false);
  mock.timers.tick(200);        // element removed from DOM
  assert.equal(el.isConnected, false);
});

test('clicking a toast dismisses it early', () => {
  toast('tap me', { duration: 9999 });
  const el = document.querySelector('.toast');
  el.click();
  mock.timers.tick(200);
  assert.equal(el.isConnected, false);
});

test('reuses the same stack for multiple toasts', () => {
  toast('one');
  toast('two');
  assert.equal(document.querySelectorAll('#toast-stack .toast').length, 2);
});

test('toastError logs the error and shows an error toast', () => {
  const errs = [];
  const orig = console.error;
  console.error = (...a) => errs.push(a);
  try {
    toastError('Failed', new Error('boom'));
  } finally {
    console.error = orig;
  }
  assert.equal(errs.length, 1);
  assert.ok(document.querySelector('.toast--error'));
});
