// Zakładka Bilety: Sklep (Ulgowe/Normalne, karty, przewoźnicy) + Twoje bilety.
// Zakup to SYMULACJA do nauki frontu: kod BLIK nigdzie nie leci, nie ma bramki płatności,
// a kupiony bilet jest zawsze oznaczony jako NIEWAŻNY (nie służy do kontroli).
import { esc, icon, store, nowMs, hm, lineBadge, MODE_NAMES } from './util.js';
import { ji } from './icons.js';
import { S } from './state.js';
import { go, onScreen, switchTab, openModal, closeModal, toast } from './nav.js';

const $ = (s) => document.querySelector(s);

// Karty i ceny odczytane ze sklepu aplikacji Jak Dojadę (Gdańsk, 06.11.2026); normalny 75-minutowy 6,00 zł
// z historii biletów (nagranie 08.11.2026), normalny jednoprzejazdowy 4,80 zł z cennika MZKZG. Reszta normalnych: null.
const P = {
  'mzkzg-1p': {
    op: 'MZKZG', desc: 'Linie zwykłe, nocne i pospieszne, do końca kursu', kind: 'Jednoprzejazdowy', price: { reduced: 2.4, normal: 4.8 },
    info: 'Bilet uprawnia do jednego przejazdu linią zwykłą, pośpieszną, specjalną lub nocną obsługiwaną przez ZTM w Gdańsku, ZKM w Gdyni lub MZK Wejherowo. Bilet jest ważny do końca kursu wybranej linii. Cena zawiera vat.',
    seller: 'mzkzg',
  },
  'skm-1': { noFare: true, op: 'PKP SKM', name: 'Bilet jednorazowy', big: 'SKM', bigText: true, price: null, info: 'Bilet jednorazowy Szybkiej Kolei Miejskiej — cena zależy od trasy przejazdu.', seller: 'skm' },
  'mzkzg-75': { op: 'MZKZG', desc: 'Linie zwykłe, nocne i pospieszne', big: '75', unit: 'minutowy', price: { reduced: 3.0, normal: 6.0 }, info: 'Bilet uprawnia do nieograniczonej liczby przejazdów i przesiadek przez 75 minut od momentu zakupu, wszystkimi liniami zwykłymi, pośpiesznymi i nocnymi obsługiwanymi przez ZTM w Gdańsku, ZKM w Gdyni i MZK Wejherowo. Cena zawiera vat.', seller: 'mzkzg' },
  'wej-1p': { op: 'MZK WEJHEROWO', desc: 'Linie zwykłe, do końca kursu', kind: 'Jednoprzejazdowy', place: 'Wejherowo', price: { reduced: 2.4, normal: null }, info: 'Bilet jednoprzejazdowy MZK Wejherowo na linie zwykłe, ważny do końca kursu.', seller: 'wej' },
  'mzkzg-24-all': { op: 'MZKZG', desc: 'ZTMGda+ZKMGdy+MZKWej', small: true, big: '24', unit: 'godzinny ZTMGda+ZKMGdy+MZKWej', price: { reduced: 12.0, normal: null }, info: 'Bilet 24-godzinny na komunikację ZTM Gdańsk, ZKM Gdynia i MZK Wejherowo.', seller: 'mzkzg' },
  'mzkzg-24-gdy': { op: 'MZKZG', desc: 'ZKMGdy+KOLEJ', small: true, big: '24', unit: 'godzinny ZKMGdy+KOLEJ', price: { reduced: 15.0, normal: null }, info: 'Bilet 24-godzinny na komunikację ZKM Gdynia i kolej.', seller: 'mzkzg' },
  'mzkzg-24-gda': { op: 'MZKZG', desc: 'ZTMGda+KOLEJ', small: true, big: '24', unit: 'godzinny ZTMGda+KOLEJ', price: { reduced: 15.0, normal: null }, info: 'Bilet 24-godzinny na komunikację ZTM Gdańsk i kolej.', seller: 'mzkzg' },
};
const SECTIONS = [
  ['Najpopularniejsze', ['mzkzg-1p', 'skm-1', 'mzkzg-75']],
  ['Przejazdowe', ['mzkzg-1p', 'wej-1p']],
  ['Czasowe', ['mzkzg-75']],
  ['Krótkookresowe', ['mzkzg-24-all', 'mzkzg-24-gdy', 'mzkzg-24-gda']],
];
const OPERATORS = [
  ['Wejherowo', 'Jednorazowe, Krótkookresowe, Okresowe', 'wej'],
  ['SKM', 'Jednorazowe, Okresowe', 'skm'],
  ['PKP - Bilety Kolejowe', 'Intercity, Taryfa Pomorska, SKM, Polregio, Koleje Małopolskie, Koleje Mazowieckie, Koleje Śląskie, Koleje Dolnośląskie', 'pkp'],
];
// oficjalne strony sprzedaży / cenników
const SELLERS = {
  mzkzg: { name: 'MZKZG', url: 'https://mzkzg.org' },
  skm: { name: 'SKM Trójmiasto', url: 'https://www.skm.pkp.pl' },
  wej: { name: 'MZK Wejherowo', url: 'https://www.mzkwejherowo.pl' },
  pkp: { name: 'PKP', url: 'https://www.pkp.pl' },
  ztm: { name: 'ZTM Gdańsk', url: 'https://ztm.gda.pl' },
  krakow: { name: 'ZTP Kraków', url: 'https://ztp.krakow.pl' },
  warszawa: { name: 'ZTM Warszawa', url: 'https://www.wtp.waw.pl' },
  poznan: { name: 'ZTM Poznań', url: 'https://www.ztm.poznan.pl' },
};

