'use strict';
// Planowanie podróży: dojście do przystanków, kilka wariantów (kolejne odjazdy), tryb „przyjazd na”, odjazdy z przystanku.
const { raptor, reconstruct, INF, DAY } = require('./raptor');
const { activeServices, addDays } = require('../gtfs/load');
const { dist, walkSeconds, walkMeters, WALK_SPEEDS } = require('../geo');

const ACCESS_RADIUS = 1000;
const ACCESS_RADIUS_FAR = 2500;
const MAX_ACCESS_STOPS = 80;
const DIRECT_WALK_MAX_M = 3000;

function hasTrips(m, s) { return m.sp.start[s + 1] > m.sp.start[s]; }

/** Dojście: punkt albo zespół przystanków → { arr: Int32Array sekund (-1 brak), list } */
function accessFor(m, place, speed) {
  const arr = new Int32Array(m.nStops).fill(-1);
  const list = [];
  const set = (s, sec) => {
    if (arr[s] < 0) list.push(s);
    if (arr[s] < 0 || sec < arr[s]) arr[s] = sec;
  };
  if (place.group != null && m.groups[place.group]) {
    const g = m.groups[place.group];
    for (const s of g.stops) {
      set(s, 0);
      for (let e = m.fp.start[s]; e < m.fp.start[s + 1]; e++) {
        if (m.fp.dist[e] <= 300) set(m.fp.to[e], walkSeconds(m.fp.dist[e], speed));
      }
    }
  } else {
    let near = m.grid.near(place.lat, place.lon, ACCESS_RADIUS).filter(([s]) => hasTrips(m, s));
    if (near.length < 4) near = m.grid.near(place.lat, place.lon, ACCESS_RADIUS_FAR).filter(([s]) => hasTrips(m, s)).slice(0, 12);
    for (const [s, d] of near.slice(0, MAX_ACCESS_STOPS)) set(s, walkSeconds(d, speed));
  }
  return { arr, list };
}

function placeCoords(m, place) {
  if (place.group != null && m.groups[place.group]) {
    const g = m.groups[place.group];
    return { lat: g.lat, lon: g.lon, name: place.name || g.name };
  }
  return { lat: place.lat, lon: place.lon, name: place.name || '' };
}

function stopInfo(m, s) {
  return {
    name: m.stops.name[s],
    platform: m.stops.platform[s] || '',
    code: m.stops.code[s] || '',
    lat: +m.stops.lat[s].toFixed(6),
    lon: +m.stops.lon[s].toFixed(6),
    group: m.stopGroup[s],
  };
}

function routeInfo(m, ri) {
  const r = m.routes[ri];
  return { mode: r.mode, line: r.short || r.long, routeLong: r.long !== r.short ? r.long : '', color: r.color, textColor: r.textColor, agency: r.agency };
}

