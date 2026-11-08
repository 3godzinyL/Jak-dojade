// Start aplikacji: zegar, miasto, mapa, GPS, ekran Trasa (wyszukiwanie w polach jak w oryginale), wybór na mapie, Konto, miasta.
import { api, qs, serverUrl, setServer, setToken } from './api.js';
import { icon, esc, debounce, setClockOffset, nowMs, hm, localNow, dateLabel, store } from './util.js';
import { ji } from './icons.js';
import { S, placeLabel, stopPlace, recentPlaces, addRecentPlace, recentTrips } from './state.js';
import { go, back, onScreen, openModal, closeModal, toast, switchTab, currentScreen, openOverlay, closeOverlay } from './nav.js';
import { sgRow } from './render.js';
import { createMap } from './map.js';
import { debugEnabled, setDebug } from './debug.js';
import { runSearch, openTimeModal, optionsChanged } from './screens.js';
import './tabs.js';
import './tickets.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const city = () => S.city.id;

// ---------------- ikony w statycznym HTML
$$('[data-ji]').forEach((el) => { el.innerHTML = ji(el.dataset.ji); });
$$('.hdr-btn[data-back], .map-back[data-back]').forEach((b) => { b.innerHTML = icon('back'); });
$$('.phdr-btn[data-back]').forEach((b) => { b.innerHTML = icon('close'); });
$$('[data-account]').forEach((b) => { b.innerHTML = icon('person'); b.onclick = () => go('account'); });
$$('[data-tickets]').forEach((b) => { b.onclick = () => switchTab('tickets'); });
$('#homeBack').innerHTML = icon('back');
$('#routeSave').innerHTML = icon('bookmark');
$('#routeGps').innerHTML = icon('locate');
$('#optsBtn').innerHTML = icon('tune');
$$('.bmenu [data-tab]').forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
$('.bmenu [data-tab="home"]').classList.add('on');

// ---------------- START
const bootMsg = (t, html = '') => { $('#bootMsg').innerHTML = esc(t) + html; };
const splashUntil = Date.now() + 700;

async function boot() {
  try {
    const t0 = Date.now();
    const t = await api('/api/time');
    const t1 = Date.now();
    S.clock = { ...t, deviceOffset: Math.round(t.now - (t0 + t1) / 2) };
    setClockOffset(S.clock.deviceOffset);
    if (Math.abs(S.clock.deviceOffset) > 60000) console.warn(`[zegar] urządzenie różni się od czasu sieci o ${(S.clock.deviceOffset / 60000).toFixed(1)} min — używam czasu serwera`);
  } catch (e) {
    await showLogin(null, 'Nie mogę połączyć się z serwerem — sprawdź adres.');
    return;
  }
  const st = await api('/api/auth/status');
  if (!st.user) { await showLogin(st.setup); return; }
  S.user = st.user;
  S.cities = await api('/api/cities');
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('trasa.city')); } catch { /* */ }
  const c = S.cities.find((x) => x.id === saved && x.status !== 'none') || S.cities.find((x) => x.status === 'ready') ||
    S.cities.find((x) => x.status === 'downloading' || x.status === 'loading') || S.cities[0];
  await useCity(c.id);
  startGeo();
}

