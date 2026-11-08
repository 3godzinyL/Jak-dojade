'use strict';
// Zakładka Rozkłady: lista linii i przebieg linii w kierunkach (główny wariant każdego kierunku).

const MODE_ORDER = { tram: 0, metro: 1, rail: 2, trolley: 3, bus: 4, ferry: 5, other: 6 };
const lineSort = (a, b) => (MODE_ORDER[a.mode] - MODE_ORDER[b.mode]) ||
  ((parseInt(a.line, 10) || 1e9) - (parseInt(b.line, 10) || 1e9)) || a.line.localeCompare(b.line, 'pl');

function lines(m) {
  const used = new Set(m.patterns.map((p) => p.route));
  const out = [];
  for (const ri of used) {
    const r = m.routes[ri];
    out.push({ route: ri, line: r.short || r.long, long: r.long !== r.short ? r.long : '', mode: r.mode, color: r.color, textColor: r.textColor, op: r.op || '' });
  }
  // ta sama nazwa linii kilka razy u jednego przewoźnika — zostaw jedną pozycję
  // (Gdańsk i Gdynia mają linie o tych samych numerach — to różne linie, obie zostają)
  const seen = new Set();
  return out.sort(lineSort).filter((l) => { const k = l.op + '|' + l.mode + '|' + l.line; if (seen.has(k)) return false; seen.add(k); return true; });
}

function line(m, routeIdx) {
  const r = m.routes[routeIdx];
  if (!r) return null;
  const sameName = new Set(m.routes.map((x, i) => (x.short === r.short && x.mode === r.mode ? i : -1)).filter((i) => i >= 0));
  const byHead = new Map();
  m.patterns.forEach((p) => {
    if (!sameName.has(p.route)) return;
    const head = m.trips.headsign[p.trips[0]];
    const cur = byHead.get(head);
    const score = p.trips.length * 1000 + p.stops.length;
    if (!cur || score > cur.score) byHead.set(head, { p, score, trips: (cur ? cur.trips : 0) + p.trips.length });
    else cur.trips += p.trips.length;
  });
  const directions = [...byHead.entries()]
    .sort((a, b) => b[1].trips - a[1].trips)
    .slice(0, 6)
    .map(([headsign, { p, trips }]) => ({
      headsign,
      trips,
      stops: Array.from(p.stops, (s) => ({
        name: m.stops.name[s], platform: m.stops.platform[s] || '', lat: +m.stops.lat[s].toFixed(6), lon: +m.stops.lon[s].toFixed(6), group: m.stopGroup[s],
      })),
    }));
  return { route: routeIdx, line: r.short || r.long, long: r.long !== r.short ? r.long : '', mode: r.mode, color: r.color, textColor: r.textColor, agency: r.agency, directions };
}

module.exports = { lines, line };
