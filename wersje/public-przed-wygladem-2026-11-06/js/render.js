// Czyste funkcje HTML: karta połączenia, oś czasu trasy, odjazdy, przebieg kursu.
import { icon, esc, lineBadge, lineColors, hm, inText, minutes, meters, transfersText, stopsText, secondsFromNow } from './util.js';

const SEP = '<svg class="sep" viewBox="0 0 24 24"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
const WALK_COLOR = '#8a929c';

export function placeIcon(p) {
  if (p.kind === 'me') return `<span class="li-ic brand">${icon('locate')}</span>`;
  if (p.kind === 'stop') {
    const m = (p.modes || []).includes('tram') && !(p.modes || []).includes('bus') ? 'tram' : (p.modes || [])[0] || 'bus';
    return `<span class="li-ic mode-${m}">${icon(m)}</span>`;
  }
  if (p.kind === 'map') return `<span class="li-ic">${icon('map')}</span>`;
  return `<span class="li-ic">${icon('place')}</span>`;
}

export function placeRow(p, i, { action = false, side = '' } = {}) {
  const lines = p.kind === 'stop' && p.lines && p.lines.length
    ? `<div class="li-lines">${p.lines.slice(0, 12).map((l) => `<span class="mini-line">${esc(l)}</span>`).join('')}</div>` : '';
  const sub = p.sub ? `<div class="li-sub">${esc(p.sub)}</div>` : '';
  return `<li data-i="${i}">${placeIcon(p)}<div class="li-main"><div class="li-name">${esc(p.name)}</div>${sub}${lines}</div>` +
    (side ? `<span class="li-side">${esc(side)}</span>` : '') +
    (action ? `<button class="li-action" data-dep="${i}" aria-label="Odjazdy">${icon('clock', 'sm')}</button>` : '') + '</li>';
}

const walkText = (j) => (j.walkMeters >= 30 ? ` · ${meters(j.walkMeters)} pieszo` : '');

export function journeyCard(j, i, date) {
  const first = j.legs.find((l) => l.type === 'ride');
  const chips = j.legs.map((l) => {
    if (l.type === 'walk') return l.sec >= 60 ? `<span class="wchip">${icon('walk')}${Math.round(l.sec / 60)}</span>` : '';
    return lineBadge(l);
  }).filter(Boolean).join(SEP);
  const plat = first.from.platform ? ` (${esc(first.from.platform)})` : '';
  const s = secondsFromNow(date, first.dep);
  return `<button class="jcard" data-j="${i}">
    <div class="jtop"><span class="jin js-in${s < -60 ? ' past' : ''}" data-sec="${first.dep}">${inText(date, first.dep)}</span>
      <span class="jtimes">${hm(j.leave)} – ${hm(j.arrive)}</span><span class="jdur">${minutes(j.duration)}</span></div>
    <div class="jlegs">${chips}</div>
    <div class="jsub">Odjazd <b>${hm(first.dep)}</b> z <b>${esc(first.from.name)}</b>${plat}<br>${transfersText(j.transfers)}${walkText(j)}</div>
  </button>`;
}

export function walkCard(w) {
  return `<button class="jcard" data-walk="1">
    <div class="jtop"><span class="jin">${icon('walk')}</span><span class="jtimes">Pieszo</span><span class="jdur">${minutes(w.sec)}</span></div>
    <div class="jsub">${meters(w.meters)} · ${hm(w.dep)} – ${hm(w.arr)}</div>
  </button>`;
}

// ---- oś czasu
const legRail = (l) => (l ? { walk: l.type === 'walk', color: l.type === 'walk' ? WALK_COLOR : lineColors(l).bg } : null);

function rail(above, below, dotCls, dotColor) {
  let h = '';
  if (above) h += `<span class="bar tp${above.walk ? ' walk' : ''}" style="--lc:${above.color}"></span>`;
  if (below) h += `<span class="bar bp${below.walk ? ' walk' : ''}" style="--lc:${below.color}"></span>`;
  return h + `<span class="dot ${dotCls}" style="--lc:${dotColor}"></span>`;
}

function node({ time, sub = '', name, plat = '', above, below, cls = '', dotColor = '#59626e', stop = null, extra = '' }) {
  const data = stop ? ` data-stop="${esc(stop.name)}" data-lat="${stop.lat}" data-lon="${stop.lon}"` : '';
  return `<div class="tl-row ${extra}"><div class="tl-time">${time}${sub}</div><div class="tl-rail">${rail(above, below, cls, dotColor)}</div>
    <div class="tl-body"><div class="tl-name"${data}>${esc(name)}${plat ? ` <span class="plat">${esc(plat)}</span>` : ''}</div></div></div>`;
}

function seg(l, inner) {
  const r = legRail(l);
  return `<div class="tl-row"><div class="tl-time"></div><div class="tl-rail"><span class="bar${r.walk ? ' walk' : ''}" style="--lc:${r.color}"></span></div>${inner}</div>`;
}

