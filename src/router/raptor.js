'use strict';
// RAPTOR (Delling, Pajor, Werneck) — rundy = liczba przejazdów, wynik Pareto (czas przyjazdu × przesiadki).
const { walkSeconds } = require('../geo');

const INF = 0x3fffffff;
const DAY = 86400;
const HORIZON = 8 * 3600; // nie szukamy kursu dalej niż 8 h od gotowości na przystanku
const T_ACCESS = 1, T_RIDE = 2, T_WALK = 3;

// wynik earliest() bez alokacji obiektu
let eRow = -1, eOff = 0, eDep = INF;

function earliest(m, pat, i, ready, active) {
  const S = pat.stops.length;
  const n = pat.trips.length;
  const dep = pat.dep;
  const svc = m.trips.service;
  eRow = -1; eOff = 0; eDep = INF;
  for (let k = 0; k < 3; k++) {
    const off = k === 0 ? 0 : k === 1 ? -1 : 1; // dzień zapytania, kursy z poprzedniego dnia po północy, następny dzień
    const act = active[off + 1];
    const t = ready - off * DAY;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dep[mid * S + i] < t) lo = mid + 1; else hi = mid;
    }
    for (let r = lo; r < n; r++) {
      const d = dep[r * S + i] + off * DAY;
      if (d >= eDep || d > ready + HORIZON) break;
      if (act[svc[pat.trips[r]]]) { eRow = r; eOff = off; eDep = d; break; }
    }
  }
  return eRow >= 0;
}

/**
 * o: { access: Int32Array (s → s pieszo, -1 brak), accessList, egress: Int32Array, egressList,
 *      t0, active: [dzień-1, dzień, dzień+1], maxRounds, slack, walkSlack, speed, routeOk: Uint8Array|null }
 */
function raptor(m, o) {
  const n = m.nStops;
  const K = o.maxRounds;
  const label = [], type = [], pA = [], pB = [], pC = [], pD = [], pOff = [];
  for (let k = 0; k <= K; k++) {
    label.push(new Int32Array(n).fill(INF));
    type.push(new Int8Array(n));
    pA.push(new Int32Array(n));
    pB.push(new Int32Array(n));
    pC.push(new Int32Array(n));
    pD.push(new Int32Array(n));
    pOff.push(new Int8Array(n));
  }
  const best = new Int32Array(n).fill(INF);
  const isMarked = new Uint8Array(n);
  const qPos = new Int32Array(m.patterns.length).fill(-1);
  const { start: spStart, pat: spPat, pos: spPos } = m.sp;
  const { start: fpStart, to: fpTo, dist: fpDist } = m.fp;
  const routeOf = (p) => m.patterns[p].route;
  let bestTarget = INF;
  const rounds = [];

  let marked = [];
  for (const s of o.accessList) {
    const a = o.t0 + o.access[s];
    if (a < label[0][s]) {
      label[0][s] = a; best[s] = a; type[0][s] = T_ACCESS; pD[0][s] = o.access[s];
      marked.push(s);
    }
  }

  for (let k = 1; k <= K && marked.length; k++) {
    const prev = label[k - 1], prevType = type[k - 1];
    const L = label[k], TY = type[k], A = pA[k], B = pB[k], C = pC[k], D = pD[k], OFF = pOff[k];
    const qList = [];
    for (const s of marked) {
      for (let e = spStart[s]; e < spStart[s + 1]; e++) {
        const p = spPat[e], pos = spPos[e];
        if (o.routeOk && !o.routeOk[routeOf(p)]) continue;
        if (!m.patterns[p].pick[pos]) continue;
        if (qPos[p] < 0) { qPos[p] = pos; qList.push(p); } else if (pos < qPos[p]) qPos[p] = pos;
      }
    }
    const newly = [];
    for (const p of qList) {
      const startPos = qPos[p];
      qPos[p] = -1;
      const pat = m.patterns[p];
      const S = pat.stops.length;
      let row = -1, off = 0, bPos = -1;
      for (let i = startPos; i < S; i++) {
        const s = pat.stops[i];
        if (row >= 0 && pat.drop[i]) {
          const a = pat.arr[row * S + i] + off * DAY;
          if (a < best[s] && a < bestTarget) {
            L[s] = a; best[s] = a; TY[s] = T_RIDE; A[s] = p; B[s] = row; C[s] = bPos; D[s] = i; OFF[s] = off;
            if (!isMarked[s]) { isMarked[s] = 1; newly.push(s); }
          }
        }
        if (pat.pick[i] && prev[s] < INF) {
          const ready = prev[s] + (prevType[s] === T_RIDE ? o.slack : prevType[s] === T_WALK ? o.walkSlack : 0);
          if (row < 0 || ready < pat.dep[row * S + i] + off * DAY) {
            if (earliest(m, pat, i, ready, o.active) && (row < 0 || eDep < pat.dep[row * S + i] + off * DAY)) {
              row = eRow; off = eOff; bPos = i;
            }
          }
        }
      }
    }
    // przesiadki piesze z przystanków osiągniętych przejazdem w tej rundzie
    const rideCount = newly.length;
    for (let j = 0; j < rideCount; j++) {
      const s = newly[j];
      if (TY[s] !== T_RIDE) continue;
      const base = L[s];
      for (let e = fpStart[s]; e < fpStart[s + 1]; e++) {
        const s2 = fpTo[e];
        const w = walkSeconds(fpDist[e], o.speed);
        const a = base + w;
        if (a < best[s2] && a < bestTarget) {
          L[s2] = a; best[s2] = a; TY[s2] = T_WALK; A[s2] = s; D[s2] = w;
          if (!isMarked[s2]) { isMarked[s2] = 1; newly.push(s2); }
        }
      }
    }
    let improved = -1;
    for (const s of newly) {
      isMarked[s] = 0;
      const eg = o.egress[s];
      if (eg >= 0 && L[s] < INF && L[s] + eg < bestTarget) { bestTarget = L[s] + eg; improved = s; }
    }
    if (improved >= 0) rounds.push({ k, stop: improved, arrival: bestTarget });
    marked = newly;
  }
  return { rounds, label, type, pA, pB, pC, pD, pOff };
}

/** Odtwarza przebieg: [{kind:'access'|'ride'|'walk', ...}] od startu do przystanku docelowego. */
function reconstruct(m, res, k, stop) {
  const legs = [];
  let s = stop, r = k;
  for (let guard = 0; guard < 64; guard++) {
    const t = res.type[r][s];
    if (t === T_ACCESS) { legs.unshift({ kind: 'access', stop: s, sec: res.pD[r][s] }); return legs; }
    if (t === T_RIDE) {
      const p = res.pA[r][s];
      legs.unshift({ kind: 'ride', p, row: res.pB[r][s], off: res.pOff[r][s], bPos: res.pC[r][s], aPos: res.pD[r][s] });
      s = m.patterns[p].stops[res.pC[r][s]];
      r -= 1;
      continue;
    }
    if (t === T_WALK) {
      const from = res.pA[r][s];
      const sec = res.pD[r][s];
      // dwa przejścia pod rząd (rzadkie nadpisanie etykiety) łączymy w jedno
      if (legs[0] && legs[0].kind === 'walk') { legs[0].from = from; legs[0].sec += sec; }
      else legs.unshift({ kind: 'walk', from, to: s, sec });
      s = from;
      continue;
    }
    return null;
  }
  return null;
}

module.exports = { raptor, reconstruct, earliest, INF, DAY };
