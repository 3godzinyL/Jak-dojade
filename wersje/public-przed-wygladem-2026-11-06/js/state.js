// Wspólny stan aplikacji + pomocnicze funkcje miejsc i historii wyszukiwań.
import { store } from './util.js';

export const S = {
  cities: [],
  city: null,
  map: null,
  me: null, // { lat, lon, acc }
  geo: 'unknown', // unknown | ok | denied | insecure | unsupported
  from: null, // { kind: 'stop'|'place'|'me'|'map', name, sub, lat, lon, group, modes, lines }
  to: null,
  when: { now: true, arriveBy: false, date: 0, time: 0 },
  opts: store.get('opts', { modes: null, maxTransfers: -1, walk: 'normal' }),
  plan: null,
  journeys: [],
  sel: null,
  lastKey: '',
  pickTarget: 'to',
  stop: null,
  trip: null,
};

export function placeLabel(p) {
  if (!p) return '';
  if (p.kind === 'me') return 'Moja lokalizacja';
  return p.name || 'Punkt na mapie';
}

/** Parametr API: przystanek po nazwie + pozycji (trwały mimo przeładowania rozkładu), punkt albo moja pozycja. */
export function placeParam(p) {
  if (!p) return null;
  if (p.kind === 'me') return S.me ? `${S.me.lat.toFixed(6)},${S.me.lon.toFixed(6)}` : null;
  if (p.kind === 'stop') return `n:${p.name}@${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}`;
  return `${(+p.lat).toFixed(6)},${(+p.lon).toFixed(6)}`;
}

export function stopPlace(s) {
  return { kind: 'stop', name: s.name, lat: s.lat, lon: s.lon, modes: s.modes || [], lines: s.lines || [], group: s.group };
}

function slim(p) {
  const { kind, name, sub, lat, lon, modes, lines } = p;
  return { kind, name, sub, lat, lon, modes, lines: lines ? lines.slice(0, 12) : undefined };
}

const same = (a, b) => a && b && a.kind === b.kind && a.name === b.name && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;

export function recentPlaces() { return store.get('places.' + S.city.id, []); }
export function addRecentPlace(p) {
  if (p.kind === 'me') return;
  const list = recentPlaces().filter((x) => !same(x, p));
  list.unshift(slim(p));
  store.set('places.' + S.city.id, list.slice(0, 12));
}

export function recentTrips() { return store.get('recent.' + S.city.id, []); }
export function addRecentTrip(from, to) {
  const key = (p) => (p.kind === 'me' ? 'me' : `${p.name}|${(+p.lat).toFixed(4)}|${(+p.lon).toFixed(4)}`);
  const k = key(from) + '>' + key(to);
  const list = recentTrips().filter((x) => key(x.from) + '>' + key(x.to) !== k);
  list.unshift({ from: from.kind === 'me' ? { kind: 'me' } : slim(from), to: to.kind === 'me' ? { kind: 'me' } : slim(to) });
  store.set('recent.' + S.city.id, list.slice(0, 8));
}