async function waitReady(id) {
  for (;;) {
    S.cities = await api('/api/cities');
    const c = S.cities.find((x) => x.id === id);
    if (c.status === 'ready') return c;
    if (c.status === 'error') throw new Error(c.error);
    if (c.status === 'none') await api(`/api/cities/${id}/load`, { method: 'POST' });
    bootMsg(`${c.name}: ${c.status === 'downloading' ? 'pobieranie rozkładu' : 'przygotowanie rozkładu'}…`, c.message ? `<br><small>${esc(c.message)}</small>` : '');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function useCity(id) {
  $('#boot').classList.remove('hide');
  let c;
  try { c = await waitReady(id); } catch (e) {
    bootMsg(`Nie udało się przygotować rozkładu: ${e.message}`, '<br><br><button class="ybtn" onclick="location.reload()">Spróbuj ponownie</button>');
    return;
  }
  const changed = !S.city || S.city.id !== c.id;
  S.city = c;
  localStorage.setItem('trasa.city', JSON.stringify(c.id));
  $('#cityName').textContent = c.name;
  if (!S.map) S.map = createMap($('#map'), c.center);
  else if (changed) S.map.leaflet.setView(c.center, 13);
  if (changed) { S.from = S.me ? { kind: 'me' } : null; S.to = null; S.plan = null; S.lastKey = ''; }
  const wait = splashUntil - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  $('#boot').classList.add('hide');
  renderHome();
}

// ---------------- LOGOWANIE (pierwsze uruchomienie: konto admina + adres serwera)
let loginSetup = false;
async function showLogin(setup, msg = '') {
  if (setup === null) {
    try { setup = (await api('/api/auth/status')).setup; } catch { setup = false; }
  }
  loginSetup = !!setup;
  $('#loginTitle').textContent = loginSetup ? 'Pierwsze uruchomienie' : 'Zaloguj się';
  $('#loginSub').textContent = loginSetup ? 'Załóż konto administratora tego serwera' : '';
  $('#lgPass2Wrap').hidden = !loginSetup;
  $('#lgOk').textContent = loginSetup ? 'Załóż konto' : 'Zaloguj';
  $('#lgServer').value = serverUrl();
  $('#lgErr').textContent = msg;
  $('#boot').classList.add('hide');
  switchTab('login');
}

$('#lgOk').onclick = async () => {
  const server = $('#lgServer').value.trim();
  const login = $('#lgLogin').value.trim();
  const password = $('#lgPass').value;
  $('#lgErr').textContent = '';
  if (loginSetup && password !== $('#lgPass2').value) { $('#lgErr').textContent = 'Hasła się różnią'; return; }
  setServer(server && server !== location.origin ? server : null);
  try {
    const r = await api(loginSetup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', body: { login, password } });
    setToken(r.token);
    $('#lgPass').value = '';
    $('#lgPass2').value = '';
    location.reload();
  } catch (e) {
    if (e.status === 409) { await showLogin(false, 'Konto już istnieje — zaloguj się'); return; }
    $('#lgErr').textContent = e.status ? e.message : 'Brak połączenia z serwerem pod tym adresem';
  }
};
$('#lgPass').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !loginSetup) $('#lgOk').click(); });
window.addEventListener('trasa:auth', () => { if (currentScreen() !== 'login') { setToken(null); showLogin(null, 'Sesja wygasła — zaloguj się ponownie'); } });

