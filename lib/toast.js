// lib/toast.js
// Minimal toast notifier. Auto-dismisses; stacks vertically.

const STACK_ID = 'toast-stack';

function ensureStack() {
  let el = document.getElementById(STACK_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = STACK_ID;
    el.className = 'toast-stack';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  return el;
}

export function toast(message, { kind = 'info', duration = 3200 } = {}) {
  const stack = ensureStack();
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.textContent = message;
  stack.appendChild(el);
  // Force reflow so transition runs
  void el.offsetWidth;
  el.classList.add('is-visible');

  const hide = () => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 200);
  };
  const timer = setTimeout(hide, duration);
  el.addEventListener('click', () => { clearTimeout(timer); hide(); });
  return hide;
}

export function toastError(message, err) {
  if (err) console.error(message, err);
  toast(message, { kind: 'error', duration: 4500 });
}
