// Ekrany: wyniki, szczegóły trasy (panel boczny), odjazdy z przystanku, kurs, okno godziny (koła) i ekran Opcji.
import { api, qs } from './api.js';
import { icon, esc, hm, inText, localNow, addDays, store, secondsFromNow } from './util.js';
import { ji } from './icons.js';
import { S, placeLabel, placeParam, addRecentTrip, stopPlace, isFav, toggleFav } from './state.js';
import { go, back, onScreen, openModal, closeModal, toast, currentScreen } from './nav.js';
import { journeyCard, walkCard, timeline, departureRow, stopList } from './render.js';
import { startPurchase, buyLabel, journeyTicket } from './tickets.js';
import { renderAd } from './ads.js';

const $ = (s, r = document) => r.querySelector(s);
const city = () => S.city.id;
let planCtl = null;

// ---------------- WYNIKI
function queryKey() {
  return JSON.stringify([placeParam(S.from), placeParam(S.to), S.when, S.opts, S.from && S.from.kind === 'me' ? 'me' : '']);
}

function renderHead() {
  $('#rfFrom').textContent = placeLabel(S.from);
  $('#rfTo').textContent = placeLabel(S.to);
}

// kolejność jak w oryginale: wg odjazdu pierwszego pojazdu („Odjazd za”)
const firstDep = (j) => (j.legs.find((l) => l.type === 'ride') || { dep: j.leave }).dep;
const byDeparture = (list) => list.sort((a, b) => firstDep(a) - firstDep(b) || a.arrive - b.arrive);

function resultsMsg(html) { $('#results').innerHTML = `<div class="empty">${html}</div>`; }

export async function runSearch(more = null) {
  renderHead();
  if (!S.from || !S.to) { back(); return; }
  const from = placeParam(S.from), to = placeParam(S.to);
  if (!from || !to) {
    resultsMsg(`${icon('locate')}<div>Czekam na lokalizację GPS…</div><div style="margin-top:16px"><button class="lbtn" data-edit>Wybierz start ręcznie</button></div>`);
    return;
  }
  let date, time, arriveBy;
  if (more && S.plan && S.journeys.length) {
    date = S.plan.date;
    if (more === 'later') { time = S.journeys[S.journeys.length - 1].leave + 60; arriveBy = false; }
    else { time = S.journeys[0].arrive - 60; arriveBy = true; }
  } else if (S.when.now) {
    const n = localNow(); date = n.date; time = n.sec; arriveBy = false;
  } else { date = S.when.date; time = S.when.time; arriveBy = S.when.arriveBy; }

  if (!more) {
    S.lastKey = queryKey();
    $('#results').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  }
  if (planCtl) planCtl.abort();
  planCtl = new AbortController();
  let r;
  try {
    r = await api(`/api/c/${city()}/plan?` + qs({
      from, to, fromName: placeLabel(S.from), toName: placeLabel(S.to), date, time, arriveBy: arriveBy ? 1 : '',
      modes: S.opts.modes ? S.opts.modes.join(',') : '', maxTransfers: S.opts.maxTransfers >= 0 ? S.opts.maxTransfers : '', walk: S.opts.walk, count: 7,
    }), { signal: planCtl.signal });
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (more) { toast('Nie udało się pobrać połączeń: ' + e.message); return; }
    resultsMsg(`<div>Błąd wyszukiwania: ${esc(e.message)}</div><div style="margin-top:16px"><button class="lbtn" id="retryBtn">Spróbuj ponownie</button></div>`);
    $('#retryBtn').onclick = () => runSearch();
    return;
  }
  if (more) {
    const ids = new Set(S.journeys.map((j) => j.id));
    const add = r.journeys.filter((j) => !ids.has(j.id));
    if (!add.length) toast(more === 'later' ? 'Brak późniejszych połączeń' : 'Brak wcześniejszych połączeń');
    S.journeys = byDeparture([...S.journeys, ...add]);
  } else {
    S.plan = r;
    S.journeys = byDeparture(r.journeys);
    addRecentTrip(S.from, S.to);
  }
  renderResults();
}

