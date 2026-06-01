// lib/identity.js
// Who-am-I + who-is-my-partner. Backed by localStorage.

import { PARTNERS } from './partners.js';

const STORAGE_KEY = 'vrdb.me';

export function getMe() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return PARTNERS.includes(stored) ? stored : null;
}

export function setMe(name) {
  if (!PARTNERS.includes(name)) {
    throw new Error(`Unknown partner: ${name}`);
  }
  localStorage.setItem(STORAGE_KEY, name);
}

export function getPartner() {
  const me = getMe();
  if (!me) return null;
  return PARTNERS.find((n) => n !== me) ?? null;
}

export function clearMe() {
  localStorage.removeItem(STORAGE_KEY);
}

export { PARTNERS };
