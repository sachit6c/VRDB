// app.js — VRDB entry point.

import { getMe, setMe, getPartner, clearMe, PARTNERS } from './lib/identity.js';
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
  if (!getMe()) {
    showNamePicker();
  } else {
    bootApp();
  }
});

function showNamePicker() {
  const overlay = document.getElementById('name-picker');
  const choices = overlay.querySelector('.name-picker__choices');

  choices.innerHTML = '';
  PARTNERS.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'name-picker__btn';
    btn.type = 'button';
    btn.textContent = name;
    btn.addEventListener('click', () => {
      setMe(name);
      overlay.classList.add('hidden');
      bootApp();
    });
    choices.appendChild(btn);
  });

  overlay.classList.remove('hidden');
}

function bootApp() {
  const me = getMe();
  const partner = getPartner();
  document.getElementById('app').classList.remove('hidden');

  // Render placeholder empty states with names.
  setEmptyState('partner-empty', `${partner} hasn't added anything yet.`);
  setEmptyState('shared-empty', 'No matches yet — start swiping!');
  setEmptyState('mine-empty', `Welcome, ${me}. Tap ＋ to add your first title.`);

  initRouter();
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
  const switchUserBtn = document.getElementById('switch-user-btn');

  openBtn?.addEventListener('click', () => {
    renderThemeSegmented();
    sheet.classList.remove('hidden');
  });
  closeBtn?.addEventListener('click', () => sheet.classList.add('hidden'));
  sheet?.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.classList.add('hidden');
  });

  switchUserBtn?.addEventListener('click', () => {
    if (confirm('Switch user? You will be asked to pick your name again.')) {
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
