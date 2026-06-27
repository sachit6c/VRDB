// tests/helpers/jsdom-env.js
// Real DOM for the UI modules, backed by the app's actual index.html so every
// element id/selector the modules query exists. Also fills the gaps jsdom omits
// (pointer capture, confirm) and exposes drag simulation for the card stack.

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', '..', 'index.html'), 'utf8');

let dom = null;

// Install a fresh jsdom and publish the globals the modules expect. Call once
// per test file, before importing the module under test.
export function installDom() {
  dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;

  for (const key of [
    'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node',
    'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle',
    'localStorage', 'requestAnimationFrame', 'cancelAnimationFrame',
  ]) {
    if (window[key] === undefined) continue;
    // Some globals (navigator) are read-only accessors in Node — define instead.
    try {
      globalThis[key] = window[key];
    } catch {
      Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
    }
  }

  // jsdom doesn't implement these; the card stack and detail sheet need them.
  window.HTMLElement.prototype.setPointerCapture ||= function () {};
  window.HTMLElement.prototype.releasePointerCapture ||= function () {};
  window.HTMLElement.prototype.focus ||= function () {};
  window.confirm = () => true;            // tests override via setConfirm()
  globalThis.confirm = (...a) => window.confirm(...a);
  window.scrollTo = () => {};

  localStorage.clear();
  return window;
}

// Override confirm()'s answer for remove/logout flows.
export function setConfirm(answer) {
  dom.window.confirm = () => answer;
}

// Reset just the dynamic regions of a screen without detaching the cached refs
// the modules hold (they capture elements at init time).
export function clearBody() {
  document.querySelectorAll('[id$="-list"], [id$="-stack"], [id="search-results"], .detail__panel')
    .forEach((el) => { el.innerHTML = ''; });
}

// Build a generic pointer-ish event jsdom will dispatch (PointerEvent is absent).
function pointerEvent(type, { x = 0, y = 0, button = 0 } = {}) {
  const ev = new dom.window.Event(type, { bubbles: true, cancelable: true });
  ev.clientX = x;
  ev.clientY = y;
  ev.button = button;
  ev.pointerId = 1;
  return ev;
}

// Simulate a full drag on an element: down → move → up, ending at (dx, dy).
export function simulateDrag(el, dx, dy, { steps = 1 } = {}) {
  el.dispatchEvent(pointerEvent('pointerdown', { x: 0, y: 0 }));
  for (let i = 1; i <= steps; i++) {
    el.dispatchEvent(pointerEvent('pointermove', { x: (dx * i) / steps, y: (dy * i) / steps }));
  }
  el.dispatchEvent(pointerEvent('pointerup', { x: dx, y: dy }));
}

// Simulate a quick tap (no movement) — distinguished from a drag by distance.
export function simulateTap(el) {
  el.dispatchEvent(pointerEvent('pointerdown', { x: 0, y: 0 }));
  el.dispatchEvent(pointerEvent('pointerup', { x: 0, y: 0 }));
}