function renderResults() {
  const r = S.plan;
  if (!r) return;
  const list = S.journeys;
  let html = '<div id="adPlan"></div>';
  if (!S.when.now) html += `<div class="res-info">${r.arriveBy ? 'Przyjazd do' : 'Odjazd od'} ${hm(r.time)}</div>`;
  if (!list.length) {
    html += `<div class="empty">${icon('search')}<div>Brak połączeń w tym czasie.</div><div style="margin-top:6px">Zmień godzinę albo opcje (środki transportu, przesiadki).</div></div>`;
  } else {
    html += list.map((j, i) => journeyCard(j, i, r.date, { shine: i === 0 })).join('');
    html += '<div class="res-more" style="gap:8px"><button class="lbtn" data-more="earlier">Wcześniejsze</button><button class="lbtn" data-more="later">Późniejsze trasy</button></div>';
  }
  if (r.walk) html += walkCard(r.walk, list.length);
  html += `<div class="res-info">wyszukano w ${r.stats.ms} ms · rozkład GTFS</div>`;
  $('#results').innerHTML = html;
  renderAd($('#adPlan'), 'compact');
  updatePlanFab();
}

$('#results').addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) { more.disabled = true; runSearch(more.dataset.more); return; }
  if (e.target.closest('[data-edit]')) { back(); return; }
  const card = e.target.closest('.rcard');
  if (!card) return;
  S.sel = card.dataset.walk ? { walk: S.plan.walk } : S.journeys[+card.dataset.j];
  go('route');
});

// ---------------- „Kup bilet”: żółte kółko z koszykiem + etykieta „Kup bilet · 2,40 zł”.
// Przy przewijaniu w dół etykieta chowa się w kółko, przy przewijaniu w górę wraca (jak w aplikacji).
function setFab(fab, info) {
  fab.hidden = !info;
  if (!info) return;
  fab.dataset.type = info.type;
  fab.querySelector('.fab-label').textContent = info.text;
  fab.classList.remove('mini');
}
function collapseOnScroll(scroller, fab) {
  let last = 0;
  scroller.addEventListener('scroll', () => {
    const t = scroller.scrollTop;
    if (t > last + 4 && t > 24) fab.classList.add('mini');
    else if (t < last - 4 || t <= 8) fab.classList.remove('mini');
    last = t;
  }, { passive: true });
}
const planFab = $('#planFab');
const routeFab = $('#routeFab');
function updatePlanFab() { setFab(planFab, S.plan && S.journeys.length ? buyLabel(S.journeys) : null); }
function updateRouteFab() {
  const t = S.sel && !S.sel.walk ? journeyTicket(S.sel) : null;
  setFab(routeFab, t ? { type: t.type, text: t.price != null ? `Kup bilet · ${t.price.toFixed(2).replace('.', ',')} zł` : 'Kup bilet' } : null);
}
collapseOnScroll($('#results'), planFab);
collapseOnScroll($('#routeBody'), routeFab);
for (const fab of [planFab, routeFab]) {
  fab.addEventListener('click', (e) => { if (e.target.closest('[data-buy]')) startPurchase(fab.dataset.type || 'mzkzg-1p'); });
}

// „⋮” na wynikach i na szczegółach trasy: udostępnij / zapisz
function shareText() {
  const j = S.sel && !S.sel.walk ? S.sel : null;
  const head = `${placeLabel(S.from)} → ${placeLabel(S.to)}`;
  if (!j) return head;
  const rides = j.legs.filter((l) => l.type === 'ride');
  return `${head}\n${rides.map((l) => `${hm(l.dep)} ${l.line} → ${l.headsign || l.to.name}`).join('\n')}\nprzyjazd ${hm(j.arrive)}`;
}
function openMoreMenu(withJourney) {
  openModal(`<div class="m-title">Trasa</div>
    <button class="acc-opt" data-mm="share">${icon('share')}<span>Udostępnij${withJourney ? ' przejazd' : ' trasę'}</span></button>
    <button class="acc-opt" data-mm="save">${icon('bookmark')}<span>Zapisz w „Twoich trasach”</span></button>
    <div class="m-btns"><button class="tbtn" data-close>Zamknij</button></div>`, (el) => {
    el.querySelector('[data-close]').onclick = () => closeModal();
    el.querySelector('[data-mm="save"]').onclick = async () => { addRecentTrip(S.from, S.to); await closeModal(); toast('Zapisano w „Twoich trasach”'); };
    el.querySelector('[data-mm="share"]').onclick = async () => {
      const text = shareText();
      await closeModal();
      try {
        if (navigator.share) await navigator.share({ text });
        else { await navigator.clipboard.writeText(text); toast('Skopiowano do schowka'); }
      } catch { /* anulowane */ }
    };
  });
}
$('#planMore').innerHTML = icon('more');
$('#planMore').onclick = () => { S.sel = null; openMoreMenu(false); };
$('#routeMore').innerHTML = icon('more');
$('#routeMore').onclick = () => openMoreMenu(true);

