// Start aplikacji: zegar, miasto, mapa, GPS, ekran główny, wyszukiwarka miejsc, wybór na mapie, menu.
import { api, qs, serverUrl, setServer, setToken } from './api.js';
import { icon, esc, debounce, setClockOffset, nowMs, meters, hm, localNow, dateLabel } from './util.js';
import { S, placeLabel, stopPlace, recentPlaces, addRecentPlace, recentTrips } from './state.js';
import { go, back, onScreen, openModal, closeModal, toast, switchTab, currentScreen } from './nav.js';
import { placeRow } from './render.js';
import { createMap } from './map.js';
import { debugEnabled, setDebug } from './debug.js';
import { runSearch, openPick, openStop, openTimeModal, openOptionsModal, optionsChanged } from './screens.js';
import './tabs.js';

const $ = (s, r = document) => r.querySelector(s);
const city = () => S.city.id;

// ikony w statycznych przyciskach
document.querySelectorAll('[data-back]').forEach((b) => { b.innerHTML = icon('back'); });
$('#menuBtn').innerHTML = icon('person');
$('#locBtn').innerHTML = icon('locate');
$('#swapBtn').innerHTML = icon('swap');
$('#pickClear').innerHTML = icon('close');
$('#cityBtn .ct-ic').innerHTML = icon('place');
$('#cityBtn .ct-arrow').innerHTML = icon('expand', 'sm');
const TAB_IC = { home: 'nearMe', lines: 'clock', account: 'person' };
document.querySelectorAll('.tabbar [data-tab]').forEach((b) => {
  b.querySelector('.tb-ic').innerHTML = icon(TAB_IC[b.dataset.tab]);
  b.onclick = () => switchTab(b.dataset.tab);
});
document.querySelector('.tabbar [data-tab="home"]').classList.add('on');

// ---------------- START
const bootMsg = (t, html = '') => { $('#bootMsg').innerHTML = esc(t) + html; };

const splashUntil = Date.now() + 700; // kolor aplikacji przez chwilę na starcie

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
    bootMsg(`Nie udało się przygotować rozkładu: ${e.message}`, '<br><br><button class="btn" onclick="location.reload()">Spróbuj ponownie</button>');
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
  if (currentScreen() === 'home') enterHome();
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
  if (!('geolocation' in navigator)) { S.geo = 'unsupported'; renderHome(); return; }
  if (!window.isSecureContext) { S.geo = 'insecure'; renderHome(); return; }
  navigator.geolocation.watchPosition((p) => {
    S.me = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
    S.geo = 'ok';
    S.map.setMe(S.me);
    if (!S.from) S.from = { kind: 'me' };
    if (firstFix) { firstFix = false; renderHome(); }
  }, (err) => {
    S.geo = err.code === 1 ? 'denied' : 'unknown';
    renderHome();
  }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
}

function geoHint() {
  if (S.geo === 'insecure') return 'Lokalizacja GPS działa tylko przez https:// albo localhost. Na telefonie: kabel USB + chrome://inspect → Port forwarding (instrukcja w README), albo wybierz start ręcznie.';
  if (S.geo === 'denied') return 'Brak zgody na lokalizację — wybierz punkt startu ręcznie.';
  if (S.geo === 'unsupported') return 'Ta przeglądarka nie udostępnia lokalizacji.';
  return '';
}

$('#locBtn').onclick = () => {
  if (S.me) S.map.flyTo(S.me.lat, S.me.lon, 16);
  else toast(geoHint() || 'Szukam lokalizacji…', 5000);
};

// ---------------- EKRAN GŁÓWNY
function enterHome() {
  S.map.enableStops(
    async (b) => (await api(`/api/c/${city()}/stops?bbox=${b.map((x) => x.toFixed(5)).join(',')}`)).stops,
    (s) => stopPopup(s),
  );
  renderHome();
}
onScreen('home', enterHome, () => { S.map.disableStops(); S.map.leaflet.closePopup(); });

