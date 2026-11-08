'use strict';
// Wczytuje paczki GTFS miasta i buduje model pod RAPTOR:
// wzorce kursów (ta sama linia + ta sama sekwencja przystanków), przesiadki piesze, kalendarz kursowania.
const fs = require('fs');
const path = require('path');
const { eachRow, parseTime } = require('./csv');
const { Grid, dist } = require('../geo');

const FOOTPATH_RADIUS = 450; // m w linii prostej między przystankami do przesiadki pieszej
const GROUP_RADIUS = 700; // m — przystanki o tej samej nazwie bliżej siebie to jeden „zespół”

function modeOf(type) {
  const t = +type;
  if (t === 0 || (t >= 900 && t < 1000)) return 'tram';
  if (t === 1 || (t >= 400 && t < 500)) return 'metro';
  if (t === 2 || (t >= 100 && t < 200)) return 'rail';
  if (t === 11 || t === 800) return 'trolley';
  if (t === 4 || (t >= 1000 && t < 1100) || t === 1200) return 'ferry';
  if (t === 3 || (t >= 700 && t < 800) || (t >= 200 && t < 300)) return 'bus';
  return 'other';
}

function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l');
}

class GrowInt32 {
  constructor(n = 1 << 16) { this.a = new Int32Array(n); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  }
}

function dateInt(y, m, d) { return y * 10000 + m * 100 + d; }
function addDays(di, n) {
  const dt = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100 + n));
  return dateInt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function weekdayMon0(di) {
  const dt = new Date(Date.UTC(Math.floor(di / 10000), Math.floor(di / 100) % 100 - 1, di % 100));
  return (dt.getUTCDay() + 6) % 7;
}