// serduszko „Ulubiona trasa” (ulubione są na górze „Twoich tras”)
function renderFav() { $('#favBtn').innerHTML = icon(S.from && S.to && isFav(S.from, S.to) ? 'heartFill' : 'heart'); }
$('#favBtn').onclick = () => {
  if (!S.from || !S.to) return;
  toast(toggleFav(S.from, S.to) ? 'Dodano do ulubionych tras' : 'Usunięto z ulubionych tras');
  renderFav();
};

onScreen('plan', () => {
  renderHead();
  renderFav();
  if (S.from && S.to && (queryKey() !== S.lastKey || !S.plan)) runSearch();
  else if (S.plan) renderResults();
});

$('#rfEdit').onclick = () => back();
$('#optsBtn').onclick = () => go('options');

// ---------------- SZCZEGÓŁY TRASY
// Panel z osią czasu jak w aplikacji: trzy położenia — „half” (mapa ~57% z lewej, domyślne),
// „open” (panel prawie na całą szerokość), „closed” (widać tylko kolumnę godzin). Przesuwany palcem za uchwyt.
const sideWrap = $('#sideWrap');
const SIDE_LEFT = 40; // .side-wrap { left: 40px }
let sideSnap = 'half';
function sideOffsets() {
  const W = $('#route').offsetWidth;
  const w = W - SIDE_LEFT;
  return { open: 0, half: Math.round(W * 0.57) - SIDE_LEFT, closed: w - 78 };
}
function setSide(snap, refit = false) {
  sideSnap = snap;
  sideWrap.style.setProperty('--sx', sideOffsets()[snap] + 'px');
  sideWrap.classList.toggle('collapsed', snap === 'closed');
  $('#sideHandle').setAttribute('aria-label', snap === 'open' ? 'Pokaż mapę' : 'Pokaż szczegóły');
  if (refit) setTimeout(fitRoute, 360);
}
function routePad() {
  const top = $('#route .nav-top').offsetHeight + $('#routeTop').offsetHeight + 16;
  const W = $('#route').offsetWidth;
  const visible = W - SIDE_LEFT - sideOffsets()[sideSnap === 'open' ? 'half' : sideSnap];
  return { top, bottom: 24, left: 24, right: visible + 16 };
}
function fitRoute() {
  if (!S.sel) return;
  if (S.sel.walk) S.map.showWalk(S.sel.walk, routePad());
  else S.map.showJourney(S.sel, routePad());
}
function onRouteMapClick() { if (sideSnap !== 'closed') setSide('closed', true); }

// przeciąganie uchwytu w poziomie, puszczenie = najbliższe położenie; samo stuknięcie = half ↔ open
{
  const h = $('#sideHandle');
  let x0 = 0, s0 = 0, moved = false;
  h.addEventListener('pointerdown', (e) => {
    x0 = e.clientX; s0 = sideOffsets()[sideSnap]; moved = false;
    h.setPointerCapture(e.pointerId);
    sideWrap.classList.add('dragging');
  });
  h.addEventListener('pointermove', (e) => {
    if (!h.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 4) moved = true;
    const o = sideOffsets();
    sideWrap.style.setProperty('--sx', Math.min(o.closed, Math.max(o.open, s0 + dx)) + 'px');
  });
  h.addEventListener('pointerup', (e) => {
    sideWrap.classList.remove('dragging');
    if (!moved) { setSide(sideSnap === 'half' ? 'open' : 'half', sideSnap === 'closed'); return; }
    const cur = s0 + (e.clientX - x0);
    const o = sideOffsets();
    const snap = Object.keys(o).reduce((a, b) => (Math.abs(o[b] - cur) < Math.abs(o[a] - cur) ? b : a));
    setSide(snap, snap !== 'open');
  });
}

