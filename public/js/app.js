// Start aplikacji: zegar, miasto, mapa, GPS, ekran Trasa (wyszukiwanie w polach jak w oryginale), wybór na mapie, Konto, miasta.
import { api, qs, serverUrl, setServer, setToken } from './api.js';
import { icon, esc, debounce, setClockOffset, nowMs, hm, localNow, dateLabel, store } from './util.js';
import { ji } from './icons.js';
import { S, placeLabel, stopPlace, recentPlaces, addRecentPlace, recentTrips, favTrips } from './state.js';
import { go, back, onScreen, openModal, closeModal, toast, switchTab, currentScreen, openOverlay, closeOverlay } from './nav.js';
import { sgRow } from './render.js';
import { createMap } from './map.js';
import { debugEnabled, setDebug } from './debug.js';
import { runSearch, openTimeModal, optionsChanged } from './screens.js';
import './tabs.js';
import './tickets.js';
import { renderAd } from './ads.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const city = () => S.city.id;

// ---------------- ikony w statycznym HTML
$$('[data-ji]').forEach((el) => { el.innerHTML = ji(el.dataset.ji); });
$$('.hdr-btn[data-back], .map-back[data-back]').forEach((b) => { b.innerHTML = icon('back'); });
$$('.phdr-btn[data-back]').forEach((b) => { b.innerHTML = icon('close'); });
$('#cities .phdr-btn[data-back]').innerHTML = icon('back'); // „Wybierz miasto” ma strzałkę wstecz, nie krzyżyk
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

// mikrofon w aktywnym, pustym polu (jak w aplikacji: mikrofon + GPS); rozpoznawanie mowy przeglądarki
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const mics = { from: $('#mFrom'), to: $('#mTo') };
let rec = null;
for (const w of ['from', 'to']) {
  mics[w].innerHTML = icon('mic');
  mics[w].addEventListener('pointerdown', (e) => e.preventDefault());
  mics[w].onclick = () => {
    if (!SpeechRec) return;
    if (rec) { rec.stop(); return; }
    rec = new SpeechRec();
    rec.lang = 'pl-PL';
    rec.interimResults = true;
    mics[w].classList.add('on');
    rec.onresult = (e) => { inputs[w].value = [...e.results].map((r) => r[0].transcript).join(''); renderFields(); onType(); };
    rec.onerror = (e) => { if (e.error === 'not-allowed') toast('Brak zgody na mikrofon'); };
    rec.onend = () => { rec = null; mics[w].classList.remove('on'); };
    rec.start();
  };
}

function renderFields() {
  const F = fieldState();
  const both = !!(F.from && F.to);
  for (const w of ['from', 'to']) {
    if (searching !== w) inputs[w].value = F[w] ? placeLabel(F[w]) : '';
    fields[w].classList.toggle('focus', searching === w);
    mics[w].hidden = !(SpeechRec && searching === w && !inputs[w].value);
  }
  $('.sform').classList.toggle('both', both && !searching);
  if (searching) {
    const v = inputs[searching].value;
    setRight(searching, v ? 'clear' : S.mode !== 'pkp' && S.geo !== 'unsupported' ? 'gps' : '');
    setRight(searching === 'from' ? 'to' : 'from', '');
  } else {
    setRight('from', '');
    setRight('to', both ? 'swap' : '');
  }
}

// ---- tryb PKP: osobne pola stacji, dzień + godzina na przycisku, bez plakietki opcji.
// Rozkładów kolei dalekobieżnej nie mamy — pola i wygląd są, wyszukiwanie mówi o tym wprost.
S.mode = 'city';
S.pkp = { from: null, to: null };
const fieldState = () => (S.mode === 'pkp' ? S.pkp : S);
function setMode(m) {
  if (S.mode === m) return;
  S.mode = m;
  const pkp = m === 'pkp';
  $('#cityBtn').classList.toggle('on', !pkp);
  $('#pkpBtn').classList.toggle('on', pkp);
  $('.mode-tabs').classList.toggle('pkp', pkp);
  inputs.from.placeholder = pkp ? 'Wybierz stację początkową' : 'Skąd jedziemy?';
  inputs.to.placeholder = pkp ? 'Wybierz stację końcową' : 'Dokąd jedziemy?';
  renderHome();
}