let tab = 'shop';
let fare = store.get('tickets.fare', 'reduced'); // wybór Ulgowe/Normalne zostaje między ekranami
const setFare = (f) => { fare = f; store.set('tickets.fare', f); };
let myView = null; // oglądany kupiony bilet (z „Twoje bilety”) albo null = karta ze sklepu

const money = (v) => v.toFixed(2).replace('.', ',');
const priceOf = (id) => { const p = P[id]; return p && p.price ? (p.price[fare] ?? p.price.reduced) : null; };

/** Bilet dla trasy jak w aplikacji: jeden pojazd → jednoprzejazdowy, przesiadka → 75-minutowy. */
export function journeyTicket(j) {
  if (!S.city || S.city.id !== 'gdansk' || !j || !Array.isArray(j.legs)) return null;
  const rides = j.legs.filter((l) => l.type === 'ride');
  if (!rides.length) return null;
  // pociąg SKM: bilet MZKZG na linie zwykłe go nie obejmuje — cena zależy od trasy (sprzedaż u SKM)
  if (rides.some((l) => l.mode === 'rail')) return { type: 'skm-1', price: null };
  const type = rides.length === 1 ? 'mzkzg-1p' : 'mzkzg-75';
  const price = priceOf(type);
  return price == null ? null : { type, price };
}

/** Napis na przycisku „Kup bilet”: z ceną, gdy wszystkie pokazane trasy kosztują tyle samo (jak w aplikacji). */
export function buyLabel(journeys) {
  const list = (journeys || []).map(journeyTicket).filter(Boolean);
  if (!list.length) return null;
  const same = list.every((x) => x.type === list[0].type && x.price === list[0].price);
  const priced = same && list[0].price != null;
  return { type: same ? list[0].type : 'mzkzg-1p', text: priced ? `Kup bilet · ${money(list[0].price)} zł` : 'Kup bilet' };
}