// ---------------- GPS
let firstFix = true;
function startGeo() {
  if (!('geolocation' in navigator)) { S.geo = 'unsupported'; return; }
  if (!window.isSecureContext) { S.geo = 'insecure'; return; }
  navigator.geolocation.watchPosition((p) => {
    S.me = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    S.geo = 'ok';
    S.map.setMe(S.me);
    if (firstFix) { firstFix = false; if (!S.from) { S.from = { kind: 'me' }; renderHome(); } }
  }, (err) => { S.geo = err.code === 1 ? 'denied' : 'unknown'; }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

export function geoHint() {
  if (S.geo === 'insecure') return 'Lokalizacja GPS działa tylko przez https:// albo localhost (na telefonie: USB + chrome://inspect, opis w README).';
  if (S.geo === 'denied') return 'Brak zgody na lokalizację — wybierz punkt startu ręcznie.';
  if (S.geo === 'unsupported') return 'Ta przeglądarka nie udostępnia lokalizacji.';
  return '';
}

$('#routeGps').onclick = () => {
  if (S.me) S.map.flyTo(S.me.lat, S.me.lon, 16);
  else toast(geoHint() || 'Szukam lokalizacji…', 5000);
};

// ---------------- EKRAN TRASA
const homeEl = $('#home');
const inputs = { from: $('#inFrom'), to: $('#inTo') };
const fields = { from: $('#fFrom'), to: $('#fTo') };
const rights = { from: $('#rFrom'), to: $('#rTo') };
let searching = null; // 'from' | 'to' | null

function setRight(which, kind) {
  const b = rights[which];
  b.dataset.kind = kind || '';
  b.className = 'pf-right' + (kind ? ' show ' + kind : '');
  b.innerHTML = kind === 'clear' ? icon('close') : kind === 'gps' ? icon('locate') : kind === 'swap' ? icon('swap') : '';
  b.setAttribute('aria-label', { clear: 'Wyczyść', gps: 'Moja lokalizacja', swap: 'Zamień' }[kind] || '');
}

function renderFields() {
  const both = !!(S.from && S.to);
  for (const w of ['from', 'to']) {
    if (searching !== w) inputs[w].value = S[w] ? placeLabel(S[w]) : '';
    fields[w].classList.toggle('focus', searching === w);
  }
  $('.sform').classList.toggle('both', both && !searching);
  if (searching) {
    const v = inputs[searching].value;
    setRight(searching, v ? 'clear' : searching === 'from' && S.geo !== 'unsupported' ? 'gps' : '');
    setRight(searching === 'from' ? 'to' : 'from', '');
  } else {
    setRight('from', '');
    setRight('to', both ? 'swap' : '');
  }
}

export function renderHomeTop() {
  renderFields();
  const w = S.when;
  const n = localNow();
  const label = w.now ? hm(n.sec) : `${w.arriveBy ? 'Przyjazd ' : ''}${w.date !== n.date ? dateLabel(w.date) + ' ' : ''}${hm(w.time)}`;
  $('#hTime').innerHTML = `<span>${label}</span>${ji('arrow-down-short')}`;
  $('#hOpts').innerHTML = `Opcje${ji('filters', 'opt')}`;
  const c = optionsChanged();
  for (const id of ['#hOptsBadge', '#optsBadge']) { $(id).hidden = !c; $(id).textContent = c; }
}
window.addEventListener('trasa:query', renderHomeTop);
setInterval(() => { if (currentScreen() === 'home' && S.when.now && !searching) renderHomeTop(); }, 15000);

function renderHistory() {
  const trips = recentTrips();
  $('#histBody').innerHTML = trips.length
    ? trips.map((t, i) => `<button class="hist-row" data-r="${i}"><span class="rf-icons"><span class="rf-dot from">${ji('point')}</span><span class="rf-line"></span><span class="rf-dot to">${ji('point')}</span></span>
        <span class="hist-names"><span>${esc(placeLabel(t.from))}</span><span>${esc(placeLabel(t.to))}</span></span><span class="hist-go">${ji('arrow-right-short')}</span></button>`).join('')
    : '<div class="hist-empty">Nie wyszukiwałeś jeszcze żadnych tras.</div>';
}

export function renderHome() {
  if (!S.city) return;
  renderHomeTop();
  renderHistory();
  const both = !!(S.from && S.to);
  $('#goWrap').hidden = !both;
  $('#histSheet').hidden = both;
}
onScreen('home', () => { renderHome(); if (searching) renderSuggest(); });

$('#histHead').onclick = () => $('#histSheet').classList.toggle('open');
$('#histBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-r]');
  if (!r) return;
  const t = recentTrips()[+r.dataset.r];
  S.from = t.from; S.to = t.to;
  $('#histSheet').classList.remove('open');
  go('plan');
});
$('#goBtn').onclick = () => go('plan');
$('#hTime').onclick = () => openTimeModal();
$('#hOpts').onclick = () => go('options');
$('#cityBtn').onclick = () => go('cities');
$('#pkpBtn').onclick = () => toast('Tryb PKP: brak rozkładów kolei dalekobieżnej — tylko komunikacja miejska z GTFS.');

// ---- wyszukiwanie w polach (tryb „searching”: strzałka wstecz, podpowiedzi, bez dolnego menu)
function enterSearch(which) {
  if (searching === which) return;
  const first = !searching;
  searching = which;
  homeEl.classList.add('searching');
  document.body.classList.add('searching');
  $('#homeBack').hidden = false;
  $('#suggest').hidden = false;
  if (first) openOverlay(exitSearch);
  renderFields();
  if (inputs[which].value.trim().length >= 2) onType(); else renderSuggest();
}

