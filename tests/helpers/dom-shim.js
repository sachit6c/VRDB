// tests/helpers/dom-shim.js
// Minimal, dependency-free browser shims for unit testing VRDB modules under
// Node's built-in test runner. Only implements the surface area the modules touch.

// ── localStorage ─────────────────────────────────────────────────────────────
export function installLocalStorage() {
  const store = new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  globalThis.localStorage = ls;
  return ls;
}

// ── Fake element ─────────────────────────────────────────────────────────────
export function makeEl(tag = 'div') {
  const classes = new Set();
  const attrs = new Map();
  const listeners = {};
  const el = {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    children: [],
    innerHTML: '',
    textContent: '',
    classList: {
      add: (...cs) => cs.forEach((c) => classes.add(c)),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      toggle: (c, force) => {
        const want = force === undefined ? !classes.has(c) : !!force;
        if (want) classes.add(c); else classes.delete(c);
        return want;
      },
      contains: (c) => classes.has(c),
    },
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: (k) => attrs.delete(k),
    appendChild: (child) => { el.children.push(child); return child; },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    dispatch: (type, ev = {}) => { (listeners[type] || []).forEach((fn) => fn(ev)); },
    click: () => el.dispatch('click'),
    // test introspection
    _classes: classes,
    _attrs: attrs,
  };
  return el;
}

// ── Fake document ────────────────────────────────────────────────────────────
// `elements` maps a CSS selector string to an array of fake elements. Only exact
// selector strings used by the modules under test need to be registered.
export function installDocument({ elements = {} } = {}) {
  const doc = {
    documentElement: makeEl('html'),
    body: makeEl('body'),
    querySelectorAll: (sel) => elements[sel] ?? [],
    querySelector: (sel) => (elements[sel] ?? [])[0] ?? null,
    getElementById: (id) => (elements['#' + id] ?? [])[0] ?? null,
    createElement: (tag) => makeEl(tag),
    addEventListener: () => {},
  };
  globalThis.document = doc;
  return doc;
}

// ── fetch ────────────────────────────────────────────────────────────────────
// handler(urlString) -> { ok?, status?, body } ; body is returned from .json()
export function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const r = handler(u) ?? {};
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.body ?? {},
    };
  };
  return calls;
}

export function resetGlobals() {
  delete globalThis.localStorage;
  delete globalThis.document;
  delete globalThis.fetch;
}
