// Zakładka Rozkłady: zakładki rodzajów pojazdów, kafelki linii, wyszukiwanie linii i przystanków; ekran linii (mapa + ciemny panel).
import { api, qs } from './api.js';
import { icon, esc, debounce } from './util.js';
import { ji } from './icons.js';
import { S, stopPlace, recentPlaces } from './state.js';
import { go, onScreen } from './nav.js';
import { sgRow, stopList } from './render.js';
import { openStop } from './screens.js';

const $ = (s, r = document) => r.querySelector(s);
const ORDER = ['tram', 'trolley', 'bus', 'rail', 'metro', 'ferry', 'other'];
const PLURAL = { tram: 'Tramwaje', trolley: 'Trolejbusy', bus: 'Autobusy', rail: 'Pociągi', metro: 'Metro', ferry: 'Tramwaje wodne', other: 'Inne' };
const MODE_ICON = { tram: 'vehicle-type-tram', trolley: 'vehicle-type-trolleybus', bus: 'vehicle-type-bus', rail: 'vehicle-type-train', metro: 'vehicle-type-train', ferry: 'vehicle-type-bus', other: 'vehicle-type-bus' };

let linesCache = { city: null, list: [] };
let stopItems = [];
let seq = 0;

async function allLines() {
  if (linesCache.city !== S.city.id) linesCache = { city: S.city.id, list: (await api(`/api/c/${S.city.id}/lines`)).lines };
  return linesCache.list;
}

const tile = (l) => `<button class="ltile${l.line.length > 3 ? ' wide' : ''}" data-route="${l.route}">${esc(l.line)}</button>`;
const operator = () => S.city.feeds.map((f) => f.name.replace(/ — .*/, '')).join(', ');

function renderTabs(modes) {
  if (!modes.includes(S.linesMode)) S.linesMode = modes[0];
  $('#vtabs').innerHTML = modes.map((m) => `<button class="vtab${m === S.linesMode ? ' on' : ''}" data-mode="${m}">${ji(MODE_ICON[m])}${PLURAL[m] || m}</button>`).join('');
}

async function renderLines() {
  const q = $('#linesInput').value.trim();
  const id = ++seq;
  let ls;
  try { ls = await allLines(); } catch (e) { $('#linesBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const modes = ORDER.filter((m) => ls.some((l) => l.mode === m));
  renderTabs(modes);
  let html = '';
  stopItems = [];
  if (q) {
    const ql = q.toLowerCase();
    const ml = ls.filter((l) => l.line.toLowerCase().startsWith(ql));
    let stops = [];
    try { stops = (await api(`/api/c/${S.city.id}/search?` + qs({ q, limit: 10 }))).stops; } catch { /* */ }
    if (id !== seq) return;
    if (ml.length) html += `<div class="op-name">Linie</div><div class="ltiles">${ml.slice(0, 60).map(tile).join('')}</div>`;
    stopItems = stops.map(stopPlace);
    if (stopItems.length) html += `<div class="sec-t">Przystanki</div>${stopItems.map((s, i) => sgRow(s, i, { q })).join('')}`;
    if (!ml.length && !stopItems.length) html = '<div class="sg-note">Nic nie znaleziono</div>';
  } else {
    // kafelki pogrupowane wg przewoźnika, jak w aplikacji („ZTM Gdańsk”, „PKP SKM”)
    const sel = ls.filter((l) => l.mode === S.linesMode);
    for (const op of [...new Set(sel.map((l) => l.op || operator()))]) {
      html += `<div class="op-name">${esc(op)}</div><div class="ltiles">${sel.filter((l) => (l.op || operator()) === op).map(tile).join('')}</div>`;
    }
    const near = (S.nearby || []).slice(0, 4);
    const rec = recentPlaces().filter((p) => p.kind === 'stop').slice(0, 5);
    if (near.length) { html += '<div class="sec-t">Przystanki w pobliżu</div>'; near.forEach((s) => { stopItems.push(s); html += sgRow(s, stopItems.length - 1); }); }
    if (rec.length) { html += '<div class="sec-t">Ostatnie przystanki</div>'; rec.forEach((s) => { stopItems.push(s); html += sgRow(s, stopItems.length - 1); }); }
  }
  if (id === seq) $('#linesBody').innerHTML = html;
}

onScreen('lines', async () => {
  renderLines();
  if (!S.me || S.nearby) return;
  try {
    const r = await api(`/api/c/${S.city.id}/nearby?` + qs({ lat: S.me.lat.toFixed(6), lon: S.me.lon.toFixed(6) }));
    S.nearby = r.stops.slice(0, 6).map((x) => ({ ...stopPlace(x), distance: x.distance }));
    renderLines();
  } catch { /* bez listy */ }
});
$('#linesInput').addEventListener('input', debounce(renderLines, 150));
$('#vtabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-mode]');
  if (!t) return;
  S.linesMode = t.dataset.mode;
  $('#linesInput').value = '';
  renderLines();
});
$('#linesBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-route]');
  if (r) { openLine(+r.dataset.route); return; }
  const row = e.target.closest('.sg-row[data-i]');
  if (row) openStop(stopItems[+row.dataset.i]);
});