function cardHtml(id, { open = true } = {}) {
  const p = P[id];
  const v = p.price ? p.price[fare] : null;
  const band = p.noFare ? '<div class="tk-band dash"></div>' : `<div class="tk-band${fare === 'normal' ? ' n' : ''}">${fare === 'normal' ? 'NORMALNY' : 'ULGOWY'}</div>`;
  let face = `${band}<div class="tk-op">${esc(p.op)}</div>`;
  if (p.name) face += `<div class="tk-name">${esc(p.name)}</div>`;
  if (p.desc) face += `<div class="tk-desc${p.small ? ' small' : ''}">${esc(p.desc)}</div>`;
  if (p.big) face += `<div class="tk-big${p.bigText ? ' txt' : ''}">${esc(p.big)}</div>`;
  if (p.unit) face += `<div class="tk-unit">${esc(p.unit)}</div>`;
  if (p.kind) face += `<div class="tk-kind"${p.place ? ' style="margin-bottom:22px"' : ''}>${esc(p.kind)}${p.place ? `<div style="font-weight:400;margin-top:12px;font-size:15px">${esc(p.place)}</div>` : ''}</div>`;
  let box;
  if (!p.price) box = `<div class="tk-pick">Wybierz bilet</div>`;
  else if (v == null) box = `<div class="tk-price none">Cena ${fare === 'normal' ? 'normalna' : ''} u przewoźnika</div>`;
  else box = `<div class="tk-price">${money(v)}<small>zł</small></div>`;
  return `<div class="tk-card"${open ? ` data-card="${id}" role="button" tabindex="0"` : ''}><div class="tk-face">${face}</div><div class="tk-box">${box}</div></div>`;
}

function shopHtml() {
  if (!S.city || S.city.id !== 'gdansk') {
    const s = SELLERS[S.city && S.city.id] || SELLERS.ztm;
    return `<div class="tk-empty"><div class="ic-wrap">${ji('ticket-horizontal')}</div><b>Sklep tylko dla Gdańska</b>
      <p>Karty biletów odczytano z aplikacji dla Gdańska. Cennik dla miasta ${esc(S.city ? S.city.name : '')} znajdziesz u przewoźnika.</p>
      <a class="ybtn" href="${s.url}" target="_blank" rel="noopener">${esc(s.name)} ${ji('right-alt')}</a></div>`;
  }
  let html = `<div class="tk-switch" role="tablist"><button data-fare="reduced" class="${fare === 'reduced' ? 'on' : ''}">Ulgowe</button><button data-fare="normal" class="${fare === 'normal' ? 'on' : ''}">Normalne</button></div>`;
  for (const [title, ids] of SECTIONS) html += `<section class="tk-sec"><div class="tk-cat">${title}</div><div class="tk-row">${ids.map((id) => cardHtml(id)).join('')}</div></section>`;
  html += `<div class="tk-ops">${OPERATORS.map(([n, sub, key]) => `<a class="tk-oprow" href="${SELLERS[key].url}" target="_blank" rel="noopener"><span class="grow"><b>${esc(n)}</b><small>${esc(sub)}</small></span><span class="chev">${icon('chevronRight')}</span></a>`).join('')}</div>`;
  return html;
}

// ---------------- Twoje bilety (zapisane lokalnie przez symulację zakupu)
const myTickets = () => store.get('tickets.mine', []);
function saveTicket(t) { const l = myTickets(); l.unshift(t); store.set('tickets.mine', l.slice(0, 50)); }

// daty jak w „Twoich biletach”: nagłówek „04.11.2026”, przy bilecie „środa / 04.11.2026 22:25”
const WAW = { timeZone: 'Europe/Warsaw' };
const dmy = (ms) => new Date(ms).toLocaleDateString('pl-PL', { ...WAW, day: '2-digit', month: '2-digit', year: 'numeric' });
const hmOf = (ms) => new Date(ms).toLocaleTimeString('pl-PL', { ...WAW, hour: '2-digit', minute: '2-digit' });
const dowOf = (ms) => new Date(ms).toLocaleDateString('pl-PL', { ...WAW, weekday: 'long' });