function renderHomeTop() {
  for (const [id, p, ph] of [['#hFrom', S.from, 'Skąd jedziesz?'], ['#hTo', S.to, 'Dokąd jedziesz?']]) {
    const t = $(id + ' .ftxt');
    t.textContent = p ? placeLabel(p) : ph;
    t.classList.toggle('placeholder', !p);
  }
  const w = S.when;
  const n = localNow();
  $('#hTime').innerHTML = (w.now ? hm(n.sec) : `${w.arriveBy ? 'Przyjazd ' : ''}${w.date !== n.date ? dateLabel(w.date) + ' ' : ''}${hm(w.time)}`) + icon('expand', 'sm');
  const c = optionsChanged();
  $('#hOpts').innerHTML = 'Opcje ' + icon('tune', 'sm') + (c ? `<span class="badge">${c}</span>` : '');
}
window.addEventListener('trasa:query', renderHomeTop);
setInterval(() => { if (currentScreen() === 'home' && S.when.now) renderHomeTop(); }, 15000);

async function renderHome() {
  if (!S.city) return;
  renderHomeTop();
  const trips = recentTrips();
  $('#recentEmpty').hidden = !!trips.length;
  $('#recentList').innerHTML = trips.map((t, i) => `<li data-r="${i}"><div class="trip-pair li-main">
    <div class="tp-row"><span class="pin-dot from"></span>${esc(placeLabel(t.from))}</div>
    <div class="tp-row"><span class="pin-dot to"></span>${esc(placeLabel(t.to))}</div></div></li>`).join('');
  $('#homeHint').textContent = geoHint();
  if (!S.me) { $('#nearbyTitle').hidden = true; $('#nearbyList').innerHTML = ''; return; }
  try {
    const r = await api(`/api/c/${city()}/nearby?` + qs({ lat: S.me.lat.toFixed(6), lon: S.me.lon.toFixed(6) }));
    S.nearby = r.stops.slice(0, 6).map((s) => ({ ...stopPlace(s), distance: s.distance }));
    $('#nearbyTitle').hidden = !S.nearby.length;
    $('#nearbyList').innerHTML = S.nearby.map((s, i) => placeRow(s, i, { side: meters(s.distance) })).join('');
  } catch { /* bez listy */ }
}

// pola na ekranie startowym: wybór miejsca, a po wybraniu obu — od razu wyniki
for (const [id, target] of [['#hFrom', 'from'], ['#hTo', 'to']]) {
  $(id).onclick = () => {
    if (!S.from && S.me && target === 'to') S.from = { kind: 'me' };
    go('plan');
    openPick(target);
  };
}
$('#hTime').onclick = () => openTimeModal();
$('#hOpts').onclick = () => openOptionsModal();
$('#recentList').addEventListener('click', (e) => {
  const li = e.target.closest('[data-r]');
  if (!li) return;
  const t = recentTrips()[+li.dataset.r];
  S.from = t.from; S.to = t.to;
  go('plan');
});
$('#nearbyList').addEventListener('click', (e) => {
  const li = e.target.closest('[data-i]');
  if (li) openStop(S.nearby[+li.dataset.i]);
});

function popupActions(place, withDepartures) {
  const pop = L.popup({ closeButton: false, offset: [0, -4], autoPanPaddingTopLeft: [10, 70] })
    .setLatLng([place.lat, place.lon])
    .setContent(`<div class="pp-name">${esc(place.name)}</div><div class="pp-sub">${esc(place.kind === 'stop' ? (place.lines || []).join(', ') : place.sub || '')}</div>
      <div class="pp-btns">${withDepartures ? '<button class="btn sm primary" data-pp="dep">Odjazdy</button>' : ''}
      <button class="btn sm ghost" data-pp="from">Stąd</button><button class="btn sm ghost" data-pp="to">Dotąd</button></div>`)
    .openOn(S.map.leaflet);
  pop.getElement().addEventListener('click', (e) => {
    const b = e.target.closest('[data-pp]');
    if (!b) return;
    S.map.leaflet.closePopup();
    if (b.dataset.pp === 'dep') { openStop(place); return; }
    S[b.dataset.pp] = place;
    if (b.dataset.pp === 'to' && !S.from && S.me) S.from = { kind: 'me' };
    addRecentPlace(place);
    go('plan');
  });
}
function stopPopup(s) { popupActions(stopPlace(s), true); }

