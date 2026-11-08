'use strict';
// Serwer aplikacji: API planera + pliki strony. Domyślnie 0.0.0.0:3400, żeby telefon w tej samej sieci Wi-Fi miał dostęp.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { URL } = require('url');
const QRCode = require('qrcode');

const { CITIES } = require('./src/cities');
const { loadCity, dateInt, norm } = require('./src/gtfs/load');
const { dist } = require('./src/geo');
const { downloadCity, cityHasData, cityIsFresh } = require('./src/gtfs/fetch');
const { plan, departures, tripDetail } = require('./src/router/plan');
const { searchStops, stopsInBbox, nearbyStops, geocode, reverse } = require('./src/search');
const { lines, line } = require('./src/router/lines');
const { Auth, tokenFrom } = require('./src/auth');

const PORT = +process.env.PORT || 3400;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data', 'gtfs');
const PUBLIC = path.join(ROOT, 'public');
// konta poza katalogiem rozkładów; testowy serwer: AUTH_FILE=… (osobny plik = osobny stan)
const auth = new Auth(process.env.AUTH_FILE ? path.resolve(process.env.AUTH_FILE) : path.join(ROOT, 'data', 'auth.json'));
const TZ = 'Europe/Warsaw';
const startedAt = Date.now();

const log = (...a) => console.log(new Date(nowMs()).toLocaleTimeString('pl-PL', { timeZone: TZ }), ...a);

// ---------- Zegar: poprawka względem czasu z sieci (zegar komputera może się spieszyć)
let clockOffset = 0;
let clockSource = 'zegar systemowy';
async function syncClock() {
  for (const url of ['https://gtfs.ztp.krakow.pl/', 'https://www.google.com/generate_204']) {
    try {
      const t0 = Date.now();
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      const t1 = Date.now();
      const date = Date.parse(res.headers.get('date'));
      if (!isFinite(date)) continue;
      // nagłówek Date ma rozdzielczość 1 s — środek sekundy + połowa czasu odpowiedzi
      clockOffset = Math.round(date + 500 - (t0 + t1) / 2);
      clockSource = new URL(url).host;
      if (Math.abs(clockOffset) > 60000) log(`Zegar komputera różni się od sieci o ${(clockOffset / 60000).toFixed(1)} min — używam czasu z sieci (${clockSource})`);
      return;
    } catch { /* następne źródło */ }
  }
}
function nowMs() { return Date.now() + clockOffset; }

function localParts(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: dateInt(+p.year, +p.month, +p.day), sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

// ---------- Miasta: pobieranie i ładowanie w tle
const state = new Map(CITIES.map((c) => [c.id, { status: 'none', error: null, model: null, message: '' }]));

async function prepareCity(city, { force = false } = {}) {
  const st = state.get(city.id);
  if (st.status === 'downloading' || st.status === 'loading') return;
  try {
    if (force || !cityHasData(city, DATA) || !cityIsFresh(city, DATA)) {
      st.status = 'downloading';
      st.error = null;
      try {
        await downloadCity(city, DATA, (m) => { st.message = m; log(m); }, { force });
      } catch (e) {
        if (!cityHasData(city, DATA)) throw e;
        log(`${city.id}: pobieranie nieudane (${e.message}) — ładuję poprzednie dane`);
      }
    }
    st.status = 'loading';
    const model = await loadCity(city, DATA, (m) => { st.message = m; });
    st.model = model;
    st.status = 'ready';
    st.message = '';
    log(`${city.name}: gotowe — ${model.stats.groups} przystanków, ${model.stats.trips} kursów, ${model.stats.loadMs} ms`);
  } catch (e) {
    st.status = st.model ? 'ready' : 'error';
    st.error = e.message;
    log(`${city.id}: BŁĄD ${e.message}`);
  }
}

function cityJson(c) {
  const st = state.get(c.id);
  const m = st.model;
  return {
    id: c.id, name: c.name, center: c.center, status: st.status, error: st.error, message: st.message,
    bbox: m ? m.bbox : null, stats: m ? m.stats : null, modes: m ? [...new Set(m.routes.map((r) => r.mode))] : [], feeds: m ? m.feeds : c.feeds.map((f) => ({ id: f.id, name: f.name })),
  };
}

// ---------- HTTP
function send(res, code, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': typeof body === 'string' || Buffer.isBuffer(body) ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(buf);
}
const json = (res, obj, code = 200) => send(res, code, obj, { 'Content-Type': 'application/json; charset=utf-8' });
const fail = (res, code, msg) => json(res, { error: msg }, code);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.map': 'application/json',
  '.woff2': 'font/woff2',
};
const STATIC_ROOTS = [
  ['/vendor/leaflet/', path.join(ROOT, 'node_modules', 'leaflet', 'dist')],
  ['/vendor/eruda/', path.join(ROOT, 'node_modules', 'eruda')],
  ['/', PUBLIC],
];