// Karta kupionego biletu (szara jak w aplikacji). Bilet z symulacji nie jest ważny, więc zamiast
// „Pokaż do kontroli” ma napis „Bilet testowy” i znak TESTOWY — nie da się go pokazać kontrolerowi.
function mineCard(t) {
  const p = P[t.type] || { op: 'Bilet' };
  let face = `<div class="tk-band n">${t.fare === 'normal' ? 'NORMALNY' : 'ULGOWY'}</div><div class="tk-op">${esc(p.op)}</div>`;
  if (p.name) face += `<div class="tk-name">${esc(p.name)}</div>`;
  if (p.desc) face += `<div class="tk-desc${p.small ? ' small' : ''}">${esc(p.desc)}</div>`;
  if (p.big) face += `<div class="tk-big${p.bigText ? ' txt' : ''}">${esc(p.big)}</div>`;
  if (p.unit) face += `<div class="tk-unit">${esc(p.unit)}</div>`;
  if (p.kind) face += `<div class="tk-kind">${esc(p.kind)}</div>`;
  return `<span class="mt-tcard"><span class="mt-tface">${face}<span class="mt-test">TESTOWY</span></span><span class="mt-tbtn">Bilet testowy</span></span>`;
}

function mineHtml() {
  const list = myTickets();
  if (!list.length) {
    return `<div class="tk-empty"><div class="ic-wrap">${ji('ticket-horizontal')}</div><b>Nie masz tu biletów</b>
      <p>Kupione tu bilety (symulacja) pojawią się na tej liście jako testowe.</p>
      <button class="ybtn" data-goshop>Przejdź do sklepu</button></div>`;
  }
  let html = '';
  let last = '';
  for (const t of list) {
    const day = dmy(t.ts);
    if (day !== last) { html += `<div class="mt-day">${day}</div>`; last = day; }
    html += `<div class="mt-item">
      <button class="mt-left" data-mine="${t.id}" aria-label="Szczegóły biletu">${mineCard(t)}</button>
      <div class="mt-right">
        <div class="mt-meta">${icon('calendar')}<span>Kupiony ${esc(dowOf(t.ts))}<br>${day} ${hmOf(t.ts)}</span></div>
        <div class="mt-meta">${icon('tag')}<span>${t.price != null ? money(t.price) + ' zł' : '—'}</span></div>
        <button class="mt-again" data-again="${esc(t.type)}" data-againfare="${t.fare === 'normal' ? 'normal' : 'reduced'}">Kup ponownie</button>
        <button class="mt-more" data-mine="${t.id}">Zobacz więcej</button>
      </div>
    </div>`;
  }
  return `<div class="mt-list">${html}</div>`;
}

function render() {
  document.querySelectorAll('.tk-tab').forEach((b) => b.classList.toggle('on', b.dataset.tk === tab));
  $('#ticketsBody').innerHTML = tab === 'shop' ? shopHtml() : mineHtml();
}

onScreen('tickets', render);
document.querySelector('.tk-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tk]');
  if (b) { tab = b.dataset.tk; render(); }
});
$('#ticketsBody').addEventListener('click', (e) => {
  const f = e.target.closest('[data-fare]');
  if (f) { setFare(f.dataset.fare); const y = $('#ticketsBody').scrollTop; render(); $('#ticketsBody').scrollTop = y; return; }
  if (e.target.closest('[data-goshop]')) { tab = 'shop'; render(); return; }
  const again = e.target.closest('[data-again]');
  if (again) { setFare(again.dataset.againfare); startPurchase(again.dataset.again); return; }
  const mine = e.target.closest('[data-mine]');
  if (mine) { myView = myTickets().find((t) => t.id === mine.dataset.mine) || null; if (myView) go('ticket'); return; }
  const c = e.target.closest('[data-card]');
  if (c) { myView = null; S.ticketSel = c.dataset.card; go('ticket'); }
});

