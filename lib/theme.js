// lib/theme.js
// Theme mode: 'system' | 'light' | 'dark'. Persisted in localStorage.
// Applies via data-theme attribute on <html>; absence = follow prefers-color-scheme.

const STORAGE_KEY = 'vrdb.theme';
const VALID = ['system', 'light', 'dark'];

export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return VALID.includes(stored) ? stored : 'system';
}

export function setTheme(mode) {
  if (!VALID.includes(mode)) throw new Error(`Unknown theme: ${mode}`);
  localStorage.setItem(STORAGE_KEY, mode);
  apply(mode);
}

export function applyStoredTheme() {
  apply(getTheme());
}

function apply(mode) {
  const html = document.documentElement;
  if (mode === 'system') {
    html.removeAttribute('data-theme');
  } else {
    html.setAttribute('data-theme', mode);
  }
}