export function renderHomeTop() {
  renderFields();
  const w = S.when;
  const n = localNow();
  let label = w.now ? hm(n.sec) : `${w.arriveBy ? 'Przyjazd ' : ''}${w.date !== n.date ? dateLabel(w.date) + ' ' : ''}${hm(w.time)}`;
  if (S.mode === 'pkp') label = `${pkpDay(w.now ? n.date : w.date)} ${hm(w.now ? n.sec : w.time)}`; // „Niedz. 08 lis 02:58”
  $('#hTime').innerHTML = `<span>${label}</span>${ji('arrow-down-short')}`;
  $('#hOpts').innerHTML = `Opcje${ji('filters', 'opt')}`;
  const c = S.mode === 'pkp' ? 0 : optionsChanged();
  for (const id of ['#hOptsBadge', '#optsBadge']) { $(id).hidden = !c; $(id).textContent = c; }
}
window.addEventListener('trasa:query', renderHomeTop);
setInterval(() => { if (currentScreen() === 'home' && S.when.now && !searching) renderHomeTop(); }, 15000);

// nagłówki dni jak w aplikacji: „Dzisiaj, 6 lis 2026”, „śr. 4 lis 2026”
const H_DOW = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
const H_MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const P_DOW = ['Niedz.', 'Pon.', 'Wt.', 'Śr.', 'Czw.', 'Pt.', 'Sob.'];
function pkpDay(di) { // di = RRRRMMDD
  const d = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100));
  return `${P_DOW[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, '0')} ${H_MON[d.getUTCMonth()]}`;
}
function dayHeader(ms) {
  const f = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date(x));
  const [y, m, d] = f(ms).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const text = `${d} ${H_MON[m - 1]} ${y}`;
  if (f(ms) === f(nowMs())) return `Dzisiaj, ${text}`;
  if (f(ms) === f(nowMs() - 86400000)) return `Wczoraj, ${text}`;
  return `${H_DOW[dow]} ${text}`;
}

const histItems = [];
function histRow(t) {
  histItems.push(t);
  return `<button class="hist-row" data-r="${histItems.length - 1}"><span class="rf-icons"><span class="rf-dot from">${ji('point')}</span><span class="rf-line"></span><span class="rf-dot to">${ji('point')}</span></span>
    <span class="hist-names"><span>${esc(placeLabel(t.from))}</span><span>${esc(placeLabel(t.to))}</span></span><span class="hist-go">${ji('arrow-right-short')}</span></button>`;
}

function renderHistory() {
  if (S.mode === 'pkp') { $('#histBody').innerHTML = '<div class="hist-empty">Nie wyszukiwałeś jeszcze żadnych tras.</div>'; return; }
  const trips = recentTrips();
  const favs = favTrips();
  histItems.length = 0;
  if (!trips.length && !favs.length) { $('#histBody').innerHTML = '<div class="hist-empty">Nie wyszukiwałeś jeszcze żadnych tras.</div>'; return; }
  let html = '';
  if (favs.length) html += '<div class="hist-date">Ulubione</div>' + favs.map(histRow).join('');
  let last = '';
  for (const t of trips) {
    const day = t.at ? dayHeader(t.at) : 'Wcześniej';
    if (day !== last) { html += `<div class="hist-date">${day}</div>`; last = day; }
    html += histRow(t);
  }
  $('#histBody').innerHTML = html;
}

export function renderHome() {
  if (!S.city) return;
  renderHomeTop();
  renderHistory();
  const both = S.mode !== 'pkp' && !!(S.from && S.to);
  $('#goWrap').hidden = !both;
  $('#histSheet').hidden = both;
  if (!$('#adHome').dataset.ad) renderAd($('#adHome'), 'home');
}
onScreen('home', () => { renderAd($('#adHome'), 'home'); renderHome(); if (searching) renderSuggest(); });