// ---------------- ekran szczegółów: kupiony bilet (nieważny) ALBO karta ze sklepu
onScreen('ticket', () => {
  $('#ticket .phdr > span').textContent = myView ? 'Twój bilet' : '';
  if (myView) renderMyTicket(myView); else renderShopTicket();
});

function renderShopTicket() {
  const id = S.ticketSel;
  const p = P[id];
  if (!p) return;
  const s = SELLERS[p.seller];
  const v = p.price ? p.price[fare] : null;
  $('#ticketBody').innerHTML = `<div class="tk-hero">${cardHtml(id, { open: false })}</div>
    <div class="tk-info">${esc(p.info)}
      <dl><dt>Rodzaj</dt><dd>${fare === 'normal' ? 'normalny' : 'ulgowy'}</dd><dt>Organizator</dt><dd>${esc(p.op)}</dd>
      <dt>Cena</dt><dd>${v != null ? `${money(v)} zł <span style="color:var(--ink-2)">(sklep aplikacji Jak Dojadę, 06.11.2026)</span>` : 'u przewoźnika'}</dd></dl></div>`;
  const canBuy = p.price && p.price[fare] != null;
  $('#ticketBuy').innerHTML = `${canBuy ? `<button class="ybtn" data-buyflow="${id}">Kup i skasuj · ${money(v)} zł</button>` : ''}
    <a class="tk-seller" href="${s.url}" target="_blank" rel="noopener">Oficjalna sprzedaż · ${esc(s.name)}${ji('right-alt')}</a>
    <div class="note">Zakup w aplikacji to symulacja do nauki — bez prawdziwej płatności; bilet zapisze się jako nieważny.</div>`;
  $('#ticketBuy').querySelector('[data-buyflow]')?.addEventListener('click', (ev) => startPurchase(ev.currentTarget.dataset.buyflow));
}

// Szczegóły kupionego biletu w układzie aplikacji. Bilet z symulacji jest zawsze NIEWAŻNY:
// bez okna ważności, z numerem TEST i bez „Pokaż do kontroli” — nie służy do okazania kontrolerowi.
function renderMyTicket(t) {
  const p = P[t.type] || {};
  const agency = t.agency || (S.city && S.city.feeds && S.city.feeds[0] ? S.city.feeds[0].name.replace(/ — .*/, '') : '—');
  const row = (k, v, b = false) => `<div class="mt-kv${b ? ' b' : ''}"><span>${k}</span><span>${v}</span></div>`;
  $('#ticketBody').innerHTML = `<div class="mt-dhero">${mineCard(t)}</div>
    <div class="mt-status">Bilet testowy — nieważny</div>
    <div class="mt-valid"><div><small>Ważny od:</small><b>—</b></div><div class="r"><small>Ważny do:</small><b>—</b></div></div>
    <div class="mt-info">
      <div class="mt-desc"><div class="mt-desc-t">Opis</div><p>${esc(p.info || '')}</p></div>
      ${row('Data zakupu', `${dmy(t.ts)} ${hmOf(t.ts)}`)}
      ${row('Identyfikator użytkownika', esc(S.user || '—'))}
      ${row('Numer telefonu', '—')}
      ${row('Numer linii', esc(t.line || '—'))}
      ${row('Przewoźnik', esc(agency))}
      ${row('Typ pojazdu', esc(MODE_NAMES[t.mode] || '—'))}
      ${row('Numer biletu', 'TEST ' + esc(String(t.id).slice(-8)))}
      ${row('Cena', t.price != null ? money(t.price) + ' zł' : '—', true)}
    </div>`;
  $('#ticketBuy').innerHTML = `<div class="note">Bilet testowy z symulacji zakupu — nie jest dowodem opłaty przejazdu.</div>
    <button class="ybtn" data-again2="${esc(t.type)}">Kup ponownie</button>`;
  $('#ticketBuy [data-again2]').onclick = () => { setFare(t.fare === 'normal' ? 'normal' : 'reduced'); startPurchase(t.type); };
}

