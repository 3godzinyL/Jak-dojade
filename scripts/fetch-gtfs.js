'use strict';
// Pobiera rozkłady GTFS: node scripts/fetch-gtfs.js [miasto ...]   (bez argumentów: miasta z autoload)
const path = require('path');
const { CITIES } = require('../src/cities');
const { downloadCity } = require('../src/gtfs/fetch');

const DATA = path.join(__dirname, '..', 'data', 'gtfs');

(async () => {
  const ids = process.argv.slice(2);
  const list = ids.length ? CITIES.filter((c) => ids.includes(c.id)) : CITIES.filter((c) => c.autoload);
  if (!list.length) {
    console.error('Nieznane miasto. Dostępne: ' + CITIES.map((c) => c.id).join(', '));
    process.exit(1);
  }
  for (const c of list) await downloadCity(c, DATA, console.log);
})().catch((e) => { console.error(e); process.exit(1); });
