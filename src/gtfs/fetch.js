'use strict';
// Pobiera paczki GTFS miasta do data/gtfs/<miasto>/<paczka>/ i rozpakowuje.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { extractZip } = require('./zip');

const MAX_AGE_MS = 20 * 3600 * 1000; // rozkłady miejskie aktualizują się codziennie
const RETRY_MS = 3600 * 1000;         // paczka opcjonalna po nieudanym pobraniu: kolejna próba najwcześniej za godzinę

function feedDir(dataDir, cityId, feedId) { return path.join(dataDir, cityId, feedId); }

function readMeta(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')); } catch { return null; }
}

const hasFeedData = (dataDir, cityId, f) => fs.existsSync(path.join(feedDir(dataDir, cityId, f.id), 'stops.txt'));

// Paczki „optional” (np. ZKM Gdynia, SKM) nie blokują miasta: bez nich miasto działa na pozostałych.
function cityHasData(city, dataDir) {
  return city.feeds.every((f) => f.optional || hasFeedData(dataDir, city.id, f));
}

function feedFresh(dataDir, cityId, f) {
  const m = readMeta(feedDir(dataDir, cityId, f.id));
  if (m && m.downloadedAt && Date.now() - m.downloadedAt < MAX_AGE_MS && hasFeedData(dataDir, cityId, f)) return true;
  return !!(f.optional && m && m.failedAt && Date.now() - m.failedAt < RETRY_MS);
}

function cityIsFresh(city, dataDir) {
  return city.feeds.every((f) => feedFresh(dataDir, city.id, f));
}

async function downloadFeed(cityId, feed, dataDir, log = () => {}) {
  const dir = feedDir(dataDir, cityId, feed.id);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpZip = path.join(dir, '_download.zip');
  log(`${cityId}/${feed.id}: pobieram ${feed.url}`);
  const res = await fetch(feed.url, { headers: { 'User-Agent': 'trasa-planer/0.1 (lokalny serwer deweloperski)' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${feed.url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmpZip));
  const size = (await fs.promises.stat(tmpZip)).size;
  // Rozpakuj do katalogu tymczasowego, potem podmień — nieudane pobranie nie psuje starych danych
  const tmpDir = path.join(dir, '_new');
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
  const files = await extractZip(tmpZip, tmpDir);
  if (!files.includes('stops.txt') || !files.includes('stop_times.txt')) throw new Error(`${feed.url}: paczka bez stops.txt/stop_times.txt`);
  for (const f of await fs.promises.readdir(dir)) {
    if (f.endsWith('.txt')) await fs.promises.rm(path.join(dir, f), { force: true });
  }
  for (const f of files) await fs.promises.rename(path.join(tmpDir, f), path.join(dir, f));
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
  await fs.promises.rm(tmpZip, { force: true });
  const meta = { url: feed.url, downloadedAt: Date.now(), zipBytes: size, files };
  await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  log(`${cityId}/${feed.id}: gotowe (${(size / 1048576).toFixed(1)} MB, ${files.length} plików)`);
  return meta;
}

// Pobiera tylko nieaktualne paczki (force = wszystkie). Błąd paczki opcjonalnej zapisuje failedAt
// i nie przerywa reszty — stare dane tej paczki (jeśli są) zostają.
async function downloadCity(city, dataDir, log = () => {}, { force = false } = {}) {
  for (const feed of city.feeds) {
    if (!force && feedFresh(dataDir, city.id, feed)) continue;
    try {
      await downloadFeed(city.id, feed, dataDir, log);
    } catch (e) {
      if (!feed.optional) throw e;
      const why = (e.cause && (e.cause.code || e.cause.message)) || e.message;
      log(`${city.id}/${feed.id}: pominięto (${why}) — kolejna próba za godzinę`);
      const dir = feedDir(dataDir, city.id, feed.id);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'meta.json'), JSON.stringify({ ...(readMeta(dir) || {}), url: feed.url, failedAt: Date.now(), error: why }, null, 2));
    }
  }
}

module.exports = { downloadCity, downloadFeed, cityHasData, cityIsFresh, readMeta, feedDir };
