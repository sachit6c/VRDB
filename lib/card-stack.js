// lib/card-stack.js
// Reusable Tinder-style card stack with 4-direction swipe.
//
// Usage:
//   const stack = mountCardStack({
//     containerEl,    // empty <div> that will own the cards
//     queue,          // array of TMDB-like items (must have .id, .poster_path, etc.)
//     onSwipe(item, dir),  // called when a card commits a swipe
//     onTap(item),         // called on a quick tap (no drag)
//     onEmpty(),           // called when the last card is gone
//   });
//   stack.push(newItem);       // append more items dynamically
//   stack.replace(newQueue);   // wholesale swap of remaining queue
//   stack.fling(dir);          // programmatic swipe of top card
//   stack.destroy();

import { posterUrl, yearOf, titleOf } from './tmdb-client.js';

const SWIPE_THRESHOLD = 90;
const FLING_DURATION  = 280;

const DIRECTION_LABEL = {
  right: 'Watch now',
  up:    'Watch later',
  down:  'Watched',
  left:  'Hell no',
};

export function mountCardStack({ containerEl, queue, onSwipe, onTap, onEmpty }) {
  let items = [...queue];
  let isAnimating = false;

  render();

  function render() {
    containerEl.innerHTML = '';
    const visible = items.slice(0, 3);
    for (let i = visible.length - 1; i >= 0; i--) {
      const item = visible[i];
      const isTop = i === 0;
      containerEl.appendChild(buildCard(item, i, isTop));
    }
  }

  function buildCard(item, depth, isTop) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.tmdbId = item.id;
    card.style.zIndex = String(100 - depth);
    card.style.transform = depthTransform(depth);

    const img = posterUrl(item.poster_path, 'w780');
    const year = yearOf(item);
    const mediaLabel = item.media_type === 'tv' ? 'TV' : 'Movie';
    const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : null;

    card.innerHTML = `
      <div class="card__poster">
        ${img ? `<img src="${img}" alt="" draggable="false">` : '<div class="card__poster--empty">🎬</div>'}
        <div class="card__overlay"></div>
        <div class="card__decision" data-decision></div>
      </div>
      <div class="card__meta">
        <h3 class="card__title">${escapeHtml(titleOf(item))}</h3>
        <div class="card__sub">
          ${mediaLabel}${year ? ' · ' + year : ''}${rating ? ' · ★ ' + rating : ''}
        </div>
        ${item.overview ? `<p class="card__overview">${escapeHtml(item.overview)}</p>` : ''}
      </div>
    `;

    if (isTop) attachGestures(card, item);
    return card;
  }

  function depthTransform(depth) {
    const scale = 1 - depth * 0.04;
    const offsetY = depth * 8;
    return `translate3d(0, ${offsetY}px, 0) scale(${scale})`;
  }

  function attachGestures(card, item) {
    let startX = 0, startY = 0;
    let dx = 0, dy = 0;
    let dragging = false;
    let pointerId = null;
    let startTime = 0;
    const decisionEl = card.querySelector('[data-decision]');

    card.addEventListener('pointerdown', (e) => {
      if (isAnimating) return;
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX; startY = e.clientY;
      startTime = performance.now();
      dx = 0; dy = 0;
      card.setPointerCapture(pointerId);
      card.classList.add('is-dragging');
    });

    card.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      const rot = dx / 18;
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${rot}deg)`;
      updateDecisionHint(decisionEl, dx, dy);
    });

    const finish = () => {
      if (!dragging) return;
      dragging = false;
      try { card.releasePointerCapture(pointerId); } catch {}
      card.classList.remove('is-dragging');
      decisionEl.textContent = '';
      decisionEl.dataset.dir = '';

      const elapsed = performance.now() - startTime;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      const isTap = absX < 6 && absY < 6 && elapsed < 250;

      if (isTap) {
        card.style.transform = depthTransform(0);
        onTap?.(item);
        return;
      }

      const dir = decideDirection(dx, dy);
      if (dir) {
        commitSwipe(card, item, dir);
      } else {
        card.style.transition = 'transform 0.18s ease-out';
        card.style.transform = depthTransform(0);
        setTimeout(() => { card.style.transition = ''; }, 200);
      }
    };

    card.addEventListener('pointerup', finish);
    card.addEventListener('pointercancel', finish);
  }

  function updateDecisionHint(el, dx, dy) {
    const dir = decideDirection(dx, dy, SWIPE_THRESHOLD * 0.5);
    if (!dir) { el.textContent = ''; el.dataset.dir = ''; return; }
    el.dataset.dir = dir;
    el.textContent = DIRECTION_LABEL[dir];
  }

  function decideDirection(dx, dy, threshold = SWIPE_THRESHOLD) {
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (absX < threshold && absY < threshold) return null;
    if (absX > absY) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  function commitSwipe(card, item, dir) {
    if (isAnimating) return;
    isAnimating = true;
    const w = window.innerWidth + 200;
    const h = window.innerHeight + 200;
    const targets = {
      right: `translate3d(${w}px, 0, 0) rotate(20deg)`,
      left:  `translate3d(${-w}px, 0, 0) rotate(-20deg)`,
      up:    `translate3d(0, ${-h}px, 0)`,
      down:  `translate3d(0, ${h}px, 0)`,
    };
    card.style.transition = `transform ${FLING_DURATION}ms cubic-bezier(.2,.7,.3,1), opacity ${FLING_DURATION}ms`;
    card.style.transform = targets[dir];
    card.style.opacity = '0';

    onSwipe?.(item, dir);

    setTimeout(() => {
      items.shift();
      if (items.length === 0) {
        containerEl.innerHTML = '';
        onEmpty?.();
      } else {
        render();
      }
      isAnimating = false;
    }, FLING_DURATION);
  }

  function fling(dir) {
    const top = containerEl.querySelector('.card');
    if (!top || isAnimating || items.length === 0) return;
    commitSwipe(top, items[0], dir);
  }

  function push(item) {
    items.push(item);
    if (items.length <= 3) render();
  }

  function replace(newQueue) {
    items = [...newQueue];
    render();
  }

  function size() { return items.length; }

  function destroy() { containerEl.innerHTML = ''; items = []; }

  return { fling, push, replace, size, destroy };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
