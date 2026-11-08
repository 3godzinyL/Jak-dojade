// Czas, formatowanie, ikony: interfejs z icons.js (jakdojade.pl, lokalnie), reszta Material Design Icons (Apache 2.0)
import { ji } from './icons.js';

const P = {
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  swap: 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z',
  locate: 'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
  more: 'M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z',
  history: 'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  walk: 'M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9 7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7',
  bus: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z',
  tram: 'M19 16.94V8.5c0-2.79-2.61-3.4-6.01-3.49l.76-1.51H17V2H7v1.5h4.75l-.76 1.52C7.86 5.11 5 5.73 5 8.5v8.44c0 1.45 1.19 2.66 2.59 2.97L6 21.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 20h-.08c1.69 0 2.58-1.37 2.58-3.06zm-7 1.56c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm5-4.5H7V9h10v5z',
  metro: 'M12 2c-4.42 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h12v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm5.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6h-5V6h5v5z',
  rail: 'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2.23l2-2H14l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-3.58-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-7H6V6h5v4zm2 0V6h5v4h-5zm3.5 7c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  ferry: 'M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99a8.752 8.752 0 0 0 8 0c1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 0 0-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z',
  star: 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z',
  chevron: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  expand: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
  map: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z',
  bug: 'M20 8h-2.81a5.985 5.985 0 0 0-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z',
  flag: 'M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6z',
  refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
};
P.person = 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z';
P.nearMe = 'M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98L21 3z';
P.logout = 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z';
P.trolley = P.bus;
P.other = P.bus;

// nazwy w aplikacji → ikony interfejsu z icons.js
const JD_NAME = {
  back: 'arrow-left', close: 'close', search: 'search', swap: 'change', locate: 'gps', place: 'address', tune: 'filters', walk: 'walking',
  bus: 'vehicle-type-bus', tram: 'vehicle-type-tram', trolley: 'vehicle-type-trolleybus', rail: 'vehicle-type-train', metro: 'vehicle-type-train',
  person: 'profile', expand: 'arrow-down-short', route: 'navigation', schedule: 'schedule', ticket: 'ticket-fill', bookmark: 'bookmark-stroke',
  check: 'check', clear: 'clear', fill: 'arrow-up-left', pin: 'address', home: 'user-point-home', work: 'user-point-work', add: 'add',
  city: 'city-small', cart: 'shopping-cart', updown: 'dropdown-arrows', point: 'point', calm: 'meditation', run: 'run', buildings: 'buildings',
};
P.chevronRight = P.chevron;
P.external = 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z';

export function icon(name, cls = '') {
  if (JD_NAME[name]) { const s = ji(JD_NAME[name], 'ic ' + cls); if (s) return s; }
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || P.place}"/></svg>`;
}

export const MODE_COLORS = { tram: '#0a9f6a', bus: '#0a9f6a', metro: '#004969', rail: '#004969', trolley: '#0a9f6a', ferry: '#079fdb', other: '#6e6e6e' };
export const MODE_NAMES = { tram: 'Tramwaj', bus: 'Autobus', metro: 'Metro', rail: 'Pociąg', trolley: 'Trolejbus', ferry: 'Prom', other: 'Inne' };

export function lineColors(leg) {
  return { bg: leg.color || MODE_COLORS[leg.mode] || MODE_COLORS.other, fg: leg.textColor || '#fff' };
}

/** Numer linii jak w oryginale: ikona pojazdu + numer w ramce */
export function lineBadge(leg, cls = '', withIcon = true) {
  return `<span class="vnum">${withIcon ? `<span class="v-ic">${icon(leg.mode || 'bus')}</span>` : ''}<span class="vchip ${cls}">${esc(leg.line)}</span></span>`;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- czas: zegar serwera (poprawiony względem sieci) + strefa Europe/Warsaw
const TZ = 'Europe/Warsaw';
let offset = 0;
export function setClockOffset(ms) { offset = ms; }
export function nowMs() { return Date.now() + offset; }

const partsFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function localNow() {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(nowMs())).map((x) => [x.type, x.value]));
  return { date: +p.year * 10000 + +p.month * 100 + +p.day, sec: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

export function addDays(di, n) {
  const d = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100 + n));
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** sekundy od północy dnia `date` (mogą wyjść poza 0–86400) → "HH:MM" */
export function hm(sec) {
  const d = ((Math.floor(sec / 60) % 1440) + 1440) % 1440;
  return String(Math.floor(d / 60)).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0');
}

/** różnica w sekundach między czasem rozkładowym (date, sec) a teraz */
export function secondsFromNow(date, sec) {
  const n = localNow();
  let dayDiff = 0;
  if (date !== n.date) {
    const a = Date.UTC(Math.floor(date / 10000), Math.floor(date / 100) % 100 - 1, date % 100);
    const b = Date.UTC(Math.floor(n.date / 10000), Math.floor(n.date / 100) % 100 - 1, n.date % 100);
    dayDiff = Math.round((a - b) / 86400000);
  }
  return dayDiff * 86400 + sec - n.sec;
}

export function inText(date, sec) {
  const s = secondsFromNow(date, sec);
  if (s < -60) return 'odjechał';
  if (s < 60) return 'teraz';
  const m = Math.floor(s / 60);
  if (m < 60) return `za ${m} min`;
  return `o ${hm(sec)}`;
}

export function minutes(sec) {
  const m = Math.max(0, Math.round(sec / 60));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function meters(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

const DAYS = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
export function dateLabel(di) {
  const n = localNow().date;
  if (di === n) return 'dziś';
  if (di === addDays(n, 1)) return 'jutro';
  const d = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function transfersText(n) {
  if (n === 0) return 'bez przesiadek';
  if (n === 1) return '1 przesiadka';
  if (n < 5) return `${n} przesiadki`;
  return `${n} przesiadek`;
}

export function stopsText(n) {
  if (n === 1) return '1 przystanek';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) return `${n} przystanki`;
  return `${n} przystanków`;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const store = {
  get(k, def) { try { const v = localStorage.getItem('trasa.' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem('trasa.' + k, JSON.stringify(v)); } catch { /* tryb prywatny */ } },
};
