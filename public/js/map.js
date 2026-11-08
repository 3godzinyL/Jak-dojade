// Mapa (Leaflet + podkład CARTO/OSM): trasa podróży, przystanki, moja pozycja.
import { lineColors, esc } from './util.js';

const L = window.L;

export function createMap(el, center) {
  const map = L.map(el, { zoomControl: false, center, zoom: 13, minZoom: 9, maxZoom: 19, tapTolerance: 20 });
  // OSM ma tylko jasny podkład — w ciemnym motywie odwracamy kolory filtrem CSS (--map-filter)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const routeLayer = L.layerGroup().addTo(map);
  const stopsLayer = L.layerGroup().addTo(map);
  let meMarker = null;
  let stopsCb = null;
  let stopsOn = false;
  let stopsReq = 0;

  const divIcon = (cls, size = 18, html = '') => L.divIcon({ className: '', html: `<div class="${cls}">${html}</div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

  async function refreshStops() {
    if (!stopsOn || !stopsCb) return;
    if (map.getZoom() < 15) { stopsLayer.clearLayers(); return; }
    const b = map.getBounds().pad(0.2);
    const id = ++stopsReq;
    let list;
    try { list = await stopsCb.fetchFn([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]); } catch { return; }
    if (id !== stopsReq || !stopsOn) return;
    stopsLayer.clearLayers();
    for (const s of list) {
      const tram = s.modes.includes('tram') && !s.modes.includes('bus');
      L.marker([s.lat, s.lon], { icon: divIcon('mk-stop' + (tram ? ' tram' : ''), 14) })
        .on('click', () => stopsCb.onClick(s))
        .addTo(stopsLayer);
    }
  }
  map.on('moveend', refreshStops);

  function fit(bounds, { top = 70, bottom = 0, left = 28, right = 28 } = {}) {
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom + 24], maxZoom: 17 });
  }

  // kolor odcinka wg kolejności przejazdu — ta sama paleta CSS co oś czasu (--leg-1…8)
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function drawLegs(legs) {
    routeLayer.clearLayers();
    const bounds = L.latLngBounds([]);
    let ride = 0;
    for (const leg of legs) {
      const pts = leg.shape && leg.shape.length > 1 ? leg.shape : [[leg.from.lat, leg.from.lon], [leg.to.lat, leg.to.lon]];
      pts.forEach((p) => bounds.extend(p));
      if (leg.type === 'walk') {
        L.polyline(pts, { color: '#6e6e6e', weight: 5, opacity: 0.9, dashArray: '1 9', lineCap: 'round' }).addTo(routeLayer);
      } else {
        const c = { bg: cssVar(`--leg-${(ride++ % 8) + 1}`) || lineColors(leg).bg };
        L.polyline(pts, { color: '#fff', weight: 9, opacity: 0.95 }).addTo(routeLayer);
        L.polyline(pts, { color: c.bg, weight: 6, opacity: 1 }).addTo(routeLayer);
        for (const s of (leg.stops || []).slice(1, -1)) {
          L.circleMarker([s.lat, s.lon], { radius: 3.5, color: c.bg, weight: 2, fillColor: '#fff', fillOpacity: 1 }).bindTooltip(esc(s.name)).addTo(routeLayer);
        }
      }
    }
    return bounds;
  }

  return {
    leaflet: map,

    showJourney(j, pad) {
      const bounds = drawLegs(j.legs);
      const first = j.legs[0], last = j.legs[j.legs.length - 1];
      L.marker([first.from.lat, first.from.lon], { icon: divIcon('mk-end', 20), zIndexOffset: 1000 }).addTo(routeLayer);
      L.marker([last.to.lat, last.to.lon], { icon: divIcon('mk-end to', 20), zIndexOffset: 1000 }).addTo(routeLayer);
      j.legs.forEach((leg) => {
        if (leg.type !== 'ride') return;
        for (const s of [leg.from, leg.to]) {
          L.marker([s.lat, s.lon], { icon: divIcon('mk-xfer', 14), zIndexOffset: 500 }).bindTooltip(esc(s.name)).addTo(routeLayer);
        }
      });
      fit(bounds, pad);
    },

    showWalk(w, pad) {
      const bounds = drawLegs([w]);
      L.marker([w.from.lat, w.from.lon], { icon: divIcon('mk-end', 20) }).addTo(routeLayer);
      L.marker([w.to.lat, w.to.lon], { icon: divIcon('mk-end to', 20) }).addTo(routeLayer);
      fit(bounds, pad);
    },

    /** dots=false: sama linia z pierścieniami na końcach (ekran linii jak w oryginale) */
    showTrip(t, focusIdx, pad, { dots = true } = {}) {
      routeLayer.clearLayers();
      const leg = { type: 'ride', mode: t.mode, color: t.color, textColor: t.textColor };
      const c = lineColors(leg);
      const pts = t.shape && t.shape.length > 1 ? t.shape : t.stops.map((s) => [s.lat, s.lon]);
      L.polyline(pts, { color: '#fff', weight: 9 }).addTo(routeLayer);
      L.polyline(pts, { color: c.bg, weight: 6 }).addTo(routeLayer);
      t.stops.forEach((s, i) => {
        const end = i === 0 || i === t.stops.length - 1;
        if (!dots && !end && i !== focusIdx) return;
        L.circleMarker([s.lat, s.lon], { radius: i === focusIdx || (!dots && end) ? 6 : 4, color: c.bg, weight: i === focusIdx || (!dots && end) ? 3 : 2, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(esc(s.name)).addTo(routeLayer);
      });
      fit(L.latLngBounds(pts), pad);
    },

    clearRoute() { routeLayer.clearLayers(); },

    setMe(pos) {
      if (!pos) { if (meMarker) { meMarker.remove(); meMarker = null; } return; }
      if (!meMarker) meMarker = L.marker([pos.lat, pos.lon], { icon: divIcon('mk-me', 18), zIndexOffset: 2000, interactive: false }).addTo(map);
      else meMarker.setLatLng([pos.lat, pos.lon]);
    },

    /** Przystanki na mapie od zoomu 15 (cb: async bbox → lista, onClick: przystanek) */
    enableStops(fetchFn, onClick) {
      stopsCb = { fetchFn, onClick };
      stopsOn = true;
      refreshStops();
    },
    disableStops() { stopsOn = false; stopsLayer.clearLayers(); },

    flyTo(lat, lon, zoom = 16) { map.setView([lat, lon], zoom, { animate: true }); },
    center() { const c = map.getCenter(); return { lat: c.lat, lon: c.lng }; },
    invalidate() { map.invalidateSize(); },
  };
}