/** Wycinek kształtu trasy między przystankami wsiadania i wysiadania. */
function shapeSlice(m, trip, stopsLatLon) {
  const key = m.trips.shape[trip];
  const sh = key && m.shapes.get(key);
  const fallback = stopsLatLon.map((p) => [p.lat, p.lon]);
  if (!sh || sh.length < 4) return fallback;
  const nearestFrom = (lat, lon, from) => {
    let bi = from, bd = Infinity;
    for (let i = from; i < sh.length / 2; i++) {
      const d = (sh[i * 2] - lat) ** 2 + ((sh[i * 2 + 1] - lon) * 0.64) ** 2;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };
  const a = stopsLatLon[0], b = stopsLatLon[stopsLatLon.length - 1];
  const i0 = nearestFrom(a.lat, a.lon, 0);
  const i1 = nearestFrom(b.lat, b.lon, i0);
  if (i1 <= i0) return fallback;
  const out = [];
  for (let i = i0; i <= i1; i++) out.push([+sh[i * 2].toFixed(5), +sh[i * 2 + 1].toFixed(5)]);
  return out;
}

function tripRef(p, row, off) { return `${p}.${row}.${off}`; }

function rideLeg(m, leg) {
  const pat = m.patterns[leg.p];
  const S = pat.stops.length;
  const base = leg.row * S;
  const trip = pat.trips[leg.row];
  const stops = [];
  for (let i = leg.bPos; i <= leg.aPos; i++) {
    const s = pat.stops[i];
    stops.push({
      name: m.stops.name[s], lat: +m.stops.lat[s].toFixed(6), lon: +m.stops.lon[s].toFixed(6), group: m.stopGroup[s],
      t: (i === leg.bPos ? pat.dep[base + i] : pat.arr[base + i]) + leg.off * DAY,
    });
  }
  return {
    type: 'ride',
    ...routeInfo(m, pat.route),
    headsign: m.trips.headsign[trip],
    trip: tripRef(leg.p, leg.row, leg.off),
    from: stopInfo(m, pat.stops[leg.bPos]),
    to: stopInfo(m, pat.stops[leg.aPos]),
    dep: pat.dep[base + leg.bPos] + leg.off * DAY,
    arr: pat.arr[base + leg.aPos] + leg.off * DAY,
    stops,
    shape: shapeSlice(m, trip, stops),
  };
}

function walkLeg(from, to, dep, sec) {
  const meters = walkMeters(dist(from.lat, from.lon, to.lat, to.lon));
  return {
    type: 'walk',
    from: { name: from.name, lat: from.lat, lon: from.lon },
    to: { name: to.name, lat: to.lat, lon: to.lon },
    dep, arr: dep + sec, sec, meters,
    shape: [[from.lat, from.lon], [to.lat, to.lon]],
  };
}

/** Surowe odcinki z RAPTOR → podróż z czasami, odcinkami pieszymi i podsumowaniem. */
function buildJourney(m, raw, origin, dest, egressSec, speed) {
  const rides = raw.filter((l) => l.kind === 'ride');
  if (!rides.length) return null;
  const legs = [];
  const access = raw[0];
  const firstRide = rideLeg(m, rides[0]);
  // wyjście zaokrąglone w dół do pełnej minuty — godziny i czas trwania na karcie się zgadzają
  const leave = Math.floor((firstRide.dep - (access.kind === 'access' ? access.sec : 0)) / 60) * 60;
  const accessSec = firstRide.dep - leave;
  const walkSec = access.kind === 'access' ? access.sec : 0;
  if (walkSec > 0 && dist(origin.lat, origin.lon, firstRide.from.lat, firstRide.from.lon) > 40) legs.push(walkLeg(origin, firstRide.from, leave, walkSec));
  let prevRide = null;
  let cur = leave + accessSec;
  let lastPoint = firstRide.from;
  for (const l of raw) {
    if (l.kind === 'ride') {
      const leg = prevRide === null ? firstRide : rideLeg(m, l);
      const d = dist(lastPoint.lat, lastPoint.lon, leg.from.lat, leg.from.lon);
      // przesiadka w obrębie węzła bez osobnego przejścia w RAPTOR
      if (prevRide && d > 40) legs.push(walkLeg(lastPoint, leg.from, cur, walkSeconds(d, speed)));
      legs.push(leg);
      prevRide = leg;
      cur = leg.arr;
      lastPoint = leg.to;
    } else if (l.kind === 'walk') {
      const to = stopInfo(m, l.to);
      if (dist(lastPoint.lat, lastPoint.lon, to.lat, to.lon) > 40) legs.push(walkLeg(lastPoint, to, cur, l.sec));
      cur += l.sec;
      lastPoint = to;
    }
  }
  if (egressSec > 0) legs.push(walkLeg(lastPoint, dest, cur, egressSec));
  const arrive = cur + egressSec;
  // sąsiednie odcinki piesze (przejście + dojście do celu) jako jeden
  for (let i = legs.length - 1; i > 0; i--) {
    const a = legs[i - 1], b = legs[i];
    if (a.type === 'walk' && b.type === 'walk') {
      a.to = b.to; a.arr = b.arr; a.sec += b.sec; a.meters += b.meters; a.shape.push(b.shape[b.shape.length - 1]);
      legs.splice(i, 1);
    }
  }
  const rideLegs = legs.filter((l) => l.type === 'ride');
  return {
    id: rides.map((r) => tripRef(r.p, r.row, r.off) + ':' + r.bPos + '-' + r.aPos).join('|'),
    leave,
    arrive,
    duration: arrive - leave,
    rides: rideLegs.length,
    transfers: rideLegs.length - 1,
    walkMeters: legs.filter((l) => l.type === 'walk').reduce((s, l) => s + l.meters, 0),
    legs,
  };
}

function dominates(a, b) {
  return a.leave >= b.leave && a.arrive <= b.arrive && a.rides <= b.rides &&
    (a.leave > b.leave || a.arrive < b.arrive || a.rides < b.rides);
}

function paretoFilter(list) {
  return list.filter((j) => !list.some((o) => o !== j && dominates(o, j)));
}

/**
 * q: { from, to (place: {lat,lon,name} | {group,name}), date (YYYYMMDD), time (s), arriveBy, modes: Set|null,
 *      maxTransfers, walk: 'slow'|'normal'|'fast', count }
 */
function plan(m, q) {
  const t0 = Date.now();
  const speed = WALK_SPEEDS[q.walk] || WALK_SPEEDS.normal;
  const origin = placeCoords(m, q.from);
  const dest = placeCoords(m, q.to);
  const acc = accessFor(m, q.from, speed);
  const egr = accessFor(m, q.to, speed);
  const active = [activeServices(m, addDays(q.date, -1)), activeServices(m, q.date), activeServices(m, addDays(q.date, 1))];
  let routeOk = null;
  if (q.modes && q.modes.size) {
    routeOk = new Uint8Array(m.routes.length);
    m.routes.forEach((r, i) => { routeOk[i] = q.modes.has(r.mode) || (r.mode === 'trolley' && q.modes.has('bus')) || (r.mode === 'other') ? 1 : 0; });
  }
  const maxRounds = Math.min(6, (q.maxTransfers >= 0 ? q.maxTransfers : 4) + 1);
  const count = Math.max(1, Math.min(10, q.count || 5));
  const opts = {
    access: acc.arr, accessList: acc.list, egress: egr.arr,
    active, maxRounds, slack: 60, walkSlack: 30, speed, routeOk,
  };

  const found = [];
  const seen = new Set();
  let runs = 0;
  const collect = (t) => {
    runs++;
    const res = raptor(m, { ...opts, t0: t });
    let minLeave = INF;
    for (const r of res.rounds) {
      const raw = reconstruct(m, res, r.k, r.stop);
      if (!raw) continue;
      const j = buildJourney(m, raw, origin, dest, egr.arr[r.stop], speed);
      if (!j) continue;
      if (j.leave < minLeave) minLeave = j.leave;
      if (!seen.has(j.id)) { seen.add(j.id); found.push(j); }
    }
    return minLeave;
  };

  let journeys;
  if (!q.arriveBy) {
    let t = q.time;
    for (let it = 0; it < 12 && paretoFilter(found).length < count; it++) {
      const ml = collect(t);
      if (ml >= INF) break;
      t = Math.max(t + 60, ml + 60);
    }
    journeys = paretoFilter(found).sort((a, b) => a.leave - b.leave || a.arrive - b.arrive).slice(0, count);
  } else {
    for (const back of [120 * 60, 240 * 60]) {
      let t = q.time - back;
      for (let it = 0; it < 30 && t <= q.time; it++) {
        const ml = collect(t);
        if (ml >= INF) break;
        t = Math.max(t + 60, ml + 60);
      }
      if (found.some((j) => j.arrive <= q.time)) break;
    }
    journeys = paretoFilter(found.filter((j) => j.arrive <= q.time))
      .sort((a, b) => b.leave - a.leave).slice(0, count)
      .sort((a, b) => a.leave - b.leave || a.arrive - b.arrive);
  }

  let walk = null;
  const dWalk = dist(origin.lat, origin.lon, dest.lat, dest.lon);
  if (walkMeters(dWalk) <= DIRECT_WALK_MAX_M) {
    const sec = walkSeconds(dWalk, speed);
    walk = walkLeg(origin, dest, q.arriveBy ? q.time - sec : q.time, sec);
  }
  return {
    date: q.date,
    from: origin,
    to: dest,
    arriveBy: !!q.arriveBy,
    time: q.time,
    journeys,
    walk,
    stats: { ms: Date.now() - t0, runs, access: acc.list.length, egress: egr.list.length },
  };
}

/** Najbliższe odjazdy z zespołu przystanków. */
function departures(m, groupId, date, time, { limit = 40, horizon = 3 * 3600 } = {}) {
  const g = m.groups[groupId];
  if (!g) return null;
  const active = [activeServices(m, addDays(date, -1)), activeServices(m, date), activeServices(m, addDays(date, 1))];
  const out = [];
  const svc = m.trips.service;
  for (const s of g.stops) {
    for (let e = m.sp.start[s]; e < m.sp.start[s + 1]; e++) {
      const p = m.sp.pat[e], pos = m.sp.pos[e];
      const pat = m.patterns[p];
      if (!pat.pick[pos]) continue;
      const S = pat.stops.length;
      const n = pat.trips.length;
      for (let k = 0; k < 3; k++) {
        const off = k - 1;
        const act = active[k];
        const t = time - off * DAY;
        let lo = 0, hi = n;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (pat.dep[mid * S + pos] < t) lo = mid + 1; else hi = mid; }
        for (let r = lo; r < n; r++) {
          const d = pat.dep[r * S + pos] + off * DAY;
          if (d > time + horizon) break;
          if (act[svc[pat.trips[r]]]) out.push({ d, p, r, off, pos, s });
        }
      }
    }
  }
  out.sort((a, b) => a.d - b.d);
  return {
    group: { id: g.id, name: g.name, lat: g.lat, lon: g.lon, lines: g.lines, modes: g.modes },
    date,
    time,
    departures: out.slice(0, limit).map((x) => {
      const pat = m.patterns[x.p];
      const trip = pat.trips[x.r];
      return {
        t: x.d,
        ...routeInfo(m, pat.route),
        headsign: m.trips.headsign[trip],
        platform: m.stops.platform[x.s] || '',
        stop: m.stops.name[x.s],
        trip: tripRef(x.p, x.r, x.off),
        pos: x.pos,
      };
    }),
  };
}

/** Pełny przebieg kursu (do widoku „kurs” po kliknięciu odjazdu). */
function tripDetail(m, ref) {
  const [p, row, off] = String(ref).split('.').map(Number);
  const pat = m.patterns[p];
  if (!pat || !(row >= 0 && row < pat.trips.length) || ![-1, 0, 1].includes(off)) return null;
  const S = pat.stops.length;
  const trip = pat.trips[row];
  const stops = [];
  for (let i = 0; i < S; i++) {
    const s = pat.stops[i];
    stops.push({ ...stopInfo(m, s), arr: pat.arr[row * S + i] + off * DAY, dep: pat.dep[row * S + i] + off * DAY });
  }
  return { trip: ref, ...routeInfo(m, pat.route), headsign: m.trips.headsign[trip], stops, shape: shapeSlice(m, trip, stops) };
}

module.exports = { plan, departures, tripDetail };
