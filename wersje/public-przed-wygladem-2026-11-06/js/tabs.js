// Zakładka Rozkłady: linie wg rodzaju pojazdu, wyszukiwanie linii i przystanków, przebieg linii w kierunkach.
import { api, qs } from './api.js';
import { icon, esc, lineBadge, lineColors, debounce, meters } from './util.js';
import { S, stopPlace, recentPlaces } from './state.js';
import { go, onScreen } from './nav.js';
import { placeRow } from './render.js';
import { openStop } from './screens.js';

const $ = (s, r = document) => r.querySelector(s);
const PLURAL = { tram: 'Tramwaje', bus: 'Autobusy', metro: 'Metro', rail: 'Kolej', trolley: 'Trolejbusy', ferry: 'Tramwaje wodne', other: 'Inne' };

let linesCache = { city: null, list: [] };
let stopItems = [];
let seq = 0;

async function allLines() {
  if (linesCache.city !== S.city.id) linesCache = { city: S.city.id, list: (await api(`/api/c/${S.city.id}/lines`)).lines };
  return linesCache.list;
}

const chip = (l) => `<span data-route="${l.route}">${lineBadge(l)}</span>`;

async function renderLines() {
  const q = $('#linesInput').value.trim();
  const id = ++seq;
  let ls;
  try { ls = await allLines(); } catch (e) { $('#linesBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  let html = '';
  stopItems = [];
  if (q) {
    const ql = q.toLowerCase();
    const ml = ls.filter((l) => l.line.toLowerCase().startsWith(ql));
    let stops = [];
    try { stops = (await api(`/api/c/${S.city.id}/search?` + qs({ q, limit: 10 }))).stops; } catch { /* */ }
    if (id !== seq) return;
    if (ml.length) html += `<div class="sec-title">Linie</div><div class="line-grid">${ml.slice(0, 40).map(chip).join('')}</div>`;
    stopItems = stops.map(stopPlace);
    if (stopItems.length) html += `<div class="sec-title">Przystanki</div><ul class="list">${stopItems.map((s, i) => placeRow(s, i)).join('')}</ul>`;
    if (!ml.length && !stopItems.length) html = '<div class="empty">Nic nie znaleziono</div>';
  } else {
    const near = (S.nearby || []).slice(0, 4);
    const rec = recentPlaces().filter((p) => p.kind === 'stop').slice(0, 4);
    if (near.length) {
      html += '<div class="sec-title">Przystanki w pobliżu</div><ul class="list">';
      near.forEach((s) => { stopItems.push(s); html += placeRow(s, stopItems.length - 1, { side: meters(s.distance) }); });
      html += '</ul>';
    }
    if (rec.length) {
      html += '<div class="sec-title">Ostatnie przystanki</div><ul class="list">';
      rec.forEach((s) => { stopItems.push(s); html += placeRow(s, stopItems.length - 1); });
      html += '</ul>';
    }
    const modes = [...new Set(ls.map((l) => l.mode))];
    for (const m of modes) {
      html += `<div class="sec-title">${PLURAL[m] || m}</div><div class="line-grid">${ls.filter((l) => l.mode === m).map(chip).join('')}</div>`;
    }
  }
  if (id === seq) $('#linesBody').innerHTML = html;
}

onScreen('lines', () => { $('.ts-ic').innerHTML = icon('search'); renderLines(); });
$('#linesInput').addEventListener('input', debounce(renderLines, 150));
$('#linesBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-route]');
  if (r) { openLine(+r.dataset.route); return; }
  const li = e.target.closest('li[data-i]');
  if (li) openStop(stopItems[+li.dataset.i]);
});

// ---------------- LINIA
export function openLine(route) {
  S.line = { route, data: null, dir: 0 };
  go('line');
}

function renderLine() {
  const L = S.line;
  const d = L.data;
  $('#lineHead').innerHTML = `<div class="sh-row"><button class="icon-btn on-brand" data-back>${icon('back')}</button>
    <div class="sh-name">${d ? lineBadge(d, 'big') + ' ' + esc(d.long || d.agency || '') : 'Linia'}</div></div>`;
  if (!d) { $('#lineBody').innerHTML = '<div class="skel"></div><div class="skel"></div>'; return; }
  const dir = d.directions[L.dir] || d.directions[0];
  const c = lineColors(d).bg;
  const tabs = d.directions.length > 1
    ? `<div class="dir-tabs">${d.directions.map((x, i) => `<button class="fchip${i === L.dir ? ' on' : ''}" data-dir="${i}">→ ${esc(x.headsign)}</button>`).join('')}</div>` : '';
  const rows = dir.stops.map((s, i) => {
    const above = i > 0 ? `<span class="bar tp" style="--lc:${c}"></span>` : '';
    const below = i < dir.stops.length - 1 ? `<span class="bar bp" style="--lc:${c}"></span>` : '';
    return `<div class="tl-row" data-s="${i}" style="cursor:pointer"><div class="tl-time"></div><div class="tl-rail">${above}${below}<span class="dot${i === 0 ? ' start' : i === dir.stops.length - 1 ? ' end' : ''}" style="--lc:${c}"></span></div>
      <div class="tl-body"><div class="tl-name">${esc(s.name)}${s.platform ? ` <span class="plat">${esc(s.platform)}</span>` : ''}</div></div></div>`;
  }).join('');
  $('#lineBody').innerHTML = tabs + `<div class="tl">${rows}</div>`;
}

onScreen('line', async () => {
  renderLine();
  try {
    S.line.data = await api(`/api/c/${S.city.id}/line?` + qs({ route: S.line.route }));
  } catch (e) {
    $('#lineBody').innerHTML = `<div class="empty">Nie udało się pobrać linii: ${esc(e.message)}</div>`;
    return;
  }
  renderLine();
});

$('#lineBody').addEventListener('click', (e) => {
  const t = e.target.closest('[data-dir]');
  if (t) { S.line.dir = +t.dataset.dir; renderLine(); return; }
  const row = e.target.closest('[data-s]');
  if (!row) return;
  const d = S.line.data;
  const s = (d.directions[S.line.dir] || d.directions[0]).stops[+row.dataset.s];
  openStop({ name: s.name, lat: s.lat, lon: s.lon }, d.line);
});
