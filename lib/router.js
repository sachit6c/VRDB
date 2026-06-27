// lib/router.js
// Trivial tab router for VRDB shell.
// Tabs: discover | partner | shared | mine. Lands on `discover` by default.

const TABS = ['discover', 'partner', 'shared', 'mine'];
const STORAGE_KEY = 'vrdb.lastTab';

export function initRouter({ onChange } = {}) {
  const navButtons = document.querySelectorAll('.tab-btn[data-tab]');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) goTo(tab, { onChange });
    });
  });

  // Initial landing fires onChange too, so the active tab loads its own data
  // lazily (init*() only wires the DOM; it doesn't fetch).
  const initial = restoreLastTab();
  goTo(initial, { onChange });
}

function restoreLastTab() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return TABS.includes(stored) ? stored : 'discover';
}

export function goTo(tab, { onChange } = {}) {
  if (!TABS.includes(tab)) return;
  localStorage.setItem(STORAGE_KEY, tab);

  document.querySelectorAll('[data-screen]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.screen === tab);
  });
  document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });

  onChange?.(tab);
}

export { TABS };