$('#histHead').onclick = () => $('#histSheet').classList.toggle('open');
$('#histBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-r]');
  if (!r) return;
  const t = histItems[+r.dataset.r];
  S.from = t.from; S.to = t.to;
  $('#histSheet').classList.remove('open');
  go('plan');
});
$('#goBtn').onclick = () => go('plan');
$('#hTime').onclick = () => openTimeModal();
$('#hOpts').onclick = () => go('options');
$('#cityBtn').onclick = () => (S.mode === 'pkp' ? setMode('city') : go('cities'));
$('#pkpBtn').onclick = () => setMode('pkp');

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

// zapisane miejsca: Dom, Praca, Szkoła + własne. Jak w aplikacji: na pasku są tylko ustawione miejsca
// (np. „Szkoła”) i „Edytuj”; gdy nic nie ustawiono — Dom i Praca do ustawienia.
const upKey = () => 'upoints.' + city();
const upoints = () => { const u = store.get(upKey(), {}); return { home: u.home || null, work: u.work || null, school: u.school || null, custom: u.custom || [] }; };
const UP_NAME = { home: 'Dom', work: 'Praca', school: 'Szkoła' };
const upIcon = (k) => (k === 'home' ? ji('user-point-home') : k === 'work' ? ji('user-point-work') : k === 'school' ? icon('school') : ji('address'));
const shortName = (s) => (s.length > 12 ? s.slice(0, 11) + '…' : s);

function upointsHtml() {
  const u = upoints();
  const item = (key, name, set) => `<button class="upoint${set ? ' set' : ''}" data-up="${key}"><span class="up-ic">${upIcon(key)}</span><span>${esc(name)}</span></button>`;
  let html = '';
  for (const k of ['home', 'work', 'school']) if (u[k]) html += item(k, UP_NAME[k], true);
  u.custom.forEach((p, i) => { html += item('c' + i, shortName(p.name), true); });
  if (!html) html = item('home', 'Dom', false) + item('work', 'Praca', false);
  return `<div class="upoints">${html}<button class="upoint edit" data-upedit><span class="up-ic">${icon('edit')}</span><span>Edytuj</span></button></div>`;
}

function openUpEdit() {
  const paint = (el) => {
    const u = upoints();
    const row = (key, name, p) => `<div class="upe-row"><span class="up-ic">${upIcon(key)}</span><span class="grow">${esc(name)}<small>${p ? esc(placeLabel(p)) : 'Nie ustawiono'}</small></span>
      ${p ? `<button class="tbtn sm" data-updel="${key}">Usuń</button>` : `<button class="tbtn sm" data-upset="${key}">Ustaw</button>`}</div>`;
    el.querySelector('.upe-list').innerHTML = ['home', 'work', 'school'].map((k) => row(k, UP_NAME[k], u[k])).join('') +
      u.custom.map((p, i) => row('c' + i, p.name, p)).join('') +
      (u.custom.length < 3 ? `<button class="acc-opt" data-upset="custom">${ji('add')}<span>Dodaj miejsce</span></button>` : '');
  };
  openModal(`<div class="m-title">Twoje miejsca</div><div class="upe-list"></div><div class="m-btns"><button class="ybtn" data-close>Gotowe</button></div>`, (el) => {
    paint(el);
    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-close]')) { closeModal(); return; }
      const del = e.target.closest('[data-updel]');
      if (del) {
        const u = upoints();
        const k = del.dataset.updel;
        if (k.startsWith('c')) u.custom.splice(+k.slice(1), 1); else u[k] = null;
        store.set(upKey(), u);
        paint(el);
        renderSuggest();
        return;
      }
      const set = e.target.closest('[data-upset]');
      if (set) {
        S.saveAs = set.dataset.upset;
        await closeModal();
        renderSuggest();
        if (searching) inputs[searching].focus();
      }
    });
  });
}

let sgSeq = 0;
let sgItems = [];

