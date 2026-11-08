'use strict';
// Minimalny czytnik ZIP (stored + deflate) — wystarcza na paczki GTFS, bez zależności.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

function findEocd(buf) {
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('Niepoprawny ZIP: brak końca katalogu');
}

async function extractZip(zipPath, outDir) {
  const buf = await fs.promises.readFile(zipPath);
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  await fs.promises.mkdir(outDir, { recursive: true });
  const files = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Niepoprawny ZIP: katalog centralny');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (compSize === 0xffffffff || localOff === 0xffffffff) throw new Error('ZIP64 nieobsługiwany: ' + name);
    // basename chroni przed ścieżkami typu ../ w archiwum
    const base = path.basename(name);
    if (!base.toLowerCase().endsWith('.txt')) continue;
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const data = buf.subarray(start, start + compSize);
    const dest = path.join(outDir, base);
    if (method === 0) await fs.promises.writeFile(dest, data);
    else if (method === 8) await pipeline(Readable.from([data]), zlib.createInflateRaw(), fs.createWriteStream(dest));
    else throw new Error(`ZIP: metoda kompresji ${method} nieobsługiwana (${name})`);
    files.push(base);
  }
  return files;
}

module.exports = { extractZip };
