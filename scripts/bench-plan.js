'use strict';
// Szybki test silnika bez serwera: node scripts/bench-plan.js [miasto] [z] [do]
const path = require('path');
const { CITIES } = require('../src/cities');
const { loadCity } = require('../src/gtfs/load');
const { plan, departures } = require('../src/router/plan');
const { searchStops } = require('../src/search');

const hm = (s) => {
  const d = ((s % 86400) + 86400) % 86400;
  return String(Math.floor(d / 3600)).padStart(2, '0') + ':' + String(Math.floor((d % 3600) / 60)).padStart(2, '0');
};

(async () => {
  const cityId = process.argv[2] || 'krakow';
  const city = CITIES.find((c) => c.id === cityId);
  const m = await loadCity(city, path.join(__dirname, '..', 'data', 'gtfs'), console.log);
  console.log('model', m.stats, 'feeds', m.feeds.map((f) => `${f.id} ${f.version} ${f.start}-${f.end}`).join('; '));
  const qa = process.argv[3] || 'Dworzec Główny';
  const qb = process.argv[4] || 'Plac Centralny';
  const a = searchStops(m, qa)[0];
  const b = searchStops(m, qb)[0];
  console.log('z:', a && a.name, a && a.lines.join(','), '| do:', b && b.name, b && b.lines.join(','));
  const now = new Date();
  const date = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  for (const [label, from, to] of [
    ['zespół→zespół', { group: a.group }, { group: b.group }],
    ['punkt→punkt', { lat: 50.0647, lon: 19.945 }, { lat: 50.0838, lon: 20.0322 }],
  ]) {
    for (const time of [8 * 3600, 23.5 * 3600]) {
      const r = plan(m, { from, to, date, time, count: 5 });
      console.log(`\n${label} @ ${hm(time)} — ${r.journeys.length} wariantów, ${r.stats.ms} ms, ${r.stats.runs} przebiegów, dojście ${r.stats.access} / ${r.stats.egress}`);
      for (const j of r.journeys) {
        const desc = j.legs.map((l) => (l.type === 'walk' ? `pieszo ${Math.round(l.sec / 60)}m` : `${l.line}(${hm(l.dep)} ${l.from.name}→${l.to.name} ${hm(l.arr)})`)).join(' > ');
        console.log(`  ${hm(j.leave)}–${hm(j.arrive)} ${Math.round(j.duration / 60)} min, przes. ${j.transfers}: ${desc}`);
      }
    }
  }
  const d = departures(m, a.group, date, 8 * 3600, { limit: 8 });
  console.log('\nodjazdy', d.group.name, d.departures.map((x) => `${hm(x.t)} ${x.line}→${x.headsign}`).join(' | '));
  const rss = process.memoryUsage().rss / 1048576;
  console.log(`\nRSS ${rss.toFixed(0)} MB`);
})().catch((e) => { console.error(e); process.exit(1); });