function renderSuggest(stops = [], places = [], loading = false) {
  if (!searching) return;
  const q = inputs[searching].value.trim();
  sgItems = [];
  const add = (p, opts) => { sgItems.push(p); return sgRow(p, sgItems.length - 1, { q, ...opts }); };
  let html = '';
  if (S.mode === 'pkp') {
    $('#suggest').innerHTML = `<div class="sg-block"><div class="sg-note">Rozkłady PKP nie są podłączone do tego serwera.<br>
      Pociągi SKM w Trójmieście znajdziesz w trybie „${esc(S.city.name)}”.</div></div>`;
    return;
  }
  if (!q) {
    html += `<div class="sg-block">${upointsHtml()}</div>`;
    html += '<div class="ad-native" id="adSuggest"></div>';
    const rec = recentPlaces();
    html += `<div class="sg-block">${rec.length ? rec.map((p) => add(p, { fill: true })).join('') : '<div class="sg-note">Nie wyszukiwałeś jeszcze żadnych punktów.</div>'}</div>`;
  } else if (stops.length || places.length) {
    html += `<div class="sg-block">${stops.map((s) => add(stopPlace(s), { fill: true })).join('')}${places.map((p) => add({ ...p, kind: 'place' }, { fill: true })).join('')}</div>`;
    if (places.length) html += '<div class="sg-small">Adresy: © OpenStreetMap (Photon)</div>';
  } else if (!loading) html += '<div class="sg-block"><div class="sg-note">Nic nie znaleziono</div></div>';
  html += `<div class="sg-block"><div class="sg-row sg-map" data-map="1"><span class="sg-ic pin">${icon('pin')}</span>Wybierz z mapy</div></div>`;
  if (S.saveAs) html = `<div class="sg-small" style="padding-top:12px">Wybierz miejsce, które zapiszę jako ${UP_NAME[S.saveAs] ? `„${UP_NAME[S.saveAs]}”` : 'własne miejsce'}.</div>` + html;
  $('#suggest').innerHTML = html;
  renderAd($('#adSuggest'), 'native');
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
  if (UP_NAME[S.saveAs]) u[S.saveAs] = slim;
  else u.custom.push(slim);
  store.set(upKey(), u);
  toast(`Zapisano: ${UP_NAME[S.saveAs] || p.name}`);
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
  if (e.target.closest('[data-upedit]')) { openUpEdit(); return; }
  const up = e.target.closest('[data-up]');
  if (up) {
    const key = up.dataset.up;
    const u = upoints();
    const p = UP_NAME[key] ? u[key] : u.custom[+key.slice(1)];
    if (p) { choose(p); return; }
    S.saveAs = key;
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
  if (UP_NAME[key]) u[key] = null; else u.custom.splice(+key.slice(1), 1);
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

// ---------------- WYGLĄD: tryb ciemny (systemowy / jasny / ciemny) i animacje — jak w Koncie aplikacji
const THEME_NAMES = { system: 'Systemowy', light: 'Jasny', dark: 'Ciemny' };
const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme() {
  const t = store.get('theme', 'system');
  const dark = t === 'dark' || (t === 'system' && sysDark.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.classList.toggle('no-anim', !store.get('anim', true));
  const meta = document.querySelectorAll('meta[name="theme-color"]');
  meta.forEach((m) => { m.content = dark ? '#191919' : '#282641'; m.removeAttribute('media'); });
}
sysDark.addEventListener('change', applyTheme);

function openThemeModal() {
  const cur = store.get('theme', 'system');
  openModal(`<div class="m-title">Tryb ciemny</div>
    ${Object.entries(THEME_NAMES).map(([v, t]) => `<button class="acc-opt${v === cur ? ' on' : ''}" data-theme="${v}"><span class="radio"></span>${t}${v === 'system' ? '<small style="color:var(--ink-2);font-size:13px;margin-left:auto">jak w telefonie</small>' : ''}</button>`).join('')}
    <div class="m-btns"><button class="tbtn" id="thClose">Zamknij</button></div>`, (el) => {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme]');
      if (!b) return;
      store.set('theme', b.dataset.theme);
      applyTheme();
      el.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x === b));
      renderAccount();
    });
    $('#thClose', el).onclick = () => closeModal();
  });
}