async function loadCity(city, dataDir, log = () => {}) {
  const t0 = Date.now();
  const S = { id: [], name: [], code: [], platform: [], lat: [], lon: [], feed: [] };
  const stopIndex = new Map();
  const routes = [];
  const routeIndex = new Map();
  const services = [];
  const serviceIndex = new Map();
  const T = { route: [], service: [], headsign: [], shape: [], gtfsId: [] };
  const tripIndex = new Map();
  const shapes = new Map();
  const feeds = [];
  const st = { trip: new GrowInt32(1 << 20), seq: new GrowInt32(1 << 20), stop: new GrowInt32(1 << 20),
    arr: new GrowInt32(1 << 20), dep: new GrowInt32(1 << 20), flag: new GrowInt32(1 << 20) };

  for (const feed of city.feeds) {
    const dir = path.join(dataDir, city.id, feed.id);
    if (!fs.existsSync(path.join(dir, 'stops.txt'))) {
      if (feed.optional) { log(`${city.id}/${feed.id}: brak danych — ładuję miasto bez tej paczki`); continue; }
      throw new Error(`Brak danych ${city.id}/${feed.id} — uruchom pobieranie`);
    }
    const pre = feed.id + ':';
    const agency = new Map();
    const info = { id: feed.id, name: feed.name, version: '', start: 0, end: 0 };

    await eachRow(path.join(dir, 'feed_info.txt'), (r, c) => {
      info.version = r[c.get('feed_version')] || '';
    });
    await eachRow(path.join(dir, 'agency.txt'), (r, c) => {
      agency.set(r[c.get('agency_id')] || '', (r[c.get('agency_name')] || '').trim());
    });
    await eachRow(path.join(dir, 'stops.txt'), (r, c) => {
      const lt = r[c.get('location_type')];
      if (lt && lt !== '0') return;
      const id = pre + r[c.stop_id];
      const lat = +r[c.stop_lat];
      const lon = +r[c.stop_lon];
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) return;
      stopIndex.set(id, S.id.length);
      S.id.push(id);
      let name = (r[c.stop_name] || '').trim();
      const desc = (r[c.get('stop_desc')] || '').trim();
      let platform = (r[c.get('platform_code')] || '').trim() || (desc.length <= 3 ? desc : '');
      // ZTM Gdańsk dokleja numer słupka do nazwy („Dworzec Główny 07”) — rozdziel na nazwę i stanowisko
      const suf = /^(.*\S)\s+([01]\d)$/.exec(name);
      if (suf && !platform) { name = suf[1]; platform = suf[2]; }
      S.name.push(name);
      S.code.push(r[c.get('stop_code')] || '');
      S.platform.push(platform);
      S.lat.push(lat);
      S.lon.push(lon);
      S.feed.push(feed.id);
    });
    await eachRow(path.join(dir, 'routes.txt'), (r, c) => {
      const id = pre + r[c.route_id];
      routeIndex.set(id, routes.length);
      let color = (r[c.get('route_color')] || '').trim();
      let text = (r[c.get('route_text_color')] || '').trim();
      // biały kolor linii to zwykle zaślepka przewoźnika (np. autobusy Kraków) — niewidoczny na białej karcie
      if (/^[0-9a-f]{6}$/i.test(color)) {
        const v = parseInt(color, 16);
        const lum = (0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
        // czyste FF0000 / 0000FF / 00FF00 to też zaślepki (ZTM Gdańsk) — jaskrawe, gorzej czytelne
        if (lum > 0.88 || /^(ff0000|0000ff|00ff00)$/i.test(color)) { color = ''; text = ''; }
      }
      routes.push({
        id,
        short: (r[c.get('route_short_name')] || '').trim(),
        long: (r[c.get('route_long_name')] || '').trim(),
        type: +r[c.route_type],
        mode: modeOf(r[c.route_type]),
        color: /^[0-9a-f]{6}$/i.test(color) ? '#' + color : null,
        textColor: /^[0-9a-f]{6}$/i.test(text) ? '#' + text : null,
        agency: agency.get(r[c.get('agency_id')] || '') || agency.values().next().value || '',
        op: feed.name, // przewoźnik do nagłówków w Rozkładach („ZTM Gdańsk”, „PKP SKM”)
      });
    });
    const svc = (sid) => {
      const key = pre + sid;
      let i = serviceIndex.get(key);
      if (i === undefined) {
        i = services.length;
        serviceIndex.set(key, i);
        services.push({ days: new Uint8Array(7), start: 0, end: 0, add: new Set(), rem: new Set() });
      }
      return services[i];
    };
    const span = (d) => {
      if (!d) return;
      if (!info.start || d < info.start) info.start = d;
      if (!info.end || d > info.end) info.end = d;
    };
    await eachRow(path.join(dir, 'calendar.txt'), (r, c) => {
      const s = svc(r[c.service_id]);
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].forEach((d, i) => { s.days[i] = r[c[d]] === '1' ? 1 : 0; });
      s.start = +r[c.start_date];
      s.end = +r[c.end_date];
      if (s.days.some((x) => x)) { span(s.start); span(s.end); }
    });
    await eachRow(path.join(dir, 'calendar_dates.txt'), (r, c) => {
      const s = svc(r[c.service_id]);
      const d = +r[c.date];
      if (r[c.exception_type] === '1') { s.add.add(d); span(d); } else s.rem.add(d);
    });
    await eachRow(path.join(dir, 'trips.txt'), (r, c) => {
      const ri = routeIndex.get(pre + r[c.route_id]);
      if (ri === undefined) return;
      const id = pre + r[c.trip_id];
      tripIndex.set(id, T.route.length);
      T.route.push(ri);
      svc(r[c.service_id]);
      T.service.push(serviceIndex.get(pre + r[c.service_id]));
      T.headsign.push((r[c.get('trip_headsign')] || '').trim());
      const sh = r[c.get('shape_id')];
      T.shape.push(sh ? pre + sh : null);
      T.gtfsId.push(id);
    });

    log(`${city.id}/${feed.id}: stop_times…`);
    await eachRow(path.join(dir, 'stop_times.txt'), (r, c) => {
      const ti = tripIndex.get(pre + r[c.trip_id]);
      if (ti === undefined) return;
      const si = stopIndex.get(pre + r[c.stop_id]);
      if (si === undefined) return;
      let a = parseTime(r[c.arrival_time]);
      let d = parseTime(r[c.departure_time]);
      if (a < 0) a = d;
      if (d < 0) d = a;
      st.trip.push(ti);
      st.seq.push(+r[c.stop_sequence]);
      st.stop.push(si);
      st.arr.push(a);
      st.dep.push(d);
      const pu = r[c.get('pickup_type')];
      const dr = r[c.get('drop_off_type')];
      st.flag.push((pu === '1' ? 1 : 0) | (dr === '1' ? 2 : 0));
    });

    await eachRow(path.join(dir, 'shapes.txt'), (r, c) => {
      const id = pre + r[c.shape_id];
      let s = shapes.get(id);
      if (!s) shapes.set(id, (s = { seq: [], pts: [] }));
      s.seq.push(+r[c.shape_pt_sequence]);
      s.pts.push(+r[c.shape_pt_lat], +r[c.shape_pt_lon]);
    });
    feeds.push(info);
  }

  // Kształty tras: posortuj po sekwencji, spakuj do Float64Array [lat, lon, lat, lon, ...]
  const shapeArr = new Map();
  for (const [id, s] of shapes) {
    let sorted = true;
    for (let i = 1; i < s.seq.length; i++) if (s.seq[i] < s.seq[i - 1]) { sorted = false; break; }
    const out = new Float64Array(s.pts.length);
    if (sorted) out.set(s.pts);
    else {
      const ord = s.seq.map((v, i) => i).sort((a, b) => s.seq[a] - s.seq[b]);
      ord.forEach((o, i) => { out[i * 2] = s.pts[o * 2]; out[i * 2 + 1] = s.pts[o * 2 + 1]; });
    }
    shapeArr.set(id, out);
  }
  shapes.clear();

  log(`${city.id}: wzorce kursów…`);
  const nStops = S.id.length;
  const nTrips = T.route.length;
  const N = st.trip.n;
  const sTrip = st.trip.a, sSeq = st.seq.a, sStop = st.stop.a, sArr = st.arr.a, sDep = st.dep.a, sFlag = st.flag.a;

  // Grupowanie stop_times po kursie (sortowanie kubełkowe, w kubełku po stop_sequence)
  const cnt = new Int32Array(nTrips + 1);
  for (let i = 0; i < N; i++) cnt[sTrip[i] + 1]++;
  for (let i = 0; i < nTrips; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(0, nTrips);
  const ord = new Int32Array(N);
  for (let i = 0; i < N; i++) ord[fill[sTrip[i]]++] = i;
  for (let t = 0; t < nTrips; t++) {
    const a = cnt[t], b = cnt[t + 1];
    let sorted = true;
    for (let i = a + 1; i < b; i++) if (sSeq[ord[i]] < sSeq[ord[i - 1]]) { sorted = false; break; }
    if (!sorted) {
      const part = Array.from(ord.subarray(a, b)).sort((x, y) => sSeq[x] - sSeq[y]);
      ord.set(part, a);
    }
  }

  // Wzorce: linia + sekwencja (przystanek, wsiadanie, wysiadanie)
  const patMap = new Map();
  for (let t = 0; t < nTrips; t++) {
    const a = cnt[t], b = cnt[t + 1];
    if (b - a < 2) continue;
    let key = T.route[t] + '|';
    for (let i = a; i < b; i++) key += sStop[ord[i]] + '.' + sFlag[ord[i]] + ',';
    let p = patMap.get(key);
    if (!p) patMap.set(key, (p = { route: T.route[t], a, len: b - a, trips: [] }));
    p.trips.push(t);
  }

  const patterns = [];
  const tripPattern = new Int32Array(nTrips).fill(-1);
  const tripRow = new Int32Array(nTrips);
  for (const p of patMap.values()) {
    const L = p.len;
    const first = (t) => sDep[ord[cnt[t]]];
    const lastArr = (t) => sArr[ord[cnt[t + 1] - 1]];
    p.trips.sort((x, y) => first(x) - first(y) || lastArr(x) - lastArr(y));
    // Podział na podwzorce bez wyprzedzania (FIFO) — wtedy w kolumnie przystanku można szukać binarnie
    const subs = [];
    for (const t of p.trips) {
      let placed = false;
      for (const sub of subs) {
        const last = sub[sub.length - 1];
        let ok = true;
        for (let i = 0; i < L; i++) {
          const x = ord[cnt[t] + i], y = ord[cnt[last] + i];
          if (sDep[x] < sDep[y] || sArr[x] < sArr[y]) { ok = false; break; }
        }
        if (ok) { sub.push(t); placed = true; break; }
      }
      if (!placed) subs.push([t]);
    }
    for (const sub of subs) {
      const stops = new Int32Array(L);
      const pick = new Uint8Array(L);
      const drop = new Uint8Array(L);
      for (let i = 0; i < L; i++) {
        const x = ord[cnt[sub[0]] + i];
        stops[i] = sStop[x];
        pick[i] = (sFlag[x] & 1) || i === L - 1 ? 0 : 1;
        drop[i] = (sFlag[x] & 2) || i === 0 ? 0 : 1;
      }
      const arr = new Int32Array(sub.length * L);
      const dep = new Int32Array(sub.length * L);
      sub.forEach((t, row) => {
        for (let i = 0; i < L; i++) {
          const x = ord[cnt[t] + i];
          arr[row * L + i] = sArr[x];
          dep[row * L + i] = sDep[x];
        }
        tripPattern[t] = patterns.length;
        tripRow[t] = row;
      });
      patterns.push({ route: p.route, stops, pick, drop, trips: Int32Array.from(sub), arr, dep });
    }
  }
  patMap.clear();

  // Przystanek → (wzorzec, pozycja)
  const spCnt = new Int32Array(nStops + 1);
  for (const p of patterns) for (const s of p.stops) spCnt[s + 1]++;
  for (let i = 0; i < nStops; i++) spCnt[i + 1] += spCnt[i];
  const spFill = spCnt.slice(0, nStops);
  const spPat = new Int32Array(spCnt[nStops]);
  const spPos = new Int32Array(spCnt[nStops]);
  patterns.forEach((p, pi) => p.stops.forEach((s, i) => { const k = spFill[s]++; spPat[k] = pi; spPos[k] = i; }));

  // Przesiadki piesze
  const lat = Float64Array.from(S.lat);
  const lon = Float64Array.from(S.lon);
  const grid = new Grid(lat, lon);
  const fpStart = new Int32Array(nStops + 1);
  const fpTo = [];
  const fpDist = [];
  for (let s = 0; s < nStops; s++) {
    fpStart[s] = fpTo.length;
    if (spCnt[s + 1] === spCnt[s]) continue; // przystanek bez kursów
    for (const [o, d] of grid.near(lat[s], lon[s], FOOTPATH_RADIUS)) {
      if (o === s || spCnt[o + 1] === spCnt[o]) continue;
      fpTo.push(o);
      fpDist.push(Math.round(d));
    }
  }
  fpStart[nStops] = fpTo.length;

  // Zespoły przystankowe (do wyszukiwarki i tablic odjazdów)
  const groups = [];
  const stopGroup = new Int32Array(nStops).fill(-1);
  const byName = new Map();
  for (let s = 0; s < nStops; s++) {
    if (spCnt[s + 1] === spCnt[s]) continue;
    const k = norm(S.name[s]);
    let list = byName.get(k);
    if (!list) byName.set(k, (list = []));
    let g = list.find((g) => dist(g.lat, g.lon, lat[s], lon[s]) < GROUP_RADIUS);
    if (!g) {
      g = { id: groups.length, name: S.name[s], norm: k, stops: [], lat: lat[s], lon: lon[s], modes: new Set(), lines: new Set() };
      groups.push(g);
      list.push(g);
    }
    g.stops.push(s);
    g.lat += (lat[s] - g.lat) / g.stops.length;
    g.lon += (lon[s] - g.lon) / g.stops.length;
    stopGroup[s] = g.id;
    for (let k2 = spCnt[s]; k2 < spCnt[s + 1]; k2++) {
      const r = routes[patterns[spPat[k2]].route];
      g.modes.add(r.mode);
      if (r.short) g.lines.add(r.short);
    }
  }
  const lineSort = (a, b) => (parseInt(a, 10) || 1e9) - (parseInt(b, 10) || 1e9) || a.localeCompare(b);
  for (const g of groups) {
    g.modes = [...g.modes];
    g.lines = [...g.lines].sort(lineSort);
    g.words = g.norm.split(/[^a-z0-9]+/).filter(Boolean);
  }
  // Te same nazwy w różnych miejscach — dopisz rozróżnienie
  for (const list of byName.values()) if (list.length > 1) list.forEach((g, i) => { g.dup = i + 1; });

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (let s = 0; s < nStops; s++) {
    if (spCnt[s + 1] === spCnt[s]) continue;
    if (lat[s] < minLat) minLat = lat[s];
    if (lat[s] > maxLat) maxLat = lat[s];
    if (lon[s] < minLon) minLon = lon[s];
    if (lon[s] > maxLon) maxLon = lon[s];
  }

  // Nagłówek kursu: z GTFS albo nazwa ostatniego przystanku
  const headsign = T.headsign.map((h, t) => {
    if (h) return h;
    const p = patterns[tripPattern[t]];
    return p ? S.name[p.stops[p.stops.length - 1]] : '';
  });

  const model = {
    city: { id: city.id, name: city.name, center: city.center },
    feeds,
    stops: { id: S.id, name: S.name, code: S.code, platform: S.platform, lat, lon, feed: S.feed },
    nStops,
    stopIndex,
    routes,
    trips: { route: Int32Array.from(T.route), service: Int32Array.from(T.service), headsign, shape: T.shape, gtfsId: T.gtfsId },
    tripPattern,
    tripRow,
    patterns,
    sp: { start: spCnt, pat: spPat, pos: spPos },
    fp: { start: fpStart, to: Int32Array.from(fpTo), dist: Int32Array.from(fpDist) },
    grid,
    groups,
    groupsByNorm: byName,
    stopGroup,
    shapes: shapeArr,
    services,
    bbox: [minLat, minLon, maxLat, maxLon],
    activeCache: new Map(),
    stats: {
      stops: nStops, routes: routes.length, trips: nTrips, stopTimes: N, patterns: patterns.length,
      footpaths: fpTo.length, groups: groups.length, shapes: shapeArr.size, loadMs: Date.now() - t0,
    },
  };
  return model;
}

/** Usługi kursujące danego dnia (YYYYMMDD) — Uint8Array po indeksie usługi. */
function activeServices(model, di) {
  let a = model.activeCache.get(di);
  if (a) return a;
  const wd = weekdayMon0(di);
  a = new Uint8Array(model.services.length);
  model.services.forEach((s, i) => {
    if (s.rem.has(di)) return;
    if (s.add.has(di) || (s.start && di >= s.start && di <= s.end && s.days[wd])) a[i] = 1;
  });
  if (model.activeCache.size > 30) model.activeCache.clear();
  model.activeCache.set(di, a);
  return a;
}

module.exports = { loadCity, activeServices, addDays, dateInt, norm, modeOf };
