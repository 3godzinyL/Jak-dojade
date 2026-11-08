// Czyste funkcje HTML: podpowiedzi, karta trasy, oś czasu szczegółów, odjazdy, lista przystanków linii/kursu.
import { icon, esc, lineBadge, lineColors, hm, inText, minutes, meters, stopsText, secondsFromNow } from './util.js';

const STOP_IMG = { 'tram,bus': 'TRAM_BUS', tram: 'TRAM', bus: 'BUS', rail: 'TRAIN', trolley: 'BUS' };

function stopImg(modes = []) {
  const m = modes.filter((x) => x !== 'other');
  const key = m.includes('tram') && m.includes('bus') ? 'tram,bus' : m.find((x) => STOP_IMG[x]) || 'bus';
  return `<img src="/img/stop-types/${STOP_IMG[key]}.svg" alt="">`;
}

/** Nazwa z wyróżnieniem dopasowanych słów (w oryginale dopasowanie jest jaśniejsze). */
function matched(name, q) {
  if (!q) return esc(name);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return name.split(/(\s+)/).map((w) => (words.some((x) => w.toLowerCase().startsWith(x)) ? `<span class="m">${esc(w)}</span>` : esc(w))).join('');
}

export function sgRow(p, i, { q = '', fill = false } = {}) {
  let ic;
  if (p.kind === 'stop') ic = `<span class="sg-ic">${stopImg(p.modes)}</span>`;
  else if (p.kind === 'me') ic = `<span class="sg-ic pin">${icon('locate')}</span>`;
  else ic = `<span class="sg-ic pin">${icon('pin')}</span>`;
  let sub = p.sub || '';
  if (p.kind === 'stop') sub = 'przystanek' + (p.lines && p.lines.length ? ', linie: ' + p.lines.slice(0, 5).join(', ') + (p.lines.length > 5 ? ',...' : '') : '');
  return `<div class="sg-row" data-i="${i}">${ic}<div class="sg-text"><div class="sg-name">${matched(p.name, q)}</div>${sub ? `<div class="sg-sub">${esc(sub)}</div>` : ''}</div>` +
    (fill ? `<button class="sg-fill" data-fill="${i}" aria-label="Wstaw do pola">${icon('fill')}</button>` : '') + '</div>';
}

// ---------------- karta trasy (lista wyników i nagłówek szczegółów)
function depBlock(date, sec) {
  const s = secondsFromNow(date, sec);
  if (s < -60) return `<span class="rc-lab">Odjechał o:</span><span class="rc-big rc-past"><span class="rc-num hm">${hm(sec)}</span></span>`;
  const m = Math.max(0, Math.floor(s / 60));
  if (m >= 60) return `<span class="rc-lab">Odjazd o:</span><span class="rc-big"><span class="rc-num hm">${hm(sec)}</span></span>`;
  return `<span class="rc-lab">Odjazd za:</span><span class="rc-big"><span class="rc-num js-min" data-sec="${sec}">${String(m).padStart(2, '0')}</span><span class="rc-unit">min</span></span>`;
}

export function journeyCard(j, i, date, { shine = false, tag = 'button' } = {}) {
  const rides = j.legs.filter((l) => l.type === 'ride');
  const first = rides[0], last = rides[rides.length - 1];
  const legs0 = j.legs[0], legsN = j.legs[j.legs.length - 1];
  const walk = (l) => (l && l.type === 'walk' && l.sec >= 60 ? `<span class="twalk">${icon('walk')}<span class="tdur">${Math.round(l.sec / 60)} min</span></span>` : '');
  return `<${tag} class="rcard${shine ? ' shine' : ''}" data-j="${i}" style="--i:${i}">
    <div class="rc-dep">${depBlock(date, first.dep)}</div>
    <div class="rc-main">
      <div class="rc-top"><div class="rc-lines">${rides.map((l) => lineBadge(l)).join('')}</div><span class="rc-total">${minutes(j.duration)}</span></div>
      <div class="rc-times">${walk(legs0)}<span class="tpill tp-d">${hm(first.dep)}</span><span class="tdur">${minutes(last.arr - first.dep)}</span><span class="tpill tp-a">${hm(last.arr)}</span>${walk(legsN)}</div>
    </div></${tag}>`;
}

export function walkCard(w, i) {
  return `<button class="rcard" data-walk="1" style="--i:${i}">
    <div class="rc-dep"><span class="rc-lab">Pieszo</span><span class="rc-big"><span class="rc-num">${String(Math.round(w.sec / 60)).padStart(2, '0')}</span><span class="rc-unit">min</span></span></div>
    <div class="rc-main"><div class="rc-top"><div class="rc-lines"><span class="vnum"><span class="v-ic">${icon('walk')}</span></span></div><span class="rc-total">${meters(w.meters)}</span></div>
      <div class="rc-times"><span class="tpill tp-d">${hm(w.dep)}</span><span class="tdur">${minutes(w.sec)}</span><span class="tpill tp-a">${hm(w.arr)}</span></div></div></button>`;
}

// ---------------- oś czasu szczegółów trasy
const pt = (time, cls = '', dot = false) => `<span class="tpt ${cls}${dot ? ' point' : ''}">${dot ? icon('point') : ''}${time}</span>`;
const stopName = (s, code = true) => `<div class="tl-stop" data-stop="${esc(s.name)}" data-lat="${s.lat}" data-lon="${s.lon}">${esc(s.name)}${code && s.platform ? `<span class="code">&nbsp;${esc(s.platform)}</span>` : ''}</div>`;

