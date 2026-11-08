// Ekrany: wyniki wyszukiwania, szczegóły trasy, odjazdy z przystanku, przebieg kursu + okna czasu i opcji.
import { api, qs } from './api.js';
import { icon, esc, hm, inText, dateLabel, localNow, addDays, store, MODE_NAMES, secondsFromNow } from './util.js';
import { S, placeLabel, placeParam, addRecentTrip, stopPlace } from './state.js';
import { go, back, onScreen, openModal, closeModal, toast, currentScreen } from './nav.js';
import { journeyCard, walkCard, routeSummary, timeline, departureRow, tripList } from './render.js';

const $ = (s, r = document) => r.querySelector(s);
const city = () => S.city.id;
let planCtl = null;

// ---------------- PLANER / WYNIKI
function queryKey() {
  return JSON.stringify([placeParam(S.from), placeParam(S.to), S.when, S.opts, S.from && S.from.kind === 'me' ? 'me' : '']);
}

function renderFields() {
  for (const [id, p, ph] of [['#fromField', S.from, 'Skąd?'], ['#toField', S.to, 'Dokąd?']]) {
    const t = $(id + ' .ftxt');
    t.textContent = p ? placeLabel(p) : ph;
    t.classList.toggle('placeholder', !p);
  }
  const w = S.when;
  $('#timeBtn').innerHTML = icon('clock', 'sm') + (w.now ? 'Odjazd: teraz' : `${w.arriveBy ? 'Przyjazd' : 'Odjazd'}: ${dateLabel(w.date)} ${hm(w.time)}`);
  const changed = optionsChanged();
  $('#optsBtn').innerHTML = icon('tune', 'sm') + 'Opcje' + (changed ? ` (${changed})` : '');
}

function resultsMsg(html) { $('#results').innerHTML = `<div class="empty">${html}</div>`; }

export async function runSearch(more = null) {
  renderFields();
  if (!S.from || !S.to) {
    resultsMsg(`${icon('search')}<div>Wybierz ${!S.from ? 'punkt startu' : 'cel podróży'}</div>`);
    return;
  }
  const from = placeParam(S.from), to = placeParam(S.to);
  if (!from || !to) {
    resultsMsg(`${icon('locate')}<div>Czekam na lokalizację GPS…</div><div style="margin-top:12px"><button class="btn ghost sm" id="pickFromBtn">Wybierz start ręcznie</button></div>`);
    $('#pickFromBtn').onclick = () => openPick('from');
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
    $('#results').innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  }
  if (planCtl) planCtl.abort();
  planCtl = new AbortController();
  let r;
  try {
    r = await api(`/api/c/${city()}/plan?` + qs({
      from, to, fromName: placeLabel(S.from), toName: placeLabel(S.to), date, time, arriveBy: arriveBy ? 1 : '',
      modes: S.opts.modes ? S.opts.modes.join(',') : '', maxTransfers: S.opts.maxTransfers >= 0 ? S.opts.maxTransfers : '', walk: S.opts.walk, count: 5,
    }), { signal: planCtl.signal });
  } catch (e) {
    if (e.name === 'AbortError') return;
    if (more) { toast('Nie udało się pobrać połączeń: ' + e.message); return; }
    resultsMsg(`<div>Błąd wyszukiwania: ${esc(e.message)}</div><div style="margin-top:12px"><button class="btn ghost sm" id="retryBtn">Spróbuj ponownie</button></div>`);
    $('#retryBtn').onclick = () => runSearch();
    return;
  }
  if (more) {
    const ids = new Set(S.journeys.map((j) => j.id));
    const add = r.journeys.filter((j) => !ids.has(j.id));
    if (!add.length) toast(more === 'later' ? 'Brak późniejszych połączeń' : 'Brak wcześniejszych połączeń');
    S.journeys = [...S.journeys, ...add].sort((a, b) => a.leave - b.leave || a.arrive - b.arrive);
  } else {
    S.plan = r;
    S.journeys = r.journeys;
    addRecentTrip(S.from, S.to);
  }
  renderResults();
}

function renderResults() {
  const r = S.plan;
  if (!r) return;
  const list = S.journeys;
  let html = `<div class="res-info">${r.arriveBy ? 'Przyjazd do' : 'Odjazd od'} ${dateLabel(r.date)}, ${hm(r.time)}</div>`;
  if (!list.length) {
    html += `<div class="empty">${icon('search')}<div>Brak połączeń w tym czasie.</div><div style="margin-top:6px">Zmień godzinę albo opcje (środki transportu, przesiadki).</div></div>`;
  } else {
    html += `<div class="res-more"><button class="btn ghost sm" data-more="earlier">Wcześniejsze</button></div>`;
    html += list.map((j, i) => journeyCard(j, i, r.date)).join('');
    html += `<div class="res-more"><button class="btn ghost sm" data-more="later">Późniejsze połączenia</button></div>`;
  }
  if (r.walk) html += walkCard(r.walk);
  html += `<div class="res-info" style="text-align:center;color:var(--ink-3)">wyszukano w ${r.stats.ms} ms · rozkład GTFS</div>`;
  $('#results').innerHTML = html;
}

