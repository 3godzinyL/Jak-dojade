// Ekrany na historii przeglądarki — systemowy „wstecz” na Androidzie zamyka okno / wraca ekran.
const $ = (s) => document.querySelector(s);

const stack = ['home'];
let current = 'home';
let modalOpen = false;
let modalWaiter = null;
const enter = {};
const leave = {};

history.replaceState({ depth: 1 }, '');

export function onScreen(name, onEnter, onLeave) {
  if (onEnter) enter[name] = onEnter;
  if (onLeave) leave[name] = onLeave;
}

export function currentScreen() { return current; }

function show(name, force = false) {
  if (current === name && !force) return;
  const prev = current;
  current = name;
  document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === name));
  document.body.dataset.screen = name;
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  if (prev !== name && leave[prev]) leave[prev]();
  if (enter[name]) enter[name]();
}

export function go(name) {
  stack.push(name);
  history.pushState({ depth: stack.length }, '');
  show(name, true);
}

export function back(n = 1) { history.go(-n); }

/** Zakładka dolnego paska: ekran główny poziomu, bez historii pod spodem. */
export function switchTab(name) {
  if (stack.length > 1) {
    // zdejmij ekrany podrzędne, potem podmień bieżący wpis
    const n = stack.length - 1;
    stack.length = 1;
    history.go(-n);
  }
  stack[0] = name;
  history.replaceState({ depth: 1 }, '');
  show(name);
}

/** Odśwież bieżący ekran (ponowne wejście). */
export function refresh() { show(current, true); }

window.addEventListener('popstate', (e) => {
  const st = e.state || { depth: 1 };
  if (modalOpen && !st.modal) hideModal();
  if (modalWaiter) { const w = modalWaiter; modalWaiter = null; w(); }
  while (stack.length > Math.max(1, st.depth)) stack.pop();
  show(stack[stack.length - 1]);
});

export function openModal(html, mount) {
  const sheet = $('#modalSheet');
  sheet.innerHTML = html;
  sheet.scrollTop = 0;
  $('#modal').hidden = false;
  if (!modalOpen) {
    modalOpen = true;
    history.pushState({ depth: stack.length, modal: true }, '');
  }
  if (mount) mount(sheet);
}

function hideModal() {
  modalOpen = false;
  $('#modal').hidden = true;
  $('#modalSheet').innerHTML = '';
}

/** Zamyka okno; promise kończy się po zdjęciu wpisu z historii (bezpieczna dalsza nawigacja). */
export function closeModal() {
  if (!modalOpen) return Promise.resolve();
  return new Promise((res) => { modalWaiter = res; history.back(); });
}

let toastTimer;
export function toast(msg, ms = 2800) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-back]')) back();
  else if (e.target.closest('.modal-back')) closeModal();
});