onScreen('route', () => {
  const body = $('#routeBody');
  if (!S.sel) { back(); return; }
  setSide('half');
  S.map.invalidate();
  if (S.sel.walk) {
    const w = S.sel.walk;
    $('#routeTop').innerHTML = walkCard(w, 0).replace('<button', '<div').replace(/<\/button>$/, '</div>');
    body.innerHTML = `<div class="tl-part"><div class="tl-r"><div class="tl-l"><span class="tpt point">${icon('point')}${hm(w.dep)}</span></div><div class="tl-c"><div class="tl-stop">${esc(placeLabel(S.from))}</div></div></div></div>
      <div class="tl-part"><div class="tl-sep"></div><div class="tl-r" style="min-height:84px"><div class="tl-l"><span class="walk-dots"></span><span class="tl-walkic">${icon('walk')}</span><span class="walk-dots"></span></div>
      <div class="tl-c" style="display:flex;flex-direction:column;justify-content:center"><div class="tl-wl"><span>Idź ${Math.round(w.meters / 10) * 10} m</span><span>${Math.round(w.sec / 60)} min</span></div></div></div></div>
      <div class="tl-part"><div class="tl-r"><div class="tl-l"><span class="tpt point">${icon('point')}${hm(w.arr)}</span></div><div class="tl-c"><div class="tl-stop">${esc(placeLabel(S.to))}</div></div></div></div>`;
  } else {
    const j = S.sel;
    $('#routeTop').innerHTML = '<div id="adRoute"></div>' + journeyCard(j, 0, S.plan.date, { tag: 'div' });
    renderAd($('#adRoute'), 'compact');
    body.innerHTML = timeline(j, S.plan.from.name || placeLabel(S.from), S.plan.to.name || placeLabel(S.to));
  }
  body.scrollTop = 0;
  updateRouteFab();
  sideWrap.style.setProperty('--rt-h', $('#routeTop').offsetHeight + 'px');
  $('#route').style.setProperty('--rt-h', $('#routeTop').offsetHeight + 'px');
  requestAnimationFrame(fitRoute);
  S.map.leaflet.on('click', onRouteMapClick);
}, () => { S.map.clearRoute(); S.map.leaflet.off('click', onRouteMapClick); });

$('#routeSave').onclick = () => { addRecentTrip(S.from, S.to); toast('Zapisano w „Twoich trasach”'); };

$('#routeBody').addEventListener('click', (e) => {
  const tg = e.target.closest('[data-tg]');
  if (tg) { tg.classList.toggle('open'); $('#inter-' + tg.dataset.tg).classList.toggle('open'); return; }
  const tr = e.target.closest('[data-trip]');
  if (tr) {
    const leg = S.sel.legs[+tr.dataset.trip];
    openTrip(leg.trip, null, S.plan.date, leg.from.name);
    return;
  }
  const st = e.target.closest('[data-stop]');
  if (st && st.dataset.lat) openStop({ name: st.dataset.stop, lat: +st.dataset.lat, lon: +st.dataset.lon });
});

// ---------------- ODJAZDY Z PRZYSTANKU
let stopTimer = null;
let stopFilter = null;

export function openStop(s, lineFilter = null) {
  S.stop = { ref: s, data: null };
  stopFilter = lineFilter;
  go('stop');
}

async function loadStop() {
  const ref = S.stop.ref;
  try {
    const p = ref.group != null && ref.fresh ? { group: ref.group } : { stop: placeParam({ ...ref, kind: 'stop' }) };
    S.stop.data = await api(`/api/c/${city()}/departures?` + qs({ ...p, limit: 80 }));
    renderStop();
  } catch (e) {
    $('#stopBody').innerHTML = `<div class="empty">Nie udało się pobrać odjazdów: ${esc(e.message)}</div>`;
  }
}

function renderStop() {
  const d = S.stop.data;
  const g = d ? d.group : S.stop.ref;
  $('#stopTitle').textContent = g.name;
  $('#stopHead').innerHTML = '<button class="pill" data-set="from">Jedź stąd</button><button class="pill" data-set="to">Jedź tutaj</button>';
  if (!d) { $('#stopBody').innerHTML = '<div style="padding:16px"><div class="skel"></div><div class="skel"></div></div>'; return; }
  const lines = [...new Set(d.departures.map((x) => x.line))];
  const deps = d.departures.filter((x) => !stopFilter || x.line === stopFilter);
  $('#stopBody').innerHTML = (lines.length > 1 ? `<div class="fchips"><button class="fchip${!stopFilter ? ' on' : ''}" data-f="">Wszystkie</button>` +
    lines.map((l) => `<button class="fchip${stopFilter === l ? ' on' : ''}" data-f="${esc(l)}">${esc(l)}</button>`).join('') + '</div>' : '') +
    (deps.length ? deps.map((x) => departureRow(x, d.departures.indexOf(x), d.date)).join('') : '<div class="empty">Brak odjazdów w najbliższych 3 godzinach.</div>');
}

