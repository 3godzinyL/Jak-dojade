'use strict';
// Silnik tras na małym, ręcznie zapisanym rozkładzie — wynik znany z góry.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadCity } = require('../src/gtfs/load');
const { plan, departures } = require('../src/router/plan');
const { searchStops } = require('../src/search');

// Linia 1 (tramwaj): A → B → C;  linia 2 (autobus): C → D; przystanek C2 ~100 m od C (przesiadka piesza); linia N: nocna po północy A → D
const FEED = {
  'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\nx,Test,http://x,Europe/Warsaw\n',
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,Alfa,50.0000,19.9000\nB,Beta,50.0000,19.9200\nC,Gamma,50.0000,19.9400\nC2,Gamma Bis,50.0009,19.9400\nD,Delta,50.0000,19.9800\n',
  'routes.txt': 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color\nR1,x,1,,0,FFFFFF\nR2,x,2,,3,\nRN,x,N1,,3,000000\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nWK,1,1,1,1,1,1,1,20260101,20271231\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign\nR1,WK,t1a,Gamma\nR1,WK,t1b,Gamma\nR2,WK,t2a,Delta\nR2,WK,t2b,Delta\nRN,WK,tn,Delta\n',
  'stop_times.txt': [
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence',
    't1a,08:00:00,08:00:00,A,1', 't1a,08:05:00,08:05:00,B,2', 't1a,08:10:00,08:10:00,C,3',
    't1b,08:20:00,08:20:00,A,1', 't1b,08:25:00,08:25:00,B,2', 't1b,08:30:00,08:30:00,C,3',
    't2a,08:15:00,08:15:00,C2,1', 't2a,08:25:00,08:25:00,D,2',
    't2b,08:35:00,08:35:00,C2,1', 't2b,08:45:00,08:45:00,D,2',
    'tn,24:30:00,24:30:00,A,1', 'tn,24:50:00,24:50:00,D,2',
  ].join('\n') + '\n',
};

let m;
test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trasa-test-'));
  fs.mkdirSync(path.join(dir, 'tst', 'X'), { recursive: true });
  for (const [f, body] of Object.entries(FEED)) fs.writeFileSync(path.join(dir, 'tst', 'X', f), body);
  m = await loadCity({ id: 'tst', name: 'Test', center: [50, 19.94], feeds: [{ id: 'X', name: 'test' }] }, dir);
});

const groupOf = (name) => searchStops(m, name)[0].group;

test('przesiadka piesza C → C2 i najwcześniejszy przyjazd', () => {
  const r = plan(m, { from: { group: groupOf('Alfa') }, to: { group: groupOf('Delta') }, date: 20261106, time: 7 * 3600 + 55 * 60 });
  const j = r.journeys[0];
  assert.ok(j, 'jest połączenie');
  assert.deepStrictEqual(j.legs.map((l) => (l.type === 'walk' ? 'walk' : l.line)), ['1', 'walk', '2']);
  assert.strictEqual(j.leave, 8 * 3600);
  assert.strictEqual(j.arrive, 8 * 3600 + 25 * 60);
  assert.strictEqual(j.transfers, 1);
});

test('kolejne warianty są późniejsze i nie zdominowane', () => {
  const r = plan(m, { from: { group: groupOf('Alfa') }, to: { group: groupOf('Delta') }, date: 20261106, time: 7 * 3600 + 55 * 60, count: 3 });
  const arr = r.journeys.map((j) => j.arrive);
  assert.ok(r.journeys.length >= 2);
  assert.deepStrictEqual(arr.slice(0, 2), [8 * 3600 + 25 * 60, 8 * 3600 + 45 * 60]);
});

test('przyjazd na: wybiera najpóźniejszy wyjazd zdążający na czas', () => {
  const r = plan(m, { from: { group: groupOf('Alfa') }, to: { group: groupOf('Delta') }, date: 20261106, time: 8 * 3600 + 50 * 60, arriveBy: true });
  const last = r.journeys[r.journeys.length - 1];
  assert.strictEqual(last.leave, 8 * 3600 + 20 * 60);
  assert.ok(r.journeys.every((j) => j.arrive <= 8 * 3600 + 50 * 60));
});

test('kurs nocny z czasem 24:30 znaleziony po północy następnego dnia', () => {
  // 00:20 dnia 07.11 → kurs „24:30” usługi z 06.11
  const r = plan(m, { from: { group: groupOf('Alfa') }, to: { group: groupOf('Delta') }, date: 20261107, time: 20 * 60 });
  const j = r.journeys[0];
  assert.strictEqual(j.legs[0].line, 'N1');
  assert.strictEqual(j.legs[0].dep, 30 * 60);
});

test('biały kolor linii traktowany jak brak koloru, czarny zostaje', () => {
  assert.strictEqual(m.routes.find((r) => r.short === '1').color, null);
  assert.strictEqual(m.routes.find((r) => r.short === 'N1').color, '#000000');
});

test('odjazdy z przystanku posortowane', () => {
  const d = departures(m, groupOf('Alfa'), 20261106, 7 * 3600);
  assert.deepStrictEqual(d.departures.map((x) => x.t), [8 * 3600, 8 * 3600 + 20 * 60]);
  // wieczorem tablica pokazuje nocny kurs „24:30”
  const n = departures(m, groupOf('Alfa'), 20261106, 23 * 3600);
  assert.deepStrictEqual(n.departures.map((x) => x.t), [24 * 3600 + 30 * 60]);
});