// ---------------- KONTO: profil użytkownika + ukryty panel admina (przytrzymanie wiersza profilu 5 s)
let adminMode = false;
const accMoney = (v) => (+v || 0).toFixed(2).replace('.', ',');
const walletBalance = () => store.get('wallet.pln', 0);
const setWallet = (v) => store.set('wallet.pln', Math.max(0, Math.round(v * 100) / 100));
const accRow = (a, name, sub = '', ic = 'chevronRight') => `<button class="acc-row" data-a="${a}"><span class="grow">${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="chev">${icon(ic)}</span></button>`;

const APP_VERSION = '0.1.0';
// ilustracja karty „Subskrypcja” (własny rysunek: góry, słońce, drzewa, kręta droga i autobus)
const SUB_ART = `<svg class="as-art" viewBox="0 0 343 150" aria-hidden="true">
  <circle cx="70" cy="30" r="20" fill="#f2b705"/>
  <path d="M40 92 98 16l58 76z" fill="#3a3a3a"/><path d="M118 92l40-52 40 52z" fill="#4a4a4a"/>
  <g fill="#3bbf7a"><circle cx="226" cy="44" r="10"/><circle cx="246" cy="52" r="7"/><circle cx="266" cy="44" r="10"/><circle cx="288" cy="44" r="10"/><circle cx="306" cy="54" r="7"/></g>
  <g stroke="#5a5a5a" stroke-width="2"><path d="M226 54v38M246 59v33M266 54v38M288 54v38M306 61v31"/></g>
  <path d="M30 96h270a22 22 0 0 1 0 44H-10" fill="none" stroke="#2c2c2c" stroke-width="26" stroke-linecap="round"/>
  <path d="M40 96h258M290 140H-10" stroke="#8a8a8a" stroke-width="2" stroke-dasharray="10 12"/>
  <circle cx="30" cy="96" r="12" fill="#2f8cff"/><circle cx="30" cy="96" r="5" fill="#1b1b1b"/>
  <rect x="150" y="112" width="96" height="36" rx="7" fill="#ffd442"/>
  <g fill="#1b1b1b"><rect x="158" y="118" width="13" height="14" rx="3"/><rect x="175" y="118" width="13" height="14" rx="3"/><rect x="192" y="118" width="13" height="14" rx="3"/><rect x="209" y="118" width="13" height="14" rx="3"/><rect x="226" y="118" width="13" height="14" rx="3"/>
  <circle cx="166" cy="148" r="6"/><circle cx="182" cy="148" r="6"/><circle cx="214" cy="148" r="6"/><circle cx="230" cy="148" r="6"/></g>
</svg>`;
// proste ikonki wierszy „O nas” (własne glify, bez logotypów)
const SOCIAL = {
  facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1877f2"/><path d="M13.3 19.5v-6h2l.3-2.4h-2.3V9.6c0-.7.2-1.2 1.2-1.2h1.2V6.3c-.2 0-1-.1-1.8-.1-1.8 0-3 1.1-3 3.1v1.8h-2v2.4h2v6z" fill="#fff"/></svg>',
  instagram: '<svg viewBox="0 0 24 24"><defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f9a825"/><stop offset=".5" stop-color="#e1306c"/><stop offset="1" stop-color="#833ab4"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="none" stroke="url(#igg)" stroke-width="2.2"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="url(#igg)" stroke-width="2.2"/><circle cx="17.4" cy="6.6" r="1.3" fill="#e1306c"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24"><path d="M15.5 3c.3 2.2 1.6 3.6 3.8 3.8v2.6c-1.3.1-2.5-.3-3.8-1.1v5.3c0 6.6-7.2 8.7-10.1 4C3.6 14.6 5.1 9.5 10.8 9.3v2.8c-.4.1-.9.2-1.3.3-1.3.4-2 1.3-1.8 2.8.4 2.6 5 3.4 4.7-1.7V3z" fill="currentColor"/></svg>',
};
const socialRow = (k, name) => `<button class="acc-row" data-a="social"><span class="acc-soc">${SOCIAL[k]}</span><span class="grow">${name}</span><span class="chev">${icon('chevronRight')}</span></button>`;
const linkRow = (a, name) => `<button class="acc-row link" data-a="${a}"><span class="grow">${esc(name)}</span><span class="chev">${icon('chevronRight')}</span></button>`;