// =====================================================================
// SYMULACJA ZAKUPU: jadę teraz → ulgowy/normalny → kup i skasuj →
// wybór linii + 30 s → kod BLIK → potwierdzenie. Bez bramki płatności.
// Ukryty admin: kod BLIK „111111” wymusza potwierdzenie.
// =====================================================================
const ADMIN_BLIK = '111111';
const flow = { type: 'mzkzg-1p', line: null, mode: null };
let cdTimer = null;

const modalAlive = () => { const m = document.getElementById('modal'); return m && !m.hidden; };
function stopCountdown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
function startCountdown(sec, onTick, onEnd) {
  stopCountdown();
  let left = sec;
  onTick(left);
  cdTimer = setInterval(() => {
    if (!modalAlive()) return stopCountdown();
    left -= 1;
    if (left <= 0) { stopCountdown(); onTick(0); onEnd(); return; }
    onTick(left);
  }, 1000);
}

export function startPurchase(type = 'mzkzg-1p') {
  if (!S.city || S.city.id !== 'gdansk') { toast('Sklep biletów działa dla Gdańska'); switchTab('tickets'); return; }
  // bilet bez stałej ceny (SKM): karta biletu z odesłaniem do oficjalnej sprzedaży zamiast symulacji zakupu
  if (P[type] && !P[type].price) { myView = null; S.ticketSel = type; go('ticket'); return; }
  if (!P[type]) type = 'mzkzg-1p';
  flow.type = type;
  flow.line = null;
  flow.mode = null;
  stepFare();
}

function flowLines() {
  if (S.sel && Array.isArray(S.sel.legs)) {
    const ls = S.sel.legs.filter((l) => l.type === 'ride').map((l) => ({ line: l.line, mode: l.mode }));
    if (ls.length) return ls;
  }
  return [{ line: '2', mode: 'tram' }, { line: '6', mode: 'tram' }, { line: '8', mode: 'tram' }, { line: '10', mode: 'tram' }, { line: 'N3', mode: 'bus' }];
}

function faceSmall(id) { return `<div class="tk-hero sm">${cardHtml(id, { open: false })}</div>`; }

function stepFare() {
  stopCountdown();
  const p = P[flow.type];
  const price = p.price[fare] ?? p.price.reduced ?? 0;
  openModal(`<div class="m-title">Kup bilet</div>
    <div class="buy-now">${ji('realtime')}<span>Jadę teraz</span></div>
    <div class="tk-switch" role="tablist"><button data-f="reduced" class="${fare === 'reduced' ? 'on' : ''}">Ulgowe</button><button data-f="normal" class="${fare === 'normal' ? 'on' : ''}">Normalne</button></div>
    ${faceSmall(flow.type)}
    <div class="pay-method">${ji('shopping-cart')}<span>Płatność: <b>BLIK</b></span></div>
    <div class="m-btns"><button class="ybtn" data-act="buyval">Kup i skasuj · ${money(price)} zł</button></div>`, (el) => {
    el.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { setFare(b.dataset.f); stepFare(); }; });
    el.querySelector('[data-act="buyval"]').onclick = () => stepLine();
  });
}

function stepLine() {
  const lines = flowLines();
  openModal(`<div class="m-title">Wybierz linię</div>
    <div class="buy-sub">Skasuj bilet na linii, którą jedziesz</div>
    <div class="cd-wrap"><span class="cd-num" id="cdNum">30</span><span class="cd-lab">s na skasowanie</span></div>
    <div class="line-grid">${lines.map((l) => `<button class="line-pick" data-line="${esc(l.line)}" data-mode="${esc(l.mode || '')}">${lineBadge(l)}</button>`).join('')}</div>
    <div class="m-btns"><button class="tbtn" data-close>Anuluj</button></div>`, (el) => {
    const num = el.querySelector('#cdNum');
    startCountdown(30, (s) => { if (num) num.textContent = s; }, () => { toast('Czas na skasowanie minął'); closeModal(); });
    el.querySelectorAll('[data-line]').forEach((b) => { b.onclick = () => { flow.line = b.dataset.line; flow.mode = b.dataset.mode || null; stepBlik(); }; });
    el.querySelector('[data-close]').onclick = () => { stopCountdown(); closeModal(); };
  });
}