onScreen('stop', () => {
  renderStop();
  loadStop();
  clearInterval(stopTimer);
  stopTimer = setInterval(loadStop, 30000);
}, () => clearInterval(stopTimer));

$('#stopHead').addEventListener('click', (e) => {
  const b = e.target.closest('[data-set]');
  if (!b) return;
  const g = S.stop.data ? S.stop.data.group : S.stop.ref;
  S[b.dataset.set] = stopPlace(g);
  if (b.dataset.set === 'to' && !S.from && S.me) S.from = { kind: 'me' };
  if (S.from && S.to) go('plan');
  else { toast(b.dataset.set === 'from' ? 'Ustawiono start — wybierz cel' : 'Ustawiono cel — wybierz start'); window.dispatchEvent(new Event('trasa:query')); }
});
$('#stopBody').addEventListener('click', (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { stopFilter = f.dataset.f || null; renderStop(); return; }
  const row = e.target.closest('[data-d]');
  if (!row) return;
  const x = S.stop.data.departures[+row.dataset.d];
  openTrip(x.trip, x.pos, S.stop.data.date);
});

// ---------------- KURS (mapa + ciemny panel)
export function openTrip(ref, focusPos, date, focusName) {
  S.trip = { ref, focusPos, date, focusName, data: null };
  go('trip');
}

function sheetPad(sel) { return { top: 24, bottom: $(sel).offsetHeight - 8, left: 64, right: 24 }; }

onScreen('trip', async () => {
  const t = S.trip;
  $('#tripHead').innerHTML = '';
  $('#tripBody').innerHTML = '<div style="padding:16px"><div class="skel"></div></div>';
  S.map.invalidate();
  try {
    t.data = await api(`/api/c/${city()}/trip?` + qs({ ref: t.ref, date: t.date }));
  } catch (e) {
    $('#tripBody').innerHTML = `<div class="empty">Nie udało się pobrać kursu: ${esc(e.message)}</div>`;
    return;
  }
  const d = t.data;
  let focus = t.focusPos;
  if (focus == null && t.focusName) focus = d.stops.findIndex((s) => s.name === t.focusName);
  $('#tripHead').innerHTML = `<div class="ds-r1">${icon(d.mode)}<span class="ds-num">${esc(d.line)}</span><span class="ds-op">${esc(d.agency || '')}</span></div>
    <div class="ds-r2"><div class="ds-dir"><span class="arr">→</span>${esc(d.headsign)}</div></div>${d.routeLong ? `<div class="ds-sub">${esc(d.routeLong)}</div>` : ''}`;
  $('#tripBody').innerHTML = stopList(d.stops, { color: '#303030', focus, date: t.date, times: true });
  const row = $('#tripBody .lst.focus');
  if (row) row.scrollIntoView({ block: 'center' });
  requestAnimationFrame(() => S.map.showTrip({ ...d, color: '#303030' }, focus, sheetPad('#tripSheet'), { dots: false }));
}, () => S.map.clearRoute());

$('#tripBody').addEventListener('click', (e) => {
  const r = e.target.closest('[data-s]');
  if (!r || !S.trip.data) return;
  const s = S.trip.data.stops[+r.dataset.s];
  openStop({ name: s.name, lat: s.lat, lon: s.lon });
});

// ---------------- „za X min” odświeżane na bieżąco
setInterval(() => {
  const scr = currentScreen();
  const date = scr === 'stop' ? S.stop && S.stop.data && S.stop.data.date : S.plan && S.plan.date;
  if (!date) return;
  document.querySelectorAll('.screen.active .js-in').forEach((el) => {
    const sec = +el.dataset.sec;
    el.textContent = inText(date, sec);
    el.classList.toggle('past', secondsFromNow(date, sec) < -60);
  });
  document.querySelectorAll('.screen.active .js-min').forEach((el) => {
    const m = Math.max(0, Math.floor(secondsFromNow(date, +el.dataset.sec) / 60));
    el.textContent = String(m).padStart(2, '0');
  });
}, 15000);