// przytrzymanie palca / prawy klik na mapie → „Stąd / Dotąd”
let homeCtx = null;
function bindMapContext() {
  if (homeCtx) return;
  homeCtx = async (e) => {
    if (document.body.dataset.screen !== 'home') return;
    const lat = e.latlng.lat, lon = e.latlng.lng;
    let place = { kind: 'map', name: 'Punkt na mapie', sub: '', lat, lon };
    try {
      const r = await api(`/api/c/${city()}/reverse?` + qs({ lat: lat.toFixed(6), lon: lon.toFixed(6) }));
      if (r.stop) place = stopPlace(r.stop);
      else if (r.place) place = { kind: 'map', name: r.place.name || 'Punkt na mapie', sub: r.place.sub, lat, lon };
    } catch { /* bez nazwy */ }
    popupActions(place, place.kind === 'stop');
  };
  S.map.leaflet.on('contextmenu', homeCtx);
}

// ---------------- WYSZUKIWARKA MIEJSC
const input = $('#pickInput');
let pickSeq = 0;
let pickItems = [];

function renderPick(stops, places, loadingPlaces) {
  const q = input.value.trim();
  pickItems = [];
  let html = '<ul class="list">';
  const add = (p, opts) => { pickItems.push(p); html += placeRow(p, pickItems.length - 1, opts); };
  if (!q) {
    if (S.geo !== 'unsupported') add({ kind: 'me', name: 'Moja lokalizacja', sub: S.me ? `dokładność ${Math.round(S.me.acc)} m` : geoHint() || 'szukam…' });
    add({ kind: 'map', name: 'Wybierz na mapie', sub: 'Przesuń mapę pod pinezkę', pickOnMap: true });
    html += '</ul>';
    const rec = recentPlaces();
    if (rec.length) {
      html += '<div class="sec-title">Ostatnie</div><ul class="list">';
      rec.forEach((p) => add(p, { action: p.kind === 'stop' }));
      html += '</ul>';
    }
  } else {
    stops.forEach((s) => add(stopPlace(s), { action: true }));
    places.forEach((p) => add({ ...p, kind: 'place' }));
    html += '</ul>';
    if (loadingPlaces) html += '<div class="pick-note">Szukam adresów…</div>';
    else if (!stops.length && !places.length) html += '<div class="empty">Nic nie znaleziono</div>';
    else if (places.length) html += '<div class="pick-note">Adresy: © OpenStreetMap (Photon)</div>';
  }
  $('#pickBody').innerHTML = html;
}

const searchPlaces = debounce(async (q, id, stops) => {
  if (id !== pickSeq) return;
  let places = [];
  try { places = (await api(`/api/c/${city()}/geocode?` + qs({ q }))).places; } catch { /* tylko przystanki */ }
  if (id === pickSeq) renderPick(stops, places, false);
}, 350);

async function onPickInput() {
  const q = input.value.trim();
  $('#pickClear').hidden = !q;
  const id = ++pickSeq;
  if (!q) { renderPick([], [], false); return; }
  let stops = [];
  try { stops = (await api(`/api/c/${city()}/search?` + qs({ q, limit: 8 }))).stops; } catch { /* */ }
  if (id !== pickSeq) return;
  const geo = q.length >= 3;
  renderPick(stops, [], geo);
  if (geo) searchPlaces(q, id, stops);
}
input.addEventListener('input', debounce(onPickInput, 120));
$('#pickClear').onclick = () => { input.value = ''; onPickInput(); input.focus(); };

onScreen('pick', () => {
  input.value = '';
  input.placeholder = S.pickTarget === 'from' ? 'Skąd? Przystanek, adres…' : 'Dokąd? Przystanek, adres…';
  $('#pickClear').hidden = true;
  renderPick([], [], false);
  setTimeout(() => input.focus(), 60);
}, () => { pickSeq++; });