function exitSearch() {
  searching = null;
  homeEl.classList.remove('searching');
  document.body.classList.remove('searching');
  $('#homeBack').hidden = true;
  $('#suggest').hidden = true;
  S.saveAs = null;
  document.activeElement && document.activeElement.blur();
  renderHome();
}

for (const w of ['from', 'to']) {
  inputs[w].addEventListener('focus', () => enterSearch(w));
  inputs[w].addEventListener('input', () => { renderFields(); onType(); });
  inputs[w].addEventListener('keydown', (e) => { if (e.key === 'Enter' && sgItems.length) choose(sgItems[0]); });
  rights[w].addEventListener('pointerdown', (e) => e.preventDefault()); // nie zabieraj fokusu z pola
  rights[w].onclick = () => {
    const k = rights[w].dataset.kind;
    if (k === 'clear') { inputs[w].value = ''; S[w] = null; renderFields(); renderSuggest(); inputs[w].focus(); }
    else if (k === 'gps') pickMe();
    else if (k === 'swap') { [S.from, S.to] = [S.to, S.from]; renderHome(); }
  };
}
$('#homeBack').onclick = () => closeOverlay();

function pickMe() {
  if (!S.me) { toast(geoHint() || 'Jeszcze nie mam lokalizacji — spróbuj za chwilę', 5000); return; }
  choose({ kind: 'me', name: 'Moja lokalizacja' });
}

// punkty użytkownika: Dom, Praca + własne
const upKey = () => 'upoints.' + city();
const upoints = () => store.get(upKey(), { home: null, work: null, custom: [] });

function upointsHtml() {
  const u = upoints();
  const item = (key, ic, name, p, extra = '') => `<button class="upoint${p ? ' set' : ''}${extra}" data-up="${key}"><span class="up-ic">${ji(ic)}</span><span>${esc(name)}</span></button>`;
  return `<div class="upoints">${item('home', 'user-point-home', 'Dom', u.home)}${item('work', 'user-point-work', 'Praca', u.work)}` +
    u.custom.map((p, i) => item('c' + i, 'address', p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name, p)).join('') +
    (u.custom.length < 2 ? item('add', 'add', 'Dodaj', null, ' add') : '') + '</div>';
}

let sgSeq = 0;
let sgItems = [];

function renderSuggest(stops = [], places = [], loading = false) {
  if (!searching) return;
  const q = inputs[searching].value.trim();
  sgItems = [];
  const add = (p, opts) => { sgItems.push(p); return sgRow(p, sgItems.length - 1, { q, ...opts }); };
  let html = '';
  if (!q) {
    html += `<div class="sg-block">${upointsHtml()}</div>`;
    const rec = recentPlaces();
    html += `<div class="sg-block">${rec.length ? rec.map((p) => add(p, { fill: true })).join('') : '<div class="sg-note">Nie wyszukiwałeś jeszcze żadnych punktów.</div>'}</div>`;
  } else if (stops.length || places.length) {
    html += `<div class="sg-block">${stops.map((s) => add(stopPlace(s), { fill: true })).join('')}${places.map((p) => add({ ...p, kind: 'place' }, { fill: true })).join('')}</div>`;
    if (places.length) html += '<div class="sg-small">Adresy: © OpenStreetMap (Photon)</div>';
  } else if (!loading) html += '<div class="sg-block"><div class="sg-note">Nic nie znaleziono</div></div>';
  html += `<div class="sg-block"><div class="sg-row sg-map" data-map="1"><span class="sg-ic pin">${icon('pin')}</span>Wybierz z mapy</div></div>`;
  if (S.saveAs) html = `<div class="sg-small" style="padding-top:12px">Wybierz miejsce, które zapiszę jako ${S.saveAs === 'home' ? '„Dom”' : S.saveAs === 'work' ? '„Praca”' : 'własny punkt'}.</div>` + html;
  $('#suggest').innerHTML = html;
}

const geocodeLater = debounce(async (q, id, stops) => {
  if (id !== sgSeq) return;
  let places = [];
  try { places = (await api(`/api/c/${city()}/geocode?` + qs({ q }))).places; } catch { /* tylko przystanki */ }
  if (id === sgSeq) renderSuggest(stops, places, false);
}, 350);