// Konto w kolejności z aplikacji: miasto → Profil (e-mail/login + Portfel) → Subskrypcja → Wygląd → O nas → Wsparcie → wersja
function profileHtml() {
  return `<button class="acc-city" data-a="city"><span><small>Wybrane miasto</small><b>${esc(S.city ? S.city.name : '')}</b></span>${ji('dropdown-arrows')}</button>
    <div class="acc-sec">Profil</div>
    <button class="acc-row user" data-a="me" data-hold="admin"><span class="acc-ava">${ji('profile')}</span><span class="grow">${esc(S.user || '')}</span><i class="hold-bar"></i><span class="chev">${icon('chevronRight')}</span></button>
    <div class="acc-wallet" data-a="wallet" role="button" tabindex="0"><span class="aw-ic">${icon('wallet')}</span><span class="aw-txt"><small>Portfel</small><b>${accMoney(walletBalance())} zł</b></span><span class="aw-btn">Doładuj</span></div>
    <div class="acc-sec">Subskrypcja</div>
    <div class="acc-sub"><span class="as-star">${icon('star')}</span><b>Podoba Ci się to, co robimy?</b><span class="as-sub">Jedź z nami po więcej!</span>
      <button class="ybtn" data-a="subs">Sprawdź korzyści</button>${SUB_ART}</div>
    <div class="acc-sec">Wygląd</div>
    ${accRow('theme', 'Tryb ciemny')}
    <button class="acc-row" data-a="anim"><span class="grow">Animacje<small>Zalecane wyłączenie przy wolnym transferze.</small></span><span class="switch${store.get('anim', true) ? ' on' : ''}"></span></button>
    <div class="acc-sec">O nas</div>
    ${accRow('rate', 'Oceń aplikację')}
    ${accRow('about', 'O aplikacji')}
    ${socialRow('facebook', 'Facebook')}${socialRow('instagram', 'Instagram')}${socialRow('tiktok', 'TikTok')}
    <div class="acc-sec">Wsparcie</div>
    ${accRow('help', 'Pomoc')}
    ${accRow('terms', 'Regulamin aplikacji')}
    ${accRow('tterms', 'Regulamin zakupu biletów')}
    ${accRow('privacy', 'Polityka prywatności')}
    ${accRow('src', 'Licencje open source')}
    ${accRow('legal', 'Inne kwestie prawne')}
    ${linkRow('beta', 'Dołącz do beta testów')}
    <div class="acc-ver">Wersja ${APP_VERSION}<br>Copyright © 2026 trasa — projekt do nauki</div>`;
}

// krótkie strony z „O nas” i „Wsparcie” (treść o tym projekcie, nie kopia cudzych regulaminów)
const INFO_PAGES = {
  about: ['O aplikacji', 'trasa to planer podróży komunikacją miejską liczony własnym silnikiem (RAPTOR) na otwartych rozkładach GTFS. Projekt do nauki frontendu, uruchamiany na własnym serwerze.'],
  help: ['Pomoc', 'Wpisz „Skąd” i „Dokąd” albo wybierz punkt z mapy. Godzinę i środki transportu zmienisz pod polami. Odjazdy z przystanku i trasy linii znajdziesz w Rozkładach.'],
  terms: ['Regulamin aplikacji', 'Aplikacja działa na serwerze właściciela i służy do nauki. Rozkłady pochodzą z otwartych danych przewoźników i mogą się różnić od rzeczywistości.'],
  tterms: ['Regulamin zakupu biletów', 'Zakup biletu w aplikacji to symulacja: nie ma bramki płatności, a bilet zapisuje się jako testowy i nie uprawnia do przejazdu. Prawdziwe bilety kupisz u przewoźnika.'],
  privacy: ['Polityka prywatności', 'Serwer przechowuje tylko login i skrót hasła. Ostatnie trasy, miejsca i bilety testowe zostają w pamięci tego urządzenia.'],
  legal: ['Inne kwestie prawne', 'Mapa i adresy © OpenStreetMap. Rozkłady: otwarte dane GTFS przewoźników — ZTM Gdańsk, ZKM Gdynia (Zarząd Dróg i Zieleni w Gdyni, CC BY), PKP Szybka Kolej Miejska w Trójmieście Sp. z o.o. (bip.skm.pkp.pl/otwarte-dane), MZK Wejherowo (mkuran.pl, CC0). Dane przetworzone przez ten serwer; aktualność sprawdzaj u przewoźnika. Nazwy przewoźników należą do ich właścicieli.'],
};
function openInfoPage(k) {
  const [title, text] = INFO_PAGES[k];
  openModal(`<div class="m-title">${esc(title)}</div><div class="m-sec" style="font-size:15px;line-height:22px">${esc(text)}</div>
    <div class="m-btns"><button class="ybtn" data-close>Zamknij</button></div>`, (el) => { el.querySelector('[data-close]').onclick = () => closeModal(); });
}