function pointRow(time, name, cls = '') {
  return `<div class="tl-part"><div class="tl-r"><div class="tl-l">${pt(time, cls, true)}</div><div class="tl-c"><div class="tl-stop">${esc(name)}</div></div></div></div>`;
}

function walkPart(lines) {
  return `<div class="tl-part"><div class="tl-sep"></div><div class="tl-r" style="min-height:84px"><div class="tl-l"><span class="walk-dots"></span><span class="tl-walkic">${icon('walk')}</span><span class="walk-dots"></span></div>
    <div class="tl-c" style="display:flex;flex-direction:column;justify-content:center;padding:16px 0">${lines.map(([a, b]) => `<div class="tl-wl"><span>${a}</span><span>${b}</span></div>`).join('')}</div></div></div>`;
}

export function timeline(j, fromName, toName) {
  const legs = j.legs;
  const rides = legs.filter((l) => l.type === 'ride');
  const firstRide = rides[0], lastRide = rides[rides.length - 1];
  const out = [];
  if (legs[0].type === 'walk') out.push(pointRow(hm(j.leave), fromName || 'Start'));
  legs.forEach((l, i) => {
    const prev = legs[i - 1], next = legs[i + 1];
    if (l.type === 'walk') {
      const lines = [[`Idź ${meters(l.meters)}`, minutes(l.sec)]];
      if (next && next.type === 'ride') {
        const wait = next.dep - l.arr;
        if (wait >= 60) lines.push([i === 0 ? 'Poczekaj na odjazd' : 'Poczekaj na przesiadkę', minutes(wait)]);
      }
      out.push(walkPart(lines));
      return;
    }
    if (prev && prev.type === 'ride') {
      const wait = l.dep - prev.arr;
      out.push(walkPart([['Przesiadka na tym samym przystanku', ''], ['Poczekaj na przesiadkę', minutes(Math.max(0, wait))]]));
    }
    const c = lineColors(l).bg;
    const isFirst = l === firstRide, isLast = l === lastRide;
    const n = l.stops.length - 1;
    const inter = l.stops.slice(1, -1).map((s) => `<div class="tl-ist" data-stop="${esc(s.name)}" data-lat="${s.lat}" data-lon="${s.lon}"><span>${esc(s.name)}</span><span>${hm(s.t)}</span></div>`).join('');
    out.push(`<div class="tl-part">${i > 0 ? '<div class="tl-sep"></div>' : ''}<div class="tl-r" style="--lc:${c};padding-top:${i > 0 ? 16 : 0}px">
      <div class="tl-l">${pt(hm(l.dep), isFirst ? 'start' : '', isFirst && i === 0)}<span style="height:8px"></span><span class="tl-veh">${icon(l.mode)}</span><span class="tl-gl"></span><span class="tl-end-dot"></span><span style="height:6px"></span>${pt(hm(l.arr), isLast ? 'arr' : '', isLast && !next)}</div>
      <div class="tl-c">
        ${stopName(l.from)}
        <div class="tl-vh" style="margin-top:8px">${lineBadge(l, 'lg', false)}<span class="tl-head">→ ${esc(l.headsign)}</span><span class="tl-dur">${minutes(l.arr - l.dep)}</span></div>
        <div class="tl-info">Odjazd <b>${hm(l.dep)}</b>${l.from.platform ? `, stanowisko <b>${esc(l.from.platform)}</b>` : ''}</div>
        <div class="tl-div"></div>
        ${n > 1 ? `<button class="tl-stops" data-tg="${i}">${stopsText(n)}${icon('expand')}</button><div class="tl-inter" id="inter-${i}">${inter}</div>` : `<div class="tl-stops">${stopsText(n)}</div>`}
        <button class="tl-trip" data-trip="${i}">Pokaż cały kurs linii ${esc(l.line)}</button>
        <div class="tl-div" style="margin-bottom:12px"></div>
        <div style="padding-bottom:1px">${stopName(l.to)}</div>
      </div></div></div>`);
  });
  if (legs[legs.length - 1].type === 'walk') out.push(pointRow(hm(j.arrive), toName || 'Cel'));
  return out.join('');
}

// ---------------- odjazdy z przystanku
export function departureRow(d, i, date) {
  const s = secondsFromNow(date, d.t);
  const cls = s < -60 ? ' past' : s < 120 ? ' soon' : '';
  return `<div class="dep" data-d="${i}">${lineBadge(d)}<div class="dep-main"><div class="dep-head">→ ${esc(d.headsign)}</div>
    <div class="dep-sub">${d.platform ? 'stanowisko ' + esc(d.platform) : esc(d.stop)}</div></div>
    <div class="dep-time"><div class="dep-in js-in${cls}" data-sec="${d.t}">${inText(date, d.t)}</div><div class="dep-hm">${hm(d.t)}</div></div></div>`;
}

// ---------------- przystanki linii / kursu (białe tło pod ciemnym panelem)
export function stopList(stops, { color = '', focus = -1, date = 0, times = false } = {}) {
  return stops.map((s, i) => {
    const t = times ? (i === 0 ? s.dep : s.arr) : null;
    const past = times && date && secondsFromNow(date, s.dep) < -30;
    return `<div class="lst${i === focus ? ' focus' : ''}${past ? ' past' : ''}" data-s="${i}"${color ? ` style="--lc:${color}"` : ''}>
      <span class="lst-rail"><span class="lst-dot"></span></span><span class="lst-name">${esc(s.name)}${s.platform ? ` ${esc(s.platform)}` : ''}</span>${t != null ? `<span class="lst-t">${hm(t)}</span>` : ''}</div>`;
  }).join('');
}