const onType = debounce(async () => {
  if (!searching) return;
  const q = inputs[searching].value.trim();
  const id = ++sgSeq;
  if (q.length < 2) { renderSuggest(); return; }
  let stops = [];
  try { stops = (await api(`/api/c/${city()}/search?` + qs({ q, limit: 8 }))).stops; } catch { /* */ }
  if (id !== sgSeq) return;
  renderSuggest(stops, [], q.length >= 3);
  if (q.length >= 3) geocodeLater(q, id, stops);
}, 120);

function saveUserPoint(p) {
  const u = upoints();
  const slim = { kind: p.kind, name: p.name, sub: p.sub, lat: p.lat, lon: p.lon, modes: p.modes, lines: p.lines };
  if (S.saveAs === 'home') u.home = slim;
  else if (S.saveAs === 'work') u.work = slim;
  else u.custom.push(slim);
  store.set(upKey(), u);
  toast(`Zapisano: ${S.saveAs === 'home' ? 'Dom' : S.saveAs === 'work' ? 'Praca' : p.name}`);
  S.saveAs = null;
}

async function choose(p) {
  const w = searching;
  if (!w) return;
  if (S.saveAs && p.kind !== 'me') saveUserPoint(p);
  S[w] = p.kind === 'me' ? { kind: 'me' } : p;
  if (p.kind !== 'me') addRecentPlace(p);
  const other = w === 'from' ? 'to' : 'from';
  if (!S[other]) { inputs[other].focus(); return; }
  await closeOverlay();
}

$('#suggest').addEventListener('pointerdown', (e) => { if (e.target.closest('.sg-row, .upoint, .sg-fill')) e.preventDefault(); });
$('#suggest').addEventListener('click', (e) => {
  const f = e.target.closest('[data-fill]');
  if (f) { const p = sgItems[+f.dataset.fill]; inputs[searching].value = p.name; renderFields(); onType(); inputs[searching].focus(); return; }
  const up = e.target.closest('[data-up]');
  if (up) {
    const key = up.dataset.up;
    const u = upoints();
    const p = key === 'home' ? u.home : key === 'work' ? u.work : key === 'add' ? null : u.custom[+key.slice(1)];
    if (p) { choose(p); return; }
    S.saveAs = key === 'add' ? 'custom' : key;
    renderSuggest();
    inputs[searching].focus();
    return;
  }
  if (e.target.closest('[data-map]')) { S.pickTarget = searching; go('mappick'); return; }
  const row = e.target.closest('.sg-row[data-i]');
  if (row) choose(sgItems[+row.dataset.i]);
});
$('#suggest').addEventListener('contextmenu', (e) => {
  const up = e.target.closest('.upoint.set');
  if (!up) return;
  e.preventDefault();
  const u = upoints();
  const key = up.dataset.up;
  if (key === 'home') u.home = null; else if (key === 'work') u.work = null; else u.custom.splice(+key.slice(1), 1);
  store.set(upKey(), u);
  toast('Usunięto zapisany punkt');
  renderSuggest();
});

// ---------------- WYBÓR NA MAPIE
let mpSeq = 0;
let mpPlace = null;
const mpUpdate = debounce(async () => {
  const c = S.map.center();
  const id = ++mpSeq;
  mpPlace = { kind: 'map', name: 'Punkt na mapie', sub: '', lat: c.lat, lon: c.lon };
  $('#mpName').textContent = 'Wczytywanie…';
  $('#mpSub').textContent = '';
  try {
    const r = await api(`/api/c/${city()}/reverse?` + qs({ lat: c.lat.toFixed(6), lon: c.lon.toFixed(6) }));
    if (id !== mpSeq) return;
    if (r.stop) mpPlace = stopPlace(r.stop);
    else if (r.place) mpPlace = { kind: 'map', name: r.place.name || 'Punkt na mapie', sub: r.place.sub, lat: c.lat, lon: c.lon };
  } catch { /* zostaje punkt */ }
  if (id !== mpSeq) return;
  $('#mpName').textContent = mpPlace.name;
  $('#mpSub').textContent = mpPlace.kind === 'stop' ? 'Przystanek · ' + (mpPlace.lines || []).slice(0, 10).join(', ') : mpPlace.sub || '';
}, 250);