// ---------------- LINIA
export function openLine(route) {
  S.line = { route, data: null, dir: 0, tab: 'main' };
  go('line');
}

function sheetPad() { return { top: 24, bottom: $('#lineSheet').offsetHeight - 8, left: 64, right: 24 }; }

function renderLine() {
  const L = S.line;
  const d = L.data;
  if (!d) { $('#lineHead').innerHTML = ''; $('#lineBody').innerHTML = '<div style="padding:16px"><div class="skel"></div></div>'; return; }
  const dir = d.directions[L.dir] || d.directions[0];
  const canSwap = d.directions.length > 1;
  $('#lineHead').innerHTML = `<div class="ds-r1">${icon(d.mode)}<span class="ds-num">${esc(d.line)}</span><span class="ds-op">${esc(operator())}</span></div>
    <div class="ds-r2"><div class="ds-dir"><span class="arr">→</span>${esc(dir.headsign)}</div>${canSwap ? `<button class="ds-swap" id="lineSwap" aria-label="Zmień kierunek">${icon('swap')}</button>` : ''}</div>
    ${d.directions.length > 2 ? `<div class="vtabs" style="margin:12px -20px -16px"><button class="vtab${L.tab === 'main' ? ' on' : ''}" data-tab2="main">Główna trasa</button><button class="vtab${L.tab === 'all' ? ' on' : ''}" data-tab2="all">Wszystkie warianty</button></div>` : ''}`;
  if (L.tab === 'all') {
    $('#lineBody').innerHTML = d.directions.map((x, i) => `<button class="acc-row" data-dir="${i}" style="${i === L.dir ? 'font-weight:700' : ''}"><span class="grow">→ ${esc(x.headsign)}<small>${x.stops.length} przystanków · ${esc(x.stops[0].name)} – ${esc(x.stops[x.stops.length - 1].name)}</small></span><span class="chev">${icon('chevronRight')}</span></button>`).join('');
  } else {
    $('#lineBody').innerHTML = stopList(dir.stops, { color: '#303030' });
  }
  requestAnimationFrame(() => S.map.showTrip({ mode: d.mode, color: '#303030', stops: dir.stops.map((s) => ({ ...s, dep: 0, arr: 0 })) }, -1, sheetPad(), { dots: false }));
}

onScreen('line', async () => {
  renderLine();
  S.map.invalidate();
  try {
    S.line.data = await api(`/api/c/${S.city.id}/line?` + qs({ route: S.line.route }));
  } catch (e) {
    $('#lineBody').innerHTML = `<div class="empty">Nie udało się pobrać linii: ${esc(e.message)}</div>`;
    return;
  }
  renderLine();
}, () => S.map.clearRoute());

$('#lineHead').addEventListener('click', (e) => {
  if (e.target.closest('#lineSwap')) { S.line.dir = S.line.dir === 0 ? 1 : 0; S.line.tab = 'main'; renderLine(); return; }
  const t = e.target.closest('[data-tab2]');
  if (t) { S.line.tab = t.dataset.tab2; renderLine(); }
});

$('#lineBody').addEventListener('click', (e) => {
  const v = e.target.closest('[data-dir]');
  if (v) { S.line.dir = +v.dataset.dir; S.line.tab = 'main'; renderLine(); return; }
  const row = e.target.closest('[data-s]');
  if (!row) return;
  const d = S.line.data;
  const s = (d.directions[S.line.dir] || d.directions[0]).stops[+row.dataset.s];
  openStop({ name: s.name, lat: s.lat, lon: s.lon }, d.line);
});
