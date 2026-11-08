// Debugowanie: eruda (konsola/sieć/DOM na telefonie) + przekazywanie błędów do terminala serwera.

const params = new URLSearchParams(location.search);
if (params.get('debug') === '1') localStorage.setItem('trasa.debug', 'true');
if (params.get('debug') === '0') localStorage.setItem('trasa.debug', 'false');

export function debugEnabled() {
  try { return localStorage.getItem('trasa.debug') === 'true'; } catch { return false; }
}

export function setDebug(on) {
  try { localStorage.setItem('trasa.debug', on ? 'true' : 'false'); } catch { /* */ }
  location.reload();
}

export function loadEruda() {
  if (window.eruda) return;
  const s = document.createElement('script');
  s.src = '/vendor/eruda/eruda.js';
  s.onload = () => { window.eruda.init({ tool: ['console', 'network', 'elements', 'resources', 'info'] }); };
  document.head.appendChild(s);
}

let sent = 0;
function report(level, msg) {
  if (sent > 50) return; // bez zalewania terminala
  sent++;
  try {
    navigator.sendBeacon?.('/api/dev/log', new Blob([JSON.stringify({ level, msg })], { type: 'application/json' })) ||
      fetch('/api/dev/log', { method: 'POST', body: JSON.stringify({ level, msg }), keepalive: true });
  } catch { /* */ }
}

window.addEventListener('error', (e) => report('error', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}`));
window.addEventListener('unhandledrejection', (e) => report('error', 'Promise: ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
const origError = console.error.bind(console);
console.error = (...a) => { origError(...a); report('error', a.map((x) => (x && x.stack) || String(x)).join(' ')); };

if (debugEnabled()) loadEruda();
