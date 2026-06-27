// app.js — VRDB entry point.

import { getMe, getPartner, clearMe, setNames, hasCompletedSetup } from './lib/identity.js';
import { applyStoredTheme, getTheme, setTheme } from './lib/theme.js';
import { initRouter } from './lib/router.js';
import { initMine, refreshMine } from './lib/mine.js';
import { initDiscover, refreshDiscover } from './lib/discover.js';
import { initPartner, refreshPartner } from './lib/partner.js';
import { initShared, refreshShared } from './lib/shared.js';
import { initSearchModal } from './lib/search-modal.js';
import { initDetailSheet } from './lib/detail-sheet.js';
import { toast } from './lib/toast.js';

applyStoredTheme();
registerServiceWorker();
wireConnectionToasts();

document.addEventListener('DOMContentLoaded', () => {
  if (!hasCompletedSetup()) {
    showSetup();
  } else {
    bootApp();
  }
});

function showSetup() {
  const overlay = document.getElementById('name-picker');
  const form = document.getElementById('setup-form');
  const myNameInput = document.getElementById('setup-my-name');
  const partnerInput = document.getElementById('setup-partner-name');
  const submitBtn = form.querySelector('.setup-submit');

  // Pre-fill if we have partial data (e.g. only one name was stored before).
  myNameInput.value = getMe() ?? '';
  partnerInput.value = getPartner() ?? '';

  const validate = () => {
    submitBtn.disabled = !(myNameInput.value.trim() && partnerInput.value.trim());
  };
  myNameInput.addEventListener('input', validate);
  partnerInput.addEventListener('input', validate);
  validate();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const me = myNameInput.value.trim();
    const partner = partnerInput.value.trim();
    if (!me || !partner) return;
    setNames(me, partner);
    overlay.classList.add('hidden');
    bootApp();
  });

  overlay.classList.remove('hidden');
  myNameInput.focus();
}

function bootApp() {
  const me = getMe();
  const partner = getPartner();
  document.getElementById('app').classList.remove('hidden');

  // Render placeholder empty states with names.
  setEmptyState('partner-empty', `${partner} hasn't added anything yet.`);
  setEmptyState('shared-empty', 'No matches yet — start swiping!');
  setEmptyState('mine-empty', `Welcome, ${me}. Tap ＋ to add your first title.`);

  // Refresh a tab's data whenever the user navigates to it, so freshly-created
  // matches / swipes show up without a full page reload.
  const refreshForTab = {
    discover: refreshDiscover,
    partner:  refreshPartner,
    shared:   refreshShared,
    mine:     refreshMine,
  };
  initRouter({ onChange: (tab) => refreshForTab[tab]?.() });
  wireSettings();

  const refreshAll = () => { refreshMine(); refreshDiscover(); refreshPartner(); refreshShared(); };
  initSearchModal({ onAdded: refreshAll });
  initDetailSheet({ onChange: refreshAll });
  initMine();
  initDiscover();
  initPartner();
  initShared();
}

function setEmptyState(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function wireSettings() {
  const sheet = document.getElementById('settings-sheet');
  const openBtn = document.getElementById('settings-btn');
  const closeBtn = document.getElementById('settings-close');
  const saveBtn = document.getElementById('settings-save');
  const switchUserBtn = document.getElementById('switch-user-btn');
  const myNameInput = document.getElementById('settings-my-name');
  const partnerInput = document.getElementById('settings-partner-name');

  openBtn?.addEventListener('click', () => {
    renderThemeSegmented();
    myNameInput.value = getMe() ?? '';
    partnerInput.value = getPartner() ?? '';
    sheet.classList.remove('hidden');
  });
  closeBtn?.addEventListener('click', () => sheet.classList.add('hidden'));
  sheet?.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.classList.add('hidden');
  });

  saveBtn?.addEventListener('click', () => {
    const me = myNameInput.value.trim();
    const partner = partnerInput.value.trim();
    if (!me || !partner) {
      toast('Both names are required.', { kind: 'warn' });
      return;
    }
    const changed = me !== getMe() || partner !== getPartner();
    setNames(me, partner);
    sheet.classList.add('hidden');
    // Reload so every data view picks up the new identity cleanly.
    if (changed) location.reload();
  });

  switchUserBtn?.addEventListener('click', () => {
    if (confirm('Log out? You will need to enter your names again.')) {
      clearMe();
      location.reload();
    }
  });

  sheet.querySelectorAll('.segmented__btn[data-theme-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setTheme(btn.dataset.themeMode);
      renderThemeSegmented();
    });
  });
}

function renderThemeSegmented() {
  const current = getTheme();
  document.querySelectorAll('.segmented__btn[data-theme-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.themeMode === current ? 'true' : 'false');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed', err);
    });
  });
}

function wireConnectionToasts() {
  window.addEventListener('offline', () => toast('You\'re offline. Changes will pause until you reconnect.', { kind: 'warn', duration: 5000 }));
  window.addEventListener('online',  () => toast('Back online.', { kind: 'info', duration: 2000 }));
}