onScreen('mappick', () => {
  if (S.me) S.map.leaflet.setView([S.me.lat, S.me.lon], 16);
  else S.map.leaflet.setView(S.city.center, 15);
  S.map.invalidate();
  S.map.leaflet.on('moveend', mpUpdate);
  mpUpdate();
}, () => S.map.leaflet.off('moveend', mpUpdate));

$('#mpOk').onclick = async () => {
  if (!mpPlace) return;
  const p = mpPlace;
  back();
  await new Promise((r) => setTimeout(r, 60));
  if (searching) choose(p);
  else { S[S.pickTarget] = p; addRecentPlace(p); renderHome(); }
};

// ---------------- KONTO
function renderAccount() {
  const row = (a, name, sub = '', ic = 'chevronRight') => `<button class="acc-row" data-a="${a}"><span class="grow">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev">${icon(ic)}</span></button>`;
  $('#accountBody').innerHTML = `<button class="acc-city" data-a="city"><span><small>Wybrane miasto</small><b>${esc(S.city ? S.city.name : '')}</b></span>${ji('dropdown-arrows')}</button>
    <div class="acc-sec">Profil</div>
    <button class="acc-row user" data-a="me"><span class="acc-ava">${ji('profile')}</span><span class="grow">${esc(S.user || '')}<small>administrator · ${esc(serverUrl() || 'ten serwer')}</small></span><span class="chev">${icon('chevronRight')}</span></button>
    ${row('logout', 'Wyloguj')}
    <div class="acc-sec">Serwer</div>
    ${row('info', 'Rozkład i serwer', 'wersje rozkładów, zegar, kod QR na telefon')}
    ${row('debug', 'Konsola debugowania', debugEnabled() ? 'włączona' : 'wyłączona')}
    ${row('dev', 'Podgląd w ramce telefonu', 'na komputerze: /dev', 'external')}
    <div class="acc-sec">O aplikacji</div>
    ${row('src', 'Źródła danych', 'rozkłady GTFS przewoźników, mapa © OpenStreetMap')}
    <div class="acc-foot">Trasa — lokalny planer do nauki. Wygląd wzorowany na mobilnej stronie jakdojade.pl; aplikacja nie korzysta z ich serwerów.</div>`;
}
onScreen('account', renderAccount);
$('#accountBody').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  const k = a.dataset.a;
  if (k === 'city') go('cities');
  else if (k === 'debug') { setDebug(!debugEnabled()); renderAccount(); }
  else if (k === 'info' || k === 'me') openInfoModal();
  else if (k === 'src') openSourcesModal();
  else if (k === 'dev') window.top.location.href = '/dev';
  else if (k === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* i tak wyloguj lokalnie */ }
    setToken(null);
    location.reload();
  }
});

// ---------------- WYBÓR MIASTA
const STATUS = { ready: '', downloading: 'pobieranie rozkładu…', loading: 'przygotowanie rozkładu…', error: 'błąd rozkładu', none: 'rozkład do pobrania' };
function renderCities() {
  const q = $('#cityInput').value.trim().toLowerCase();
  const list = S.cities.filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  $('#citiesBody').innerHTML = list.map((c) => `<button class="crow${c.id === S.city.id ? ' on' : ''}" data-c="${c.id}">
    ${c.id === S.city.id ? `<span class="ccheck">${ji('check')}</span>` : ''}
    <span class="cmain"><span class="cn">${esc(c.name)}</span><span class="cs" style="display:block">${esc([...new Set(c.feeds.map((f) => f.name.replace(/ — .*/, '')))].join(', '))}</span></span>
    ${STATUS[c.status] ? `<span class="cside">${STATUS[c.status]}</span>` : ''}</button>`).join('') || '<div class="sg-note">Nie znaleziono miasta</div>';
}
onScreen('cities', async () => {
  $('#cityInput').value = '';
  renderCities();
  try { S.cities = await api('/api/cities'); renderCities(); } catch { /* lista z pamięci */ }
});
$('#cityInput').addEventListener('input', renderCities);
$('#citiesBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-c]');
  if (!r) return;
  const id = r.dataset.c;
  switchTab('home');
  if (id !== S.city.id) useCity(id);
});

