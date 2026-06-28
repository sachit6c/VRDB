// lib/sheet.js
// Shared bottom-sheet behaviour: animated open/close + swipe-down to dismiss.
//
// A "sheet" is a full-screen overlay (`.sheet`, fixed inset:0, flex-end) whose
// child panel slides up from the bottom. Panels may scroll internally. This
// module gives every sheet the same feel: drag the panel down to dismiss it,
// and an animated slide-out instead of an instant disappear.

const CLOSE_DISTANCE = 120;   // px dragged down that commits a dismiss outright
const FLICK_DISTANCE = 60;    // min travel before a fast flick counts as a dismiss
const FLICK_VELOCITY = 0.6;   // px/ms flick speed that commits at shorter distances

// True when we should skip the slide-out animation: either the user prefers
// reduced motion, or matchMedia isn't available (older engines, jsdom in tests)
// in which case we close instantly rather than risk a stuck animation.
function reducedMotion() {
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Are any *other* overlays (sheets or the search modal) still open? Used to
// decide whether to release the body scroll-lock when one closes.
function hasOtherOpenOverlay(exceptEl) {
  return [...document.querySelectorAll('.sheet, .modal')]
    .some((el) => el !== exceptEl && !el.classList.contains('hidden'));
}

export function lockScroll() {
  document.body.classList.add('is-sheet-open');
}

export function unlockScroll(exceptEl) {
  if (!hasOtherOpenOverlay(exceptEl)) document.body.classList.remove('is-sheet-open');
}

export function openSheet(overlayEl) {
  overlayEl.classList.remove('hidden');
  lockScroll();
}

// Animate the panel down and the backdrop out, then hide. Falls back to an
// instant hide when the user prefers reduced motion. Works whether the close
// was triggered by a button/backdrop (panel at rest) or by a swipe already in
// progress (panel mid-drag) — the transition picks up from wherever it is.
export function closeSheet(overlayEl, panelEl, onClosed) {
  const reset = () => {
    overlayEl.classList.add('hidden');
    panelEl.style.transition = '';
    panelEl.style.transform = '';
    overlayEl.style.transition = '';
    overlayEl.style.opacity = '';
    unlockScroll(overlayEl);
    onClosed?.();
  };

  if (reducedMotion()) { reset(); return; }

  let done = false;
  const finish = () => { if (done) return; done = true; reset(); };
  panelEl.addEventListener('transitionend', finish, { once: true });
  // Safety net: if transitionend never fires, still tear down.
  setTimeout(finish, 320);

  panelEl.style.transition = 'transform 0.25s ease-in';
  overlayEl.style.transition = 'opacity 0.25s ease-in';
  // Flush any pending transform (e.g. a drag offset) so the slide-out animates
  // from the current position rather than jumping to it first.
  void panelEl.offsetHeight;
  panelEl.style.transform = 'translateY(110%)';
  overlayEl.style.opacity = '0';
}

// Attach swipe-down-to-dismiss to a sheet panel. `onClose` should perform the
// app-level close (usually a call to closeSheet). `scrollEl` is the element that
// scrolls internally (defaults to the panel); the dismiss drag only begins when
// it is scrolled to the top, so swiping down never fights with reading long
// content — once you're scrolled in, a downward drag just scrolls back up.
export function makeDismissable(overlayEl, panelEl, onClose, scrollEl = panelEl) {
  let startY = 0, dy = 0, dragging = false, startTime = 0;

  panelEl.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (scrollEl.scrollTop > 0) return; // let internal content scroll first
    dragging = true;
    startY = e.clientY;
    dy = 0;
    startTime = performance.now();
  });

  panelEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = e.clientY - startY;
    if (dy <= 0) { // upward — not a dismiss; let it scroll, drop any offset
      panelEl.style.transform = '';
      overlayEl.style.opacity = '';
      return;
    }
    if (scrollEl.scrollTop > 0) { // content took over scrolling mid-gesture
      dragging = false;
      panelEl.style.transform = '';
      overlayEl.style.opacity = '';
      return;
    }
    panelEl.style.transition = 'none';
    panelEl.style.transform = `translateY(${dy}px)`;
    overlayEl.style.opacity = String(Math.max(0, 1 - dy / 500));
  });

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    const elapsed = performance.now() - startTime;
    const velocity = dy / Math.max(elapsed, 1);

    if (dy > CLOSE_DISTANCE || (dy > FLICK_DISTANCE && velocity > FLICK_VELOCITY)) {
      onClose();
      return;
    }
    if (dy > 0) { // didn't commit — snap back up
      panelEl.style.transition = 'transform 0.2s ease-out';
      panelEl.style.transform = 'translateY(0)';
      overlayEl.style.opacity = '';
      panelEl.addEventListener('transitionend', () => {
        panelEl.style.transition = '';
        panelEl.style.transform = '';
      }, { once: true });
    } else { // a plain tap — leave no inline styles behind
      panelEl.style.transition = '';
      panelEl.style.transform = '';
      overlayEl.style.opacity = '';
    }
  };

  panelEl.addEventListener('pointerup', finish);
  panelEl.addEventListener('pointercancel', finish);
}