function adminHtml() {
  return `<div class="acc-admin-top">Panel administracyjny<small>${esc(S.user || '')} · ${esc(serverUrl() || 'ten serwer')}</small></div>
    ${accRow('exitAdmin', 'Wróć do profilu', '', 'back')}
    <div class="acc-sec">Serwer</div>
    ${accRow('info', 'Rozkład i serwer', 'wersje rozkładów, zegar, kod QR na telefon')}
    ${accRow('debug', 'Konsola debugowania', debugEnabled() ? 'włączona' : 'wyłączona')}
    ${accRow('dev', 'Podgląd w ramce telefonu', 'na komputerze: /dev', 'external')}
    <div class="acc-sec">O aplikacji</div>
    ${accRow('src', 'Źródła danych', 'rozkłady GTFS przewoźników, mapa © OpenStreetMap')}`;
}

function renderAccount() {
  const title = document.querySelector('#account .phdr-title');
  if (title) title.textContent = adminMode ? 'Panel administracyjny' : 'Konto';
  $('#accountBody').innerHTML = adminMode ? adminHtml() : profileHtml();
}
onScreen('account', () => { adminMode = false; renderAccount(); });

// przytrzymanie 5 s na wierszu profilu odblokowuje panel admina (pasek .hold-bar daje podgląd postępu)
let holdTimer = null, holdFired = false, holdXY = null;
function cancelHold() {
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  document.querySelectorAll('#accountBody .holding').forEach((el) => el.classList.remove('holding'));
}
$('#accountBody').addEventListener('pointerdown', (e) => {
  const row = e.target.closest('[data-hold="admin"]');
  if (!row || adminMode) return;
  holdFired = false;
  holdXY = { x: e.clientX, y: e.clientY };
  row.classList.add('holding');
  holdTimer = setTimeout(() => {
    holdFired = true;
    cancelHold();
    adminMode = true;
    renderAccount();
    toast('Panel administracyjny odblokowany');
  }, 5000);
});
$('#accountBody').addEventListener('pointermove', (e) => {
  if (holdTimer && holdXY && Math.hypot(e.clientX - holdXY.x, e.clientY - holdXY.y) > 12) cancelHold();
});
$('#accountBody').addEventListener('pointerup', cancelHold);
$('#accountBody').addEventListener('pointercancel', cancelHold);

$('#accountBody').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  if (holdFired) { holdFired = false; return; } // to było przytrzymanie, nie klik
  const k = a.dataset.a;
  if (k === 'city') go('cities');
  else if (k === 'debug') { setDebug(!debugEnabled()); renderAccount(); }
  else if (k === 'info') openInfoModal();
  else if (k === 'me') openProfileModal();
  else if (k === 'wallet') openWalletModal();
  else if (k === 'src') openSourcesModal();
  else if (k === 'theme') openThemeModal();
  else if (k === 'anim') { store.set('anim', !store.get('anim', true)); applyTheme(); renderAccount(); }
  else if (INFO_PAGES[k]) openInfoPage(k);
  else if (k === 'subs') toast('Subskrypcja nie jest dostępna w tej wersji');
  else if (k === 'rate') toast('Dziękujemy!');
  else if (k === 'social' || k === 'beta') toast('Wkrótce');
  else if (k === 'dev') window.top.location.href = '/dev';
  else if (k === 'exitAdmin') { adminMode = false; renderAccount(); }
  else if (k === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* i tak wyloguj lokalnie */ }
    setToken(null);
    location.reload();
  }
});