/** Po zmianie czasu/opcji: odśwież panel startowy, a na ekranie wyników wyszukaj ponownie. */
function queryChanged() {
  window.dispatchEvent(new Event('trasa:query'));
  if (currentScreen() === 'plan') runSearch();
}

export function optionsChanged() {
  return (S.opts.modes ? 1 : 0) + (S.opts.maxTransfers >= 0 ? 1 : 0) + (S.opts.walk !== 'normal' ? 1 : 0);
}

// ---------------- OKNO: GODZINA (Odjazd/Przyjazd + koła: dzień, godzina, minuta)
const DOW = ['Niedz.', 'Pon.', 'Wt.', 'Śr.', 'Czw.', 'Pt.', 'Sob.'];
const MON = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
function dayLabel(di, today) {
  if (di === today) return 'Dzisiaj';
  const d = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100));
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** Kolumna koła; loop = lista powtórzona 3× (godziny i minuty kręcą się w kółko jak w oryginale). */
function wheelCol(cls, items, sel, loop = false) {
  const all = loop ? [...items, ...items, ...items] : items;
  const at = loop ? sel + items.length : sel;
  return `<div class="wcol ${cls}">${all.map((t, i) => `<div class="witem${i === at ? ' sel' : ''}">${t}</div>`).join('')}</div>`;
}

function bindWheel(col, n, loop, sel, onPick) {
  const H = 44;
  let t;
  const idx = () => Math.round(col.scrollTop / H);
  const mark = () => { const i = idx(); [...col.children].forEach((c, k) => c.classList.toggle('sel', k === i)); return i; };
  col.scrollTop = (loop ? sel + n : sel) * H;
  col.addEventListener('scroll', () => {
    mark();
    clearTimeout(t);
    t = setTimeout(() => {
      let i = mark();
      if (loop && (i < n || i >= 2 * n)) { i = (i % n) + n; col.scrollTop = i * H; mark(); }
      onPick(loop ? i % n : i);
    }, 110);
  });
  col.addEventListener('click', (e) => {
    const it = e.target.closest('.witem');
    if (it) col.scrollTo({ top: [...col.children].indexOf(it) * H, behavior: 'smooth' });
  });
}

export function openTimeModal() {
  const n = localNow();
  const w = S.when;
  const date = w.now ? n.date : w.date;
  const time = w.now ? n.sec : w.time;
  let arriveBy = w.arriveBy;
  const days = Array.from({ length: 9 }, (_, i) => addDays(n.date, i - 2));
  let di = Math.max(0, days.indexOf(date));
  let h = Math.floor(time / 3600) % 24;
  let m = Math.floor(time / 60) % 60;
  const pad = (x) => String(x).padStart(2, '0');
  openModal(`<div class="seg2" id="tmSeg"><button data-v="0" class="${!arriveBy ? 'on' : ''}">Odjazd</button><button data-v="1" class="${arriveBy ? 'on' : ''}">Przyjazd</button></div>
    <div class="wheel">${wheelCol('days', days.map((d) => dayLabel(d, n.date)), di)}${wheelCol('hours', Array.from({ length: 24 }, (_, i) => pad(i)), h, true)}${wheelCol('mins', Array.from({ length: 60 }, (_, i) => pad(i)), m, true)}</div>
    <div class="m-btns"><button class="ybtn" id="tmOk">Zapisz</button><button class="tbtn" id="tmCancel">Anuluj</button></div>`, (el) => {
    el.querySelectorAll('#tmSeg button').forEach((b) => {
      b.onclick = () => { arriveBy = b.dataset.v === '1'; el.querySelectorAll('#tmSeg button').forEach((x) => x.classList.toggle('on', x === b)); };
    });
    const [cd, ch, cm] = el.querySelectorAll('.wcol');
    bindWheel(cd, days.length, false, di, (i) => { di = i; });
    bindWheel(ch, 24, true, h, (i) => { h = i; });
    bindWheel(cm, 60, true, m, (i) => { m = i; });
    $('#tmCancel', el).onclick = () => closeModal();
    $('#tmOk', el).onclick = async () => {
      const sec = h * 3600 + m * 60;
      const nn = localNow();
      // bieżąca minuta dzisiaj jako odjazd = „teraz” (godzina na przycisku dalej się przesuwa)
      const isNow = !arriveBy && days[di] === nn.date && Math.abs(sec - (nn.sec - nn.sec % 60)) <= 60;
      S.when = isNow ? { now: true, arriveBy: false, date: 0, time: 0 } : { now: false, arriveBy, date: days[di], time: sec };
      await closeModal();
      queryChanged();
    };
  });
}