function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/dev') pathname = '/dev.html';
  for (const [prefix, dir] of STATIC_ROOTS) {
    if (!pathname.startsWith(prefix)) continue;
    const rel = decodeURIComponent(pathname.slice(prefix.length));
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir)) return fail(res, 403, 'zabronione');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const data = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
    return res.end(data);
  }
  return fail(res, 404, 'nie znaleziono: ' + pathname);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('za duże')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * "g:123" = zespół przystanków (id ważne do przeładowania rozkładu),
 * "n:Nazwa@50.06,19.94" = zespół po nazwie najbliższy punktu (trwałe — do historii),
 * "50.06,19.94" = punkt; opcjonalna nazwa w parametrze *Name
 */
function parsePlace(v, name, m) {
  if (!v) return null;
  const g = /^g:(\d+)$/.exec(v);
  if (g) return { group: +g[1], name: name || '' };
  const n = /^n:(.+)@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v);
  if (n) {
    const lat = +n[2], lon = +n[3];
    const list = (m && m.groupsByNorm.get(norm(n[1]))) || [];
    let best = null, bd = 1500;
    for (const gr of list) { const d = dist(lat, lon, gr.lat, gr.lon); if (d < bd) { bd = d; best = gr; } }
    return best ? { group: best.id, name: name || best.name } : { lat, lon, name: name || n[1] };
  }
  const p = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(v);
  if (p) return { lat: +p[1], lon: +p[2], name: name || '' };
  return null;
}