// Profil (szczegóły): login + wylogowanie (w aplikacji wylogowanie jest w profilu, nie na liście Konta)
function openProfileModal() {
  openModal(`<div class="m-title">Profil</div>
    <div class="pf-head"><span class="acc-ava big">${ji('profile')}</span><div><b>${esc(S.user || '')}</b><small>Konto trasa</small></div></div>
    <div class="m-btns"><button class="tbtn" data-logout>Wyloguj</button><button class="ybtn" data-close>Zamknij</button></div>`, (el) => {
    el.querySelector('[data-close]').onclick = () => closeModal();
    el.querySelector('[data-logout]').onclick = async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* i tak wyloguj lokalnie */ }
      setToken(null);
      location.reload();
    };
  });
}

// Portfel — środki lokalne (symulacja, bez prawdziwej płatności)
function openWalletModal() {
  const paint = (el) => { el.querySelector('.wl-amount').textContent = accMoney(walletBalance()) + ' zł'; };
  openModal(`<div class="m-title">Portfel</div>
    <div class="wl-balance"><small>Dostępne środki (symulacja)</small><b class="wl-amount">${accMoney(walletBalance())} zł</b></div>
    <div class="pf-note">Portfel testowy — środki są lokalne, nie ma prawdziwej płatności.</div>
    <div class="m-btns"><button class="tbtn" data-top="20">Doładuj 20 zł</button><button class="tbtn" data-top="50">Doładuj 50 zł</button><button class="tbtn" data-close>Zamknij</button></div>`, (el) => {
    el.querySelectorAll('[data-top]').forEach((b) => { b.onclick = () => { setWallet(walletBalance() + (+b.dataset.top)); paint(el); renderAccount(); }; });
    el.querySelector('[data-close]').onclick = () => closeModal();
  });
}

// ---------------- WYBÓR MIASTA
const STATUS = { ready: '', downloading: 'pobieranie rozkładu…', loading: 'przygotowanie rozkładu…', error: 'błąd rozkładu', none: '' };
// podpis pod nazwą jak w aplikacji (region/organizator); ikona biletu tylko tam, gdzie działa nasz sklep
const CITY_REGION = { gdansk: 'Trójmiasto (MZKZG)' };
const CITY_SHOP = new Set(['gdansk']);
function renderCities() {
  const q = $('#cityInput').value.trim().toLowerCase();
  const list = S.cities.filter((c) => !q || c.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  $('#citiesBody').innerHTML = list.map((c) => `<button class="crow${c.id === S.city.id ? ' on' : ''}" data-c="${c.id}">
    ${c.id === S.city.id ? `<span class="ccheck">${ji('check')}</span>` : ''}
    <span class="cmain"><span class="cn">${esc(c.name)}</span>${CITY_REGION[c.id] ? `<span class="cs">${esc(CITY_REGION[c.id])}</span>` : ''}${STATUS[c.status] ? `<span class="cs">${STATUS[c.status]}</span>` : ''}</span>
    ${CITY_SHOP.has(c.id) ? `<span class="cico">${ji('ticket-horizontal')}</span>` : ''}</button>`).join('') || '<div class="sg-note">Nie znaleziono miasta</div>';
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
    <div class="m-sec" style="font-size:14px;line-height:20px">Rozkłady: otwarte dane GTFS przewoźników — ZTM Gdańsk; ZKM Gdynia (Zarząd Dróg i Zieleni w Gdyni, CC BY);
    PKP Szybka Kolej Miejska w Trójmieście Sp. z o.o. (bip.skm.pkp.pl/otwarte-dane, dane pobierane codziennie — daty w „Rozkład i serwer”);
    MZK Wejherowo i Warszawa (mkuran.pl); ZTP Kraków; ZTM Poznań.<br>
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
