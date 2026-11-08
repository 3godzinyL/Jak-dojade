'use strict';
// Wyszukiwarka: przystanki lokalnie z GTFS, adresy i miejsca przez Photon (OpenStreetMap).
const { norm } = require('./gtfs/load');
const { dist } = require('./geo');

function groupItem(g, extra = {}) {
  return {
    type: 'stop', group: g.id, name: g.name, lat: +g.lat.toFixed(6), lon: +g.lon.toFixed(6),
    modes: g.modes, lines: g.lines.slice(0, 14), moreLines: Math.max(0, g.lines.length - 14), dup: g.dup || 0, ...extra,
  };
}

function searchStops(m, q, limit = 8) {
  const nq = norm(q).trim();
  if (!nq) return [];
  const tokens = nq.split(/[^a-z0-9]+/).filter(Boolean);
  const scored = [];
  for (const g of m.groups) {
    let score = 0;
    if (g.norm === nq) score = 100;
    else if (g.norm.startsWith(nq)) score = 80;
    else if (tokens.length && tokens.every((t) => g.words.some((w) => w.startsWith(t)))) score = 60 + (g.words[0].startsWith(tokens[0]) ? 5 : 0);
    else if (g.norm.includes(nq)) score = 30;
    if (score) scored.push([score + Math.min(10, g.lines.length) * 0.3, g]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name, 'pl'));
  return scored.slice(0, limit).map(([, g]) => groupItem(g));
}

function stopsInBbox(m, minLat, minLon, maxLat, maxLon, limit = 400) {
  const out = [];
  for (const g of m.groups) {
    if (g.lat >= minLat && g.lat <= maxLat && g.lon >= minLon && g.lon <= maxLon) {
      out.push(groupItem(g));
      if (out.length >= limit) break;
    }
  }
  return out;
}

function nearbyStops(m, lat, lon, radius = 700, limit = 12) {
  const seen = new Map();
  for (const [s, d] of m.grid.near(lat, lon, radius)) {
    const gi = m.stopGroup[s];
    if (gi < 0 || seen.has(gi)) continue;
    seen.set(gi, d);
  }
  return [...seen].slice(0, limit).map(([gi]) => {
    const g = m.groups[gi];
    return groupItem(g, { distance: Math.round(dist(lat, lon, g.lat, g.lon)) });
  });
}

// --- Photon (komoot) — darmowy geokoder OSM; zapytania buforowane, bez spamowania usługi
const PHOTON = 'https://photon.komoot.io';
const UA = 'trasa-planer/0.1 (lokalny serwer deweloperski)';
const cache = new Map();

async function cachedJson(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < 6 * 3600 * 1000) return hit.v;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error('Photon HTTP ' + res.status);
    const v = await res.json();
    if (cache.size > 2000) cache.clear();
    cache.set(url, { t: Date.now(), v });
    return v;
  } finally {
    clearTimeout(timer);
  }
}

function featureItem(f) {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  let name = p.name || street || p.city || '';
  if (!p.name && p.housenumber && p.street) name = street;
  const sub = [p.name && street && street !== name ? street : '', p.district || p.locality || '', p.city && p.city !== name ? p.city : '']
    .filter(Boolean).join(', ');
  return { type: 'place', name, sub, lat: +lat.toFixed(6), lon: +lon.toFixed(6), kind: p.osm_value || p.type || '' };
}

async function geocode(m, q, limit = 7) {
  const [minLat, minLon, maxLat, maxLon] = m.bbox;
  const pad = 0.08;
  const c = m.city.center;
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&limit=${limit + 3}&lat=${c[0]}&lon=${c[1]}` +
    `&bbox=${(minLon - pad).toFixed(3)},${(minLat - pad).toFixed(3)},${(maxLon + pad).toFixed(3)},${(maxLat + pad).toFixed(3)}`;
  const json = await cachedJson(url);
  const seen = new Set();
  const out = [];
  for (const f of json.features || []) {
    const p = f.properties || {};
    if (p.osm_key === 'highway' && p.osm_value === 'bus_stop') continue; // przystanki mamy z rozkładu
    if (p.osm_key === 'public_transport' || p.osm_value === 'tram_stop') continue;
    const it = featureItem(f);
    const k = it.name + '|' + it.sub;
    if (!it.name || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

async function reverse(lat, lon) {
  const json = await cachedJson(`${PHOTON}/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&limit=1`);
  const f = (json.features || [])[0];
  if (!f) return null;
  const it = featureItem(f);
  return { ...it, lat, lon };
}

module.exports = { searchStops, stopsInBbox, nearbyStops, geocode, reverse };
