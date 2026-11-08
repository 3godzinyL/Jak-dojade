'use strict';

const R = 6371008.8;
const RAD = Math.PI / 180;

function dist(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Ulice nie biegną w linii prostej — współczynnik objazdu zamienia odległość w linii prostej na dystans pieszy.
const DETOUR = 1.2;
const WALK_SPEEDS = { slow: 0.95, normal: 1.25, fast: 1.6 }; // m/s

function walkMeters(d) { return Math.round(d * DETOUR); }
function walkSeconds(d, speed = WALK_SPEEDS.normal) { return Math.round((d * DETOUR) / speed); }

/** Siatka do szybkiego wyszukiwania punktów w promieniu. */
class Grid {
  constructor(lats, lons, cellM = 400) {
    this.lats = lats;
    this.lons = lons;
    let sum = 0;
    for (let i = 0; i < lats.length; i++) sum += lats[i];
    const lat0 = lats.length ? sum / lats.length : 52;
    this.dLat = cellM / 111320;
    this.dLon = cellM / (111320 * Math.cos(lat0 * RAD));
    this.cells = new Map();
    for (let i = 0; i < lats.length; i++) {
      const k = this.key(Math.floor(lats[i] / this.dLat), Math.floor(lons[i] / this.dLon));
      let arr = this.cells.get(k);
      if (!arr) this.cells.set(k, (arr = []));
      arr.push(i);
    }
  }

  key(a, b) { return a * 100000 + b; }

  /** Zwraca [[indeks, odległość_m], ...] posortowane rosnąco po odległości. */
  near(lat, lon, radiusM) {
    const ra = Math.ceil(radiusM / (this.dLat * 111320));
    const ca = Math.floor(lat / this.dLat);
    const cb = Math.floor(lon / this.dLon);
    const out = [];
    for (let a = ca - ra; a <= ca + ra; a++) {
      for (let b = cb - ra - 1; b <= cb + ra + 1; b++) {
        const arr = this.cells.get(this.key(a, b));
        if (!arr) continue;
        for (const i of arr) {
          const d = dist(lat, lon, this.lats[i], this.lons[i]);
          if (d <= radiusM) out.push([i, d]);
        }
      }
    }
    out.sort((x, y) => x[1] - y[1]);
    return out;
  }
}

module.exports = { dist, walkMeters, walkSeconds, WALK_SPEEDS, DETOUR, Grid };
