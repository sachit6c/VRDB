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

// Resolve a raw input to a canonical partner name, case-insensitively.
function matchPartner(input) {
  const norm = (input ?? '').trim().toLowerCase();
  return PARTNERS.find((n) => n.toLowerCase() === norm) ?? null;
}

// Username = your name, password = your partner's name. They must be the two
// distinct partners. On success, stores + returns the logged-in name; on
// failure returns null and stores nothing.
export function login(username, password) {
  const user = matchPartner(username);
  const pass = matchPartner(password);
  if (!user || !pass || user === pass) return null;
  setMe(user);
  return user;
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
