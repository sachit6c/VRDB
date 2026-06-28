// lib/identity.js
// Who-am-I + who-is-my-partner. Free-text names, backed by localStorage.
//
// Names are arbitrary — any number of independent users/pairs can use the same
// deployment. You connect with your partner by entering each other's names:
// your "me" must equal their "partner" and vice-versa, since all backlog rows
// are keyed by `user_name`.

const KEY_ME      = 'vrdb.me';
const KEY_PARTNER = 'vrdb.partner';

// Canonical name form so the two devices match regardless of casing / extra
// whitespace — all backlog rows are keyed by an exact `user_name` string, so
// "richa", "RICHA" and " Richa " must all collapse to the same value or the
// pair never connects. Existing data is already stored in this Title-Case
// form, so applying it on read fixes mismatches without any data migration.
function canonicalize(name) {
  return (name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function read(key) {
  const v = canonicalize(localStorage.getItem(key));
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
  const m = canonicalize(me);
  const p = canonicalize(partner);
  if (!m || !p) throw new Error('Both names are required');
  localStorage.setItem(KEY_ME, m);
  localStorage.setItem(KEY_PARTNER, p);
}

export function clearMe() {
  localStorage.removeItem(KEY_ME);
  localStorage.removeItem(KEY_PARTNER);
}