$('#pickBody').addEventListener('click', (e) => {
  const dep = e.target.closest('[data-dep]');
  if (dep) { openStop(pickItems[+dep.dataset.dep]); return; }
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  const p = pickItems[+li.dataset.i];
  if (p.pickOnMap) { go('mappick'); return; }
  if (p.kind === 'me') {
    if (!S.me) { toast(geoHint() || 'Jeszcze nie mam lokalizacji — spróbuj za chwilę', 5000); return; }
    S[S.pickTarget] = { kind: 'me' };
  } else {
    S[S.pickTarget] = p;
    addRecentPlace(p);
  }
  back();
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
  S.map.leaflet.on('moveend', mpUpdate);
  mpUpdate();
}, () => S.map.leaflet.off('moveend', mpUpdate));

$('#mpOk').onclick = () => {
  if (!mpPlace) return;
  S[S.pickTarget] = mpPlace;
  addRecentPlace(mpPlace);
  back(2);
};

// ---------------- MENU / MIASTO / INFORMACJE
$('#cityBtn').onclick = () => openCityModal();
$('#menuBtn').onclick = () => switchTab('account');

function renderAccount() {
  $('#accountBody').innerHTML = `<div class="acc-head"><span class="li-ic brand">${icon('person')}</span><div class="li-main">
      <div class="li-name">${esc(S.user || '')}</div><div class="li-sub">administrator · ${esc(serverUrl() || 'ten serwer')}</div></div></div>
    <div class="divider"></div><ul class="list">
    <li data-a="city"><span class="li-ic">${icon('place')}</span><div class="li-main"><div class="li-name">Miasto</div><div class="li-sub">${esc(S.city ? S.city.name : '')}</div></div></li>
    <li data-a="info"><span class="li-ic">${icon('clock')}</span><div class="li-main"><div class="li-name">Rozkład i serwer</div><div class="li-sub">wersje rozkładów, zegar, kod QR do otwarcia na telefonie</div></div></li>
    <li data-a="debug"><span class="li-ic">${icon('bug')}</span><div class="li-main"><div class="li-name">Konsola debugowania</div><div class="li-sub">${debugEnabled() ? 'włączona' : 'wyłączona'} · konsola, sieć i DOM na telefonie</div></div></li>
    <li data-a="dev"><span class="li-ic">${icon('tune')}</span><div class="li-main"><div class="li-name">Podgląd w ramce telefonu</div><div class="li-sub">na komputerze: /dev</div></div></li>
    <li data-a="logout"><span class="li-ic">${icon('logout')}</span><div class="li-main"><div class="li-name">Wyloguj</div></div></li>
    </ul>`;
}
onScreen('account', renderAccount);
$('#accountBody').addEventListener('click', async (e) => {
  const a = e.target.closest('[data-a]');
  if (!a) return;
  if (a.dataset.a === 'city') openCityModal();
  else if (a.dataset.a === 'debug') setDebug(!debugEnabled());
  else if (a.dataset.a === 'info') openInfoModal();
  else if (a.dataset.a === 'dev') window.top.location.href = '/dev';
  else if (a.dataset.a === 'logout') {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* i tak wyloguj lokalnie */ }
    setToken(null);
    location.reload();
  }
});