async function openInfoModal() {
  let dev = null;
  try { dev = await api('/api/dev/info'); } catch { /* */ }
  const c = S.city;
  const off = S.clock ? S.clock.deviceOffset : 0;
  const lan = dev && dev.lan[0] ? dev.lan[0].url : '';
  const fmt = (d) => (d ? `${String(d).slice(6, 8)}.${String(d).slice(4, 6)}.${String(d).slice(0, 4)}` : '?');
  openModal(`<div class="m-title">Rozkład i serwer</div>
    <div class="m-sec"><div class="m-label">${esc(c.name)} — paczki GTFS</div><dl class="kv">${c.feeds.map((f) => `<dt>${esc(f.id)}</dt><dd>${esc(f.name)}<br><span class="mono">wersja ${esc(f.version || '?')} · ważny ${fmt(f.start)} – ${fmt(f.end)}</span></dd>`).join('')}</dl></div>
    <div class="m-sec"><div class="m-label">Model</div><div class="mono">${c.stats ? Object.entries(c.stats).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}</div></div>
    <div class="m-sec"><div class="m-label">Zegar</div><div style="font-size:14px">${Math.abs(off) > 60000 ? `Zegar tego urządzenia różni się o ${(off / 60000).toFixed(1)} min od czasu sieci — aplikacja liczy „za X min” wg serwera.` : 'Zegar urządzenia zgodny z czasem sieci.'}
      <span class="mono">(serwer: ${esc(S.clock ? S.clock.source : '?')}, ${new Date(nowMs()).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' })})</span></div></div>
    ${lan ? `<div class="m-sec"><div class="m-label">Otwórz na telefonie (ta sama sieć Wi-Fi)</div><div class="qr"><img src="/api/dev/qr.svg?text=${encodeURIComponent(lan)}" alt="QR">
      <div><div class="mono">${esc(lan)}</div>${dev.lan.slice(1).map((l) => `<div class="mono">${esc(l.url)}</div>`).join('')}<div class="sg-small" style="padding:6px 0">GPS przez Wi-Fi nie zadziała (brak https) — do testów z lokalizacją użyj USB i chrome://inspect.</div></div></div></div>` : ''}
    ${dev ? `<div class="m-sec"><div class="m-label">Serwer</div><div class="mono">Node ${esc(dev.node)} · RAM ${dev.rssMB} MB · działa ${Math.round(dev.uptimeSec / 60)} min</div></div>` : ''}
    <div class="m-btns"><button class="ybtn" id="infOk">Zamknij</button><button class="tbtn" id="infReload">Odśwież rozkład</button></div>`, (el) => {
    $('#infOk', el).onclick = () => closeModal();
    $('#infReload', el).onclick = async () => {
      await api(`/api/cities/${c.id}/load?force=1`, { method: 'POST' });
      await closeModal();
      toast('Pobieram świeży rozkład w tle…');
    };
  });
}

function openSourcesModal() {
  openModal(`<div class="m-title">Źródła danych</div>
    <div class="m-sec" style="font-size:14px;line-height:20px">Rozkłady: otwarte dane GTFS przewoźników (ZTM Gdańsk, ZTP Kraków, ZTM Poznań, Warszawa — mkuran.pl).<br>
    Mapa i adresy: © OpenStreetMap (kafelki OSM, geokoder Photon).<br>Trasy liczy własny silnik (RAPTOR) na tym serwerze.<br><br>
    Wygląd interfejsu, czcionka Manrope i ikony interfejsu odtworzone z mobilnej strony jakdojade.pl wyłącznie do lokalnej nauki — bez ich logo i bez korzystania z ich serwerów.</div>
    <div class="m-btns"><button class="ybtn" id="srcOk">Zamknij</button></div>`, (el) => { $('#srcOk', el).onclick = () => closeModal(); });
}

boot().catch((e) => {
  console.error(e);
  bootMsg('Błąd uruchamiania: ' + e.message);
});

// ułatwienie dla konsoli/eruda
window.trasa = { S, api, runSearch };
