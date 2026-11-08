'use strict';
const fs = require('fs');
const readline = require('readline');

function parseLine(line) {
  if (line.indexOf('"') === -1) return line.split(',');
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Czyta plik CSV GTFS wiersz po wierszu.
 * onRow(row, col) — row: tablica pól, col: { nazwa_kolumny: indeks } (brak kolumny = -1 przez col.get()).
 */
function eachRow(file, onRow) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(file)) return resolve(false);
    const input = fs.createReadStream(file, { encoding: 'utf8' });
    const rl = readline.createInterface({ input, crlfDelay: Infinity });
    let col = null;
    rl.on('line', (line) => {
      if (col === null) {
        const header = parseLine(line.replace(/^﻿/, '')).map((h) => h.trim());
        col = {};
        header.forEach((h, i) => { col[h] = i; });
        col.get = (name) => (name in col ? col[name] : -1);
        return;
      }
      if (!line) return;
      try { onRow(parseLine(line), col); } catch (e) { rl.close(); input.destroy(); reject(e); }
    });
    rl.on('close', () => resolve(true));
    input.on('error', reject);
  });
}

function parseTime(s) {
  if (!s) return -1;
  const a = s.trim().split(':');
  if (a.length < 2) return -1;
  return (+a[0]) * 3600 + (+a[1]) * 60 + (+(a[2] || 0));
}

module.exports = { eachRow, parseLine, parseTime };