function stepBlik() {
  openModal(`<div class="m-title">Wprowadź kod BLIK</div>
    <div class="buy-sub">Linia ${esc(flow.line || '')} · potwierdź w <span id="cdNum">30</span> s</div>
    <div class="blik-row">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="blik-box" inputmode="numeric" maxlength="1" data-bi="${i}" aria-label="cyfra ${i + 1}">`).join('')}</div>
    <div class="blik-status" id="blikStatus"></div>
    <div class="m-btns"><button class="ybtn" data-act="confirm">Potwierdź</button><button class="tbtn" data-close>Anuluj</button></div>`, (el) => {
    const boxes = [...el.querySelectorAll('.blik-box')];
    const num = el.querySelector('#cdNum');
    const status = el.querySelector('#blikStatus');
    startCountdown(30, (s) => { if (num) num.textContent = s; }, () => { status.textContent = 'Czas minął — spróbuj ponownie.'; });
    boxes[0]?.focus();
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(0, 1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); });
      b.addEventListener('keydown', (ev) => { if (ev.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
    });
    let waiting = false;
    el.querySelector('[data-act="confirm"]').onclick = () => {
      const code = boxes.map((b) => b.value).join('');
      if (code.length < 6) { status.textContent = 'Wpisz 6 cyfr kodu BLIK.'; return; }
      if (code === ADMIN_BLIK) { stopCountdown(); stepDone(); return; }
      if (waiting) return;
      waiting = true;
      status.innerHTML = '<span class="spin"></span> Oczekiwanie na potwierdzenie w aplikacji banku…';
      setTimeout(() => { if (modalAlive()) { status.textContent = 'Nie otrzymano potwierdzenia. To wersja testowa — brak podłączonej bramki płatności.'; waiting = false; } }, 4000);
    };
    el.querySelector('[data-close]').onclick = () => { stopCountdown(); closeModal(); };
  });
}

function stepDone() {
  const p = P[flow.type];
  const price = p.price[fare] ?? p.price.reduced ?? null;
  const t = { id: 't' + nowMs(), ts: nowMs(), type: flow.type, fare, line: flow.line, mode: flow.mode, price, city: S.city.id };
  saveTicket(t);
  openModal(`<div class="buy-done"><span class="buy-ok">${icon('check')}</span><b>Płatność zaakceptowana</b><small>symulacja — bez prawdziwej płatności</small></div>
    <div class="buy-sub" style="text-align:center">Bilet zapisany w „Twoje bilety” (jako testowy).</div>
    <div class="m-btns"><button class="ybtn" data-act="show">Pokaż bilet</button><button class="tbtn" data-close>Zamknij</button></div>`, (el) => {
    el.querySelector('[data-act="show"]').onclick = async () => { myView = t; await closeModal(); go('ticket'); };
    el.querySelector('[data-close]').onclick = () => { tab = 'mine'; closeModal(); };
  });
}

// cena na pasku „Kup bilet” na ekranie wyników (najniższa znana — ulgowa jednoprzejazdowa)
export function buyBarInfo() {
  if (!S.city || S.city.id !== 'gdansk') return null;
  const p = P['mzkzg-1p'];
  const price = p && p.price ? (p.price.reduced ?? p.price.normal) : null;
  return price != null ? { price } : null;
}

export function openShop() { tab = 'shop'; myView = null; switchTab('tickets'); }