export function routeSummary(j, date) {
  const first = j.legs.find((l) => l.type === 'ride');
  return `<div class="route-sum"><div class="rs-top"><span class="rs-times">${hm(j.leave)} – ${hm(j.arrive)}</span><span class="rs-dur">${minutes(j.duration)}</span></div>
    <div class="rs-sub">Odjazd <b class="js-in" data-sec="${first.dep}">${inText(date, first.dep)}</b> · ${transfersText(j.transfers)}${walkText(j)}</div></div>`;
}

export function timeline(j, fromName, toName) {
  const legs = j.legs;
  const out = [];
  const last = legs[legs.length - 1];
  if (legs[0].type === 'walk') out.push(node({ time: hm(j.leave), name: fromName || 'Start', above: null, below: legRail(legs[0]), cls: 'start' }));
  legs.forEach((l, i) => {
    const prev = legs[i - 1], next = legs[i + 1];
    if (l.type === 'walk') {
      const what = i === legs.length - 1 ? 'Dojdź do celu' : i === 0 ? 'Dojdź na przystanek' : 'Przejdź';
      out.push(seg(l, `<div class="tl-walk">${icon('walk', 'sm')} ${what} · ${minutes(l.sec)} · ${meters(l.meters)}</div>`));
      return;
    }
    const c = lineColors(l).bg;
    const wait = prev ? l.dep - prev.arr : 0;
    const waitTxt = wait >= 60 ? `<small>czekasz ${Math.round(wait / 60)} min</small>` : '';
    out.push(node({ time: hm(l.dep), sub: waitTxt, name: l.from.name, plat: l.from.platform, above: legRail(prev), below: legRail(l), cls: i === 0 ? 'start' : '', dotColor: c, stop: l.from }));
    const n = l.stops.length - 1;
    out.push(seg(l, `<div class="tl-ride"><div class="tl-ride-top">${lineBadge(l, 'big')}<span class="tl-head">${icon('chevron', 'xs')} ${esc(l.headsign)}</span></div>
      <button class="tl-toggle" data-tg="${i}">${stopsText(n)} · ${minutes(l.arr - l.dep)} ${icon('expand')}</button>
      <button class="tl-toggle" data-trip="${i}">kurs ${icon('chevron')}</button></div>`));
    const inter = l.stops.slice(1, -1).map((s) => `<div class="tl-row"><div class="tl-time">${hm(s.t)}</div>
      <div class="tl-rail"><span class="bar" style="--lc:${c}"></span><span class="dot small" style="--lc:${c}"></span></div>
      <div class="tl-body" data-stop="${esc(s.name)}" data-lat="${s.lat}" data-lon="${s.lon}">${esc(s.name)}</div></div>`).join('');
    out.push(`<div class="tl-inter" id="inter-${i}">${inter}</div>`);
    out.push(node({ time: hm(l.arr), name: l.to.name, plat: l.to.platform, above: legRail(l), below: legRail(next), cls: !next ? 'end' : '', dotColor: c, stop: l.to }));
  });
  if (last.type === 'walk') out.push(node({ time: hm(j.arrive), name: toName || 'Cel', above: legRail(last), below: null, cls: 'end' }));
  return `<div class="tl">${out.join('')}</div>`;
}

// ---- odjazdy
export function departureRow(d, i, date) {
  const s = secondsFromNow(date, d.t);
  const soon = s >= -60 && s < 120;
  return `<div class="dep" data-d="${i}">${lineBadge(d)}<div class="dep-main"><div class="dep-head">${esc(d.headsign)}</div>
    <div class="dep-sub">${d.platform ? 'stanowisko ' + esc(d.platform) : esc(d.stop)}</div></div>
    <div class="dep-time"><div class="dep-in js-in${soon ? ' soon' : ''}" data-sec="${d.t}">${inText(date, d.t)}</div><div class="dep-hm">${hm(d.t)}</div></div></div>`;
}

// ---- przebieg kursu
export function tripList(t, focus, date) {
  const c = lineColors(t).bg;
  const rows = t.stops.map((s, i) => {
    const past = secondsFromNow(date, s.dep) < -30;
    const above = i > 0 ? { color: c } : null;
    const below = i < t.stops.length - 1 ? { color: c } : null;
    return node({ time: hm(i === 0 ? s.dep : s.arr), name: s.name, plat: s.platform, above, below, cls: i === 0 ? 'start' : i === t.stops.length - 1 ? 'end' : '',
      dotColor: c, stop: s, extra: (i === focus ? 'focus ' : '') + (past ? 'past' : '') });
  }).join('');
  return `<div class="route-sum trip-sum"><div class="rs-top">${lineBadge(t, 'big')}<span class="tl-head" style="font-size:16px">${esc(t.headsign)}</span></div>
    ${t.routeLong ? `<div class="rs-sub">${esc(t.routeLong)}</div>` : ''}<div class="rs-sub">${esc(t.agency || '')}</div></div><div class="tl">${rows}</div>`;
}