$('#results').addEventListener('click', (e) => {
  const more = e.target.closest('[data-more]');
  if (more) { more.disabled = true; runSearch(more.dataset.more); return; }
  const card = e.target.closest('.jcard');
  if (!card) return;
  S.sel = card.dataset.walk ? { walk: S.plan.walk } : S.journeys[+card.dataset.j];
  go('route');
});

onScreen('plan', () => {
  renderFields();
  if (S.from && S.to && (queryKey() !== S.lastKey || !S.plan)) runSearch();
  else if (S.plan && S.from && S.to) renderResults();
  else runSearch();
});

$('#fromField').onclick = () => openPick('from');
$('#toField').onclick = () => openPick('to');
$('#swapBtn').onclick = () => { [S.from, S.to] = [S.to, S.from]; runSearch(); };
$('#timeBtn').onclick = () => openTimeModal();
$('#optsBtn').onclick = () => openOptionsModal();

export function openPick(target) { S.pickTarget = target; go('pick'); }

// ---------------- SZCZEGÓŁY TRASY
function sheetPad(sel) { return { top: 70, bottom: $(sel).offsetHeight }; }

onScreen('route', () => {
  const body = $('#routeBody');
  if (!S.sel) { back(); return; }
  if (S.sel.walk) {
    const w = S.sel.walk;
    body.innerHTML = `<div class="route-sum"><div class="rs-top"><span class="rs-times">Pieszo</span><span class="rs-dur">${Math.round(w.sec / 60)} min</span></div>
      <div class="rs-sub">${esc(placeLabel(S.from))} → ${esc(placeLabel(S.to))} · ok. ${Math.round(w.meters / 10) * 10} m</div></div>`;
    requestAnimationFrame(() => S.map.showWalk(w, sheetPad('#routeSheet')));
    return;
  }
  const j = S.sel;
  body.innerHTML = routeSummary(j, S.plan.date) + timeline(j, S.plan.from.name || placeLabel(S.from), S.plan.to.name || placeLabel(S.to));
  body.scrollTop = 0;
  requestAnimationFrame(() => S.map.showJourney(j, sheetPad('#routeSheet')));
}, () => S.map.clearRoute());

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
  if (st) openStop({ name: st.dataset.stop, lat: +st.dataset.lat, lon: +st.dataset.lon });
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
  $('#stopHead').innerHTML = `<div class="sh-row"><button class="icon-btn on-brand" data-back>${icon('back')}</button><div class="sh-name">${esc(g.name)}</div></div>
    <div class="sh-lines">${(g.lines || []).map((l) => `<span class="mini-line" style="--lc:rgba(255,255,255,.2)">${esc(l)}</span>`).join('')}</div>
    <div class="sh-btns"><button class="btn sm" data-set="from">Stąd</button><button class="btn sm" data-set="to">Dotąd</button></div>`;
  if (!d) { $('#stopBody').innerHTML = '<div class="skel"></div><div class="skel"></div>'; return; }
  const lines = [...new Set(d.departures.map((x) => x.line))];
  const deps = d.departures.filter((x) => !stopFilter || x.line === stopFilter);
  $('#stopBody').innerHTML = (lines.length > 1 ? `<div class="filter-row"><button class="fchip${!stopFilter ? ' on' : ''}" data-f="">Wszystkie</button>` +
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
  go('plan');
});
$('#stopBody').addEventListener('click', (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { stopFilter = f.dataset.f || null; renderStop(); return; }
  const row = e.target.closest('[data-d]');
  if (!row) return;
  const x = S.stop.data.departures[+row.dataset.d];
  openTrip(x.trip, x.pos, S.stop.data.date);
});

// ---------------- KURS
export function openTrip(ref, focusPos, date, focusName) {
  S.trip = { ref, focusPos, date, focusName, data: null };
  go('trip');
}

onScreen('trip', async () => {
  const t = S.trip;
  $('#tripBody').innerHTML = '<div class="skel"></div>';
  try {
    t.data = await api(`/api/c/${city()}/trip?` + qs({ ref: t.ref, date: t.date }));
  } catch (e) {
    $('#tripBody').innerHTML = `<div class="empty">Nie udało się pobrać kursu: ${esc(e.message)}</div>`;
    return;
  }
  let focus = t.focusPos;
  if (focus == null && t.focusName) focus = t.data.stops.findIndex((s) => s.name === t.focusName);
  $('#tripBody').innerHTML = tripList(t.data, focus, t.date);
  const row = $('#tripBody .tl-row.focus');
  if (row) row.scrollIntoView({ block: 'center' });
  requestAnimationFrame(() => S.map.showTrip(t.data, focus, sheetPad('#tripSheet')));
}, () => S.map.clearRoute());

$('#tripBody').addEventListener('click', (e) => {
  const st = e.target.closest('[data-stop]');
  if (st) openStop({ name: st.dataset.stop, lat: +st.dataset.lat, lon: +st.dataset.lon });
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
}, 15000);