function openCityModal() {
  const statusTxt = { ready: 'gotowe', downloading: 'pobieranie…', loading: 'przygotowanie…', error: 'błąd', none: 'niepobrane — dotknij, aby pobrać' };
  openModal(`<div class="m-title">Miasto</div><ul class="list">${S.cities.map((c) => `<li data-c="${c.id}">
    <span class="li-ic${c.id === S.city.id ? ' brand' : ''}">${icon('place')}</span><div class="li-main"><div class="li-name">${esc(c.name)}</div>
    <div class="li-sub">${statusTxt[c.status] || c.status}${c.stats ? ` · ${c.stats.groups} przystanków` : ''}</div></div></li>`).join('')}</ul>
    <div class="pick-note">Rozkłady: otwarte dane GTFS przewoźników. Pierwsze pobranie dużego miasta trwa do kilku minut.</div>`, (el) => {
    el.addEventListener('click', async (e) => {
      const li = e.target.closest('[data-c]');
      if (!li) return;
      await closeModal();
      if (li.dataset.c !== S.city.id) useCity(li.dataset.c);
    });
  });
}

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
    <div class="m-sec"><div class="m-label">Zegar</div><div>${Math.abs(off) > 60000 ? `Zegar tego urządzenia różni się o ${(off / 60000).toFixed(1)} min od czasu sieci — aplikacja liczy „za X min” wg serwera.` : 'Zegar urządzenia zgodny z czasem sieci.'}
      <span class="mono">(serwer: ${esc(S.clock ? S.clock.source : '?')}, ${new Date(nowMs()).toLocaleTimeString('pl-PL', { timeZone: 'Europe/Warsaw' })})</span></div></div>
    ${lan ? `<div class="m-sec"><div class="m-label">Otwórz na telefonie (ta sama sieć Wi-Fi)</div><div class="qr"><img src="/api/dev/qr.svg?text=${encodeURIComponent(lan)}" alt="QR">
      <div><div class="mono">${esc(lan)}</div>${dev.lan.slice(1).map((l) => `<div class="mono">${esc(l.url)}</div>`).join('')}<div class="pick-note" style="padding:6px 0">GPS przez Wi-Fi nie zadziała (brak https) — do testów z lokalizacją użyj USB i chrome://inspect.</div></div></div></div>` : ''}
    ${dev ? `<div class="m-sec"><div class="m-label">Serwer</div><div class="mono">Node ${esc(dev.node)} · RAM ${dev.rssMB} MB · działa ${Math.round(dev.uptimeSec / 60)} min</div></div>` : ''}
    <div class="m-btns"><button class="btn ghost" id="infReload">Odśwież rozkład</button><button class="btn primary" id="infOk">Zamknij</button></div>`, (el) => {
    $('#infOk', el).onclick = () => closeModal();
    $('#infReload', el).onclick = async () => {
      await api(`/api/cities/${c.id}/load?force=1`, { method: 'POST' });
      await closeModal();
      toast('Pobieram świeży rozkład w tle…');
    };
  });
}

// ---------------- przeciąganie arkuszy (szczegóły trasy, kurs)
document.querySelectorAll('.drag-sheet').forEach((sheet) => {
  const grab = sheet.querySelector('.sheet-grab');
  let y0 = 0, h0 = 0, moved = false;
  grab.addEventListener('pointerdown', (e) => {
    y0 = e.clientY; h0 = sheet.offsetHeight; moved = false;
    grab.setPointerCapture(e.pointerId);
    sheet.classList.add('dragging');
  });
  grab.addEventListener('pointermove', (e) => {
    if (!grab.hasPointerCapture(e.pointerId)) return;
    const dy = y0 - e.clientY;
    if (Math.abs(dy) > 4) moved = true;
    sheet.style.height = Math.max(120, h0 + dy) + 'px';
  });
  grab.addEventListener('pointerup', () => {
    sheet.classList.remove('dragging');
    const H = sheet.parentElement.offsetHeight;
    const snaps = [0.25, 0.55, 0.88].map((f) => f * H);
    const cur = moved ? sheet.offsetHeight : (sheet.offsetHeight < H * 0.7 ? snaps[2] : snaps[1]);
    const target = snaps.reduce((a, b) => (Math.abs(b - cur) < Math.abs(a - cur) ? b : a));
    sheet.style.height = target + 'px';
  });
});

boot().then(() => { if (S.map) bindMapContext(); }).catch((e) => {
  console.error(e);
  bootMsg('Błąd uruchamiania: ' + e.message);
});

// ułatwienie dla konsoli/eruda
window.trasa = { S, api, runSearch };