function lanUrls() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push({ iface: name, url: `http://${a.address}:${PORT}` });
    }
  }
  return out;
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;

  if (p === '/api/time') {
    const ms = nowMs();
    return json(res, { now: ms, offset: clockOffset, source: clockSource, tz: TZ, local: localParts(ms) });
  }

  // --- logowanie (bez tokenu)
  if (p === '/api/auth/status') return json(res, { setup: auth.needsSetup(), user: auth.check(tokenFrom(req, url)) });
  if ((p === '/api/auth/setup' || p === '/api/auth/login') && req.method === 'POST') {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return fail(res, 400, 'zły JSON'); }
    try {
      const token = p.endsWith('setup') ? auth.setup(body.login, body.password) : auth.login(body.login, body.password);
      log(`${p.endsWith('setup') ? 'Założono konto' : 'Zalogowano'}: ${body.login} (${req.socket.remoteAddress})`);
      return json(res, { token, user: auth.check(token) });
    } catch (e) {
      return fail(res, e.status || 400, e.message);
    }
  }
  if (p === '/api/auth/logout' && req.method === 'POST') { auth.logout(tokenFrom(req, url)); return json(res, { ok: true }); }

  // podgląd /dev, kod QR i log błędów klienta działają bez logowania; reszta wymaga tokenu
  if (!p.startsWith('/api/dev/') && !auth.check(tokenFrom(req, url))) {
    return fail(res, 401, auth.needsSetup() ? 'Załóż konto administratora' : 'Zaloguj się');
  }

  if (p === '/api/cities') return json(res, CITIES.map(cityJson));
  let mm = /^\/api\/cities\/([a-z0-9-]+)\/load$/.exec(p);
  if (mm && req.method === 'POST') {
    const city = CITIES.find((c) => c.id === mm[1]);
    if (!city) return fail(res, 404, 'nieznane miasto');
    prepareCity(city, { force: q.get('force') === '1' });
    return json(res, cityJson(city));
  }
  if (p === '/api/dev/info') {
    const mem = process.memoryUsage();
    return json(res, {
      lan: lanUrls(), port: PORT, uptimeSec: Math.round((Date.now() - startedAt) / 1000), node: process.version,
      rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576), clockOffset, clockSource,
    });
  }
  if (p === '/api/dev/qr.svg') {
    const text = q.get('text') || '';
    if (!text || text.length > 500) return fail(res, 400, 'brak tekstu');
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, width: 220 });
    return send(res, 200, svg, { 'Content-Type': 'image/svg+xml' });
  }
  if (p === '/api/dev/log' && req.method === 'POST') {
    // błędy z telefonu lądują w terminalu serwera
    try {
      const body = JSON.parse(await readBody(req));
      const ua = (req.headers['user-agent'] || '').replace(/^Mozilla\/5\.0 /, '').slice(0, 60);
      log(`[klient ${req.socket.remoteAddress}] ${String(body.level || 'log').toUpperCase()}: ${String(body.msg).slice(0, 2000)} (${ua})`);
    } catch { /* pomiń */ }
    return json(res, { ok: true });
  }

  mm = /^\/api\/c\/([a-z0-9-]+)\/([a-z-]+)$/.exec(p);
  if (!mm) return fail(res, 404, 'nieznany endpoint');
  const city = CITIES.find((c) => c.id === mm[1]);
  if (!city) return fail(res, 404, 'nieznane miasto');
  const st = state.get(city.id);
  const m = st.model;
  if (!m) return fail(res, 503, st.status === 'error' ? `Rozkład niedostępny: ${st.error}` : 'Rozkład się ładuje, spróbuj za chwilę');
  const action = mm[2];
  const now = localParts(nowMs());
  const date = +q.get('date') || now.date;
  const time = q.has('time') ? +q.get('time') : now.sec;

  switch (action) {
    case 'search': return json(res, { stops: searchStops(m, q.get('q') || '', +q.get('limit') || 8) });
    case 'geocode': {
      const text = (q.get('q') || '').trim();
      if (text.length < 3) return json(res, { places: [] });
      try { return json(res, { places: await geocode(m, text) }); } catch (e) { return json(res, { places: [], error: e.message }); }
    }
    case 'reverse': {
      const lat = +q.get('lat'), lon = +q.get('lon');
      if (!isFinite(lat) || !isFinite(lon)) return fail(res, 400, 'zła pozycja');
      const near = nearbyStops(m, lat, lon, 60, 1)[0];
      let place = null;
      try { place = await reverse(lat, lon); } catch { /* bez nazwy */ }
      return json(res, { place, stop: near || null });
    }
    case 'stops': {
      const b = (q.get('bbox') || '').split(',').map(Number);
      if (b.length !== 4 || b.some((x) => !isFinite(x))) return fail(res, 400, 'zły bbox');
      return json(res, { stops: stopsInBbox(m, b[0], b[1], b[2], b[3]) });
    }
    case 'nearby': {
      const lat = +q.get('lat'), lon = +q.get('lon');
      if (!isFinite(lat) || !isFinite(lon)) return fail(res, 400, 'zła pozycja');
      return json(res, { stops: nearbyStops(m, lat, lon, +q.get('radius') || 700) });
    }
    case 'plan': {
      const from = parsePlace(q.get('from'), q.get('fromName'), m);
      const to = parsePlace(q.get('to'), q.get('toName'), m);
      if (!from || !to) return fail(res, 400, 'podaj from i to (g:ID albo lat,lon)');
      const modes = q.get('modes') ? new Set(q.get('modes').split(',').filter(Boolean)) : null;
      const r = plan(m, {
        from, to, date, time, arriveBy: q.get('arriveBy') === '1', modes,
        maxTransfers: q.has('maxTransfers') ? +q.get('maxTransfers') : -1, walk: q.get('walk') || 'normal', count: +q.get('count') || 5,
      });
      return json(res, r);
    }
    case 'departures': {
      let gid = q.has('group') ? +q.get('group') : -1;
      if (q.get('stop')) { const pl = parsePlace(q.get('stop'), '', m); gid = pl && pl.group != null ? pl.group : -1; }
      const d = departures(m, gid, date, time, { limit: +q.get('limit') || 40 });
      return d ? json(res, d) : fail(res, 404, 'nieznany przystanek');
    }
    case 'lines': return json(res, { lines: lines(m) });
    case 'line': {
      const l = line(m, +q.get('route'));
      return l ? json(res, l) : fail(res, 404, 'nieznana linia');
    }
    case 'trip': {
      const t = tripDetail(m, q.get('ref'));
      return t ? json(res, { ...t, date }) : fail(res, 404, 'nieznany kurs');
    }
    default: return fail(res, 404, 'nieznany endpoint');
  }
}

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return fail(res, 400, 'zły adres'); }
  res.on('finish', () => {
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/dev/log') {
      log(`${req.method} ${url.pathname}${url.search.length > 1 ? url.search.slice(0, 120) : ''} → ${res.statusCode} ${Date.now() - t0} ms`);
    }
  });
  try {
    if (url.pathname.startsWith('/api/')) {
      // CORS: przyszłe APK ładuje stronę z własnych plików i woła ten serwer po adresie podanym przy logowaniu
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'metoda');
    return serveStatic(req, res, url.pathname);
  } catch (e) {
    log('BŁĄD', req.url, e.stack || e);
    if (!res.headersSent) fail(res, 500, e.message);
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} zajęty — inny serwer już działa? Ustaw PORT=… i spróbuj ponownie.`);
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, async () => {
  console.log(`\nPlaner działa:\n  komputer:  http://localhost:${PORT}   (podgląd telefonu: http://localhost:${PORT}/dev)`);
  const lan = lanUrls();
  for (const l of lan) console.log(`  telefon:   ${l.url}   (${l.iface})`);
  if (lan[0]) {
    try { console.log(await QRCode.toString(lan[0].url, { type: 'terminal', small: true })); } catch { /* bez QR */ }
  }
  console.log('  Telefon musi być w tej samej sieci Wi-Fi. Lokalizacja GPS wymaga localhost — patrz README (USB + chrome://inspect).\n');
  await syncClock();
  setInterval(syncClock, 3600 * 1000).unref();
  const only = process.env.CITIES ? process.env.CITIES.split(',') : null;
  for (const c of CITIES) {
    // pozostałe miasta ładowane na żądanie z menu (pobrane dane zostają na dysku)
    const want = only ? only.includes(c.id) : c.autoload;
    if (want) await prepareCity(c);
  }
  // codzienne odświeżenie rozkładów
  setInterval(() => {
    for (const c of CITIES) {
      const st = state.get(c.id);
      if (st.model && !cityIsFresh(c, DATA)) prepareCity(c);
    }
  }, 3 * 3600 * 1000).unref();
});