// ---------------- EKRAN: OPCJE
const MODE_LABEL = { tram: 'Tramwaje', bus: 'Autobusy', trolley: 'Trolejbusy', rail: 'Pociągi', metro: 'Metro', ferry: 'Tramwaje wodne' };
const MODE_ICON = { tram: 'vehicle-type-tram', bus: 'vehicle-type-bus', trolley: 'vehicle-type-trolleybus', rail: 'vehicle-type-train', metro: 'vehicle-type-train', ferry: 'vehicle-type-bus' };
const PACE = [
  ['slow', 'Wygodne', 'meditation', 'Idę spokojnie — wolniejsze tempo marszu na dojściach i przesiadkach.'],
  ['normal', 'Optymalne', 'walking', 'Zwykłe tempo marszu na dojściach i przesiadkach.'],
  ['fast', 'Szybkie', 'run', 'Spieszę się — szybki marsz, więc zdążę na krótsze przesiadki.'],
];
let draft = null;

function renderOptions() {
  const modes = (S.city.modes || []).filter((x) => x !== 'other');
  const o = draft;
  const pace = PACE.find((p) => p[0] === o.walk) || PACE[1];
  $('#optionsBody').innerHTML = `<div class="o-sec">Połączenie</div>
    <div class="o-cards">${PACE.map(([v, t, ic]) => `<button class="o-card${o.walk === v ? ' on' : ''}" data-walk="${v}">${ji(ic)}${t}</button>`).join('')}</div>
    <div class="o-desc">${pace[3]}</div>
    <div class="o-sec row"><span>Unikaj przesiadek</span><button class="switch${o.maxTransfers >= 0 ? ' on' : ''}" id="opAvoid" aria-label="Unikaj przesiadek" title="Tylko trasy z najwyżej jedną przesiadką"></button></div>
    <div class="o-sec" style="padding-top:52px">Środki transportu</div>
    <div class="o-cards">${modes.map((m) => `<button class="o-mode${o.modes.includes(m) ? ' on' : ''}" data-m="${m}">${ji(MODE_ICON[m] || 'vehicle-type-bus')}${MODE_LABEL[m] || m}<span class="o-check">${ji('check')}</span></button>`).join('')}</div>
    <div style="height:24px"></div>`;
}

onScreen('options', () => {
  const modes = (S.city.modes || []).filter((x) => x !== 'other');
  draft = { modes: S.opts.modes ? [...S.opts.modes] : [...modes], maxTransfers: S.opts.maxTransfers, walk: S.opts.walk };
  renderOptions();
});

$('#optionsBody').addEventListener('click', (e) => {
  const w = e.target.closest('[data-walk]');
  if (w) { draft.walk = w.dataset.walk; renderOptions(); return; }
  if (e.target.closest('#opAvoid')) { draft.maxTransfers = draft.maxTransfers >= 0 ? -1 : 1; renderOptions(); return; }
  const m = e.target.closest('[data-m]');
  if (m) {
    const k = m.dataset.m;
    draft.modes = draft.modes.includes(k) ? draft.modes.filter((x) => x !== k) : [...draft.modes, k];
    renderOptions();
  }
});

$('#opReset').onclick = () => {
  const modes = (S.city.modes || []).filter((x) => x !== 'other');
  draft = { modes: [...modes], maxTransfers: -1, walk: 'normal' };
  renderOptions();
};

$('#opDone').onclick = () => {
  const modes = (S.city.modes || []).filter((x) => x !== 'other');
  if (!draft.modes.length) { toast('Wybierz co najmniej jeden środek transportu'); return; }
  S.opts = { modes: draft.modes.length === modes.length ? null : draft.modes, maxTransfers: draft.maxTransfers, walk: draft.walk };
  store.set('opts', S.opts);
  back();
  setTimeout(queryChanged, 50);
};
