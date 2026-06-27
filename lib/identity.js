// lib/identity.js
// Who-am-I + who-is-my-partner. Free-text names, backed by localStorage.
//
// Names are arbitrary — any number of independent users/pairs can use the same
// deployment. You connect with your partner by entering each other's names:
// your "me" must equal their "partner" and vice-versa, since all backlog rows
// are keyed by `user_name`.

const KEY_ME      = 'vrdb.me';
const KEY_PARTNER = 'vrdb.partner';

function read(key) {
  const v = (localStorage.getItem(key) || '').trim();
  return v || null;
}

export function getMe() {
  return read(KEY_ME);
}

export function getPartner() {
  return read(KEY_PARTNER);
}

// True once both names are set (i.e. setup has been completed).
export function hasCompletedSetup() {
  return !!getMe() && !!getPartner();
}

// Store both names. Throws if either is blank.
export function setNames(me, partner) {
  const m = (me || '').trim();
  const p = (partner || '').trim();
  if (!m || !p) throw new Error('Both names are required');
  localStorage.setItem(KEY_ME, m);
  localStorage.setItem(KEY_PARTNER, p);
}

export function clearMe() {
  localStorage.removeItem(KEY_ME);
  localStorage.removeItem(KEY_PARTNER);
}