/** Po zmianie czasu/opcji: odśwież panel startowy, a na ekranie wyników wyszukaj ponownie. */
function queryChanged() {
  window.dispatchEvent(new Event('trasa:query'));
  if (currentScreen() === 'plan') runSearch();
}

export function optionsChanged() {
  return (S.opts.modes ? 1 : 0) + (S.opts.maxTransfers >= 0 ? 1 : 0) + (S.opts.walk !== 'normal' ? 1 : 0);
}

// ---------------- OKNO: CZAS
export function openTimeModal() {
  const n = localNow();
  const w = S.when;
  const date = w.now ? n.date : w.date;
  const time = w.now ? n.sec : w.time;
  let arriveBy = w.arriveBy;
  const days = Array.from({ length: 7 }, (_, i) => addDays(n.date, i));
  openModal(`<div class="m-title">Kiedy?</div>
    <div class="m-sec"><div class="seg" id="tmSeg"><button data-v="0" class="${!arriveBy ? 'on' : ''}">Odjazd</button><button data-v="1" class="${arriveBy ? 'on' : ''}">Przyjazd</button></div></div>
    <div class="m-sec m-row">
      <select class="inp" id="tmDate">${days.map((d) => `<option value="${d}"${d === date ? ' selected' : ''}>${dateLabel(d)}</option>`).join('')}</select>
      <input class="inp" type="time" id="tmTime" value="${hm(time)}">
    </div>
    <div class="m-btns"><button class="btn ghost" id="tmNow">Teraz</button><button class="btn primary" id="tmOk">Gotowe</button></div>`, (el) => {
    el.querySelectorAll('#tmSeg button').forEach((b) => { b.onclick = () => { arriveBy = b.dataset.v === '1'; el.querySelectorAll('#tmSeg button').forEach((x) => x.classList.toggle('on', x === b)); }; });
    $('#tmNow', el).onclick = async () => { S.when = { now: true, arriveBy: false, date: 0, time: 0 }; await closeModal(); queryChanged(); };
    $('#tmOk', el).onclick = async () => {
      const [h, m] = ($('#tmTime', el).value || '00:00').split(':').map(Number);
      S.when = { now: false, arriveBy, date: +$('#tmDate', el).value, time: h * 3600 + m * 60 };
      await closeModal();
      queryChanged();
    };
  });
}

// ---------------- OKNO: OPCJE
export function openOptionsModal() {
  const modes = (S.city.modes || []).filter((m) => m !== 'other');
  const o = { modes: S.opts.modes ? [...S.opts.modes] : [...modes], maxTransfers: S.opts.maxTransfers, walk: S.opts.walk };
  const seg = (id, items, val) => `<div class="seg" id="${id}">${items.map(([v, t]) => `<button data-v="${v}" class="${String(v) === String(val) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  openModal(`<div class="m-title">Opcje wyszukiwania</div>
    <div class="m-sec"><div class="m-label">Środki transportu</div><div class="toggles" id="opModes">
      ${modes.map((m) => `<button class="tgl${o.modes.includes(m) ? ' on' : ''}" data-m="${m}">${icon(m, 'sm')}${MODE_NAMES[m] || m}</button>`).join('')}</div></div>
    <div class="m-sec"><div class="m-label">Przesiadki</div>${seg('opTr', [[-1, 'Dowolnie'], [0, 'Bez'], [1, 'Maks. 1'], [2, 'Maks. 2']], o.maxTransfers)}</div>
    <div class="m-sec"><div class="m-label">Tempo marszu</div>${seg('opWalk', [['slow', 'Wolne'], ['normal', 'Normalne'], ['fast', 'Szybkie']], o.walk)}</div>
    <div class="m-btns"><button class="btn ghost" id="opReset">Domyślne</button><button class="btn primary" id="opOk">Zapisz</button></div>`, (el) => {
    el.querySelectorAll('#opModes .tgl').forEach((b) => {
      b.onclick = () => {
        const m = b.dataset.m;
        o.modes = o.modes.includes(m) ? o.modes.filter((x) => x !== m) : [...o.modes, m];
        b.classList.toggle('on', o.modes.includes(m));
      };
    });
    const bindSeg = (id, key, num) => el.querySelectorAll(`#${id} button`).forEach((b) => {
      b.onclick = () => { o[key] = num ? +b.dataset.v : b.dataset.v; el.querySelectorAll(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); };
    });
    bindSeg('opTr', 'maxTransfers', true);
    bindSeg('opWalk', 'walk', false);
    const save = async (opts) => { S.opts = opts; store.set('opts', opts); await closeModal(); queryChanged(); };
    $('#opReset', el).onclick = () => save({ modes: null, maxTransfers: -1, walk: 'normal' });
    $('#opOk', el).onclick = () => {
      if (!o.modes.length) { toast('Wybierz co najmniej jeden środek transportu'); return; }
      save({ modes: o.modes.length === modes.length ? null : o.modes, maxTransfers: o.maxTransfers, walk: o.walk });
    };
  });
}
