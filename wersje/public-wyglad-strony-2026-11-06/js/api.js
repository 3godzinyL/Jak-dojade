// Klient API. Adres serwera i token z logowania (APK ładuje stronę lokalnie i woła serwer po adresie).
// Każde zapytanie emituje zdarzenie `trasa:api` — podgląd /dev i eruda pokazują je w logu.

let seq = 0;
const KEY_SERVER = 'trasa.server';
const KEY_TOKEN = 'trasa.token';

function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } }

/** Adres serwera: zapisany przy logowaniu, a gdy strona przychodzi z serwera — jej własny adres. */
export function serverUrl() {
  const saved = read(KEY_SERVER);
  if (saved) return saved;
  return /^https?:$/.test(location.protocol) ? location.origin : '';
}
export function setServer(url) { write(KEY_SERVER, url ? url.replace(/\/+$/, '') : null); }
export function token() { return read(KEY_TOKEN); }
export function setToken(t) { write(KEY_TOKEN, t); }

function abs(path) {
  const base = serverUrl();
  return base && base !== location.origin ? base + path : path;
}
export { abs as apiUrl };

export async function api(path, { method = 'GET', signal, body } = {}) {
  const id = ++seq;
  const t0 = performance.now();
  let status = 0;
  try {
    const headers = { Accept: 'application/json' };
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(abs(path), { method, signal, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new CustomEvent('trasa:auth', { detail: data.error }));
    if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status });
    emit({ id, path, method, status, ms: Math.round(performance.now() - t0), size: JSON.stringify(data).length });
    return data;
  } catch (e) {
    if (e.name !== 'AbortError') emit({ id, path, method, status, ms: Math.round(performance.now() - t0), error: e.message });
    throw e;
  }
}

function emit(detail) {
  window.dispatchEvent(new CustomEvent('trasa:api', { detail }));
  if (detail.error) console.warn(`[api] ${detail.method} ${detail.path} → ${detail.status} ${detail.error} (${detail.ms} ms)`);
  else console.debug(`[api] ${detail.method} ${detail.path} → ${detail.status} (${detail.ms} ms, ${detail.size} B)`);
}

export function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  return p.toString();
}
