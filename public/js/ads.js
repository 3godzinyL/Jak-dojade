// Miejsca na reklamy w tych samych punktach i rozmiarach co w aplikacji: duży baner na starcie,
// wiersz natywny w podpowiedziach, pasek nad wynikami i nad szczegółami trasy.
// Kreacje są własne (autopromocja tej aplikacji), w tym jedna animowana jak reklama wideo.
import { icon } from './util.js';
import { ji } from './icons.js';
import { switchTab } from './nav.js';

const HOUSE = [
  {
    id: 'tickets', tab: 'tickets', title: 'Bilety komunikacji miejskiej', sub: 'Kupisz je w tej aplikacji', cta: 'kup bilet',
    art: (big) => `<div class="adc adc-tickets${big ? ' big' : ''}"><span class="adc-mark">${ji('brand-mark')}<b>trasa</b></span>
      <span class="adc-head">Bilet kupisz<br>bez wychodzenia<br>z aplikacji</span><span class="adc-cta">kup bilet</span></div>`,
  },
  {
    id: 'lines', tab: 'lines', title: 'Rozkłady zawsze pod ręką', sub: 'Odjazdy z każdego przystanku', cta: 'otwórz',
    art: (big) => `<div class="adc adc-lines${big ? ' big' : ''}"><span class="adc-mark">${ji('brand-mark')}<b>trasa</b></span>
      <span class="adc-head">Rozkłady jazdy<br>zawsze pod ręką</span><span class="adc-tiles"><i>2</i><i>6</i><i>8</i><i>N6</i><i>148</i></span></div>`,
  },
  {
    id: 'video', tab: 'home', title: 'Planuj podróże z trasa', sub: 'Najszybsze połączenia w mieście', cta: 'otwórz', video: true,
    art: (big) => `<div class="adc adc-video${big ? ' big' : ''}"><span class="adv-road"></span><span class="adv-bus"></span>
      <span class="adc-head">Planuj podróże<br>z trasa</span><span class="adv-ctl"><button class="adv-pause" aria-label="Pauza"></button><span class="adv-mute">${icon('close')}</span></span></div>`,
  },
];

let turn = Math.floor(Math.random() * HOUSE.length);
const pick = (kind) => {
  // duży baner na starcie raz na jakiś czas pokazuje wersję „wideo”, jak w aplikacji
  turn = (turn + 1) % HOUSE.length;
  return HOUSE[kind === 'native' ? turn % 2 : turn];
};

/** kind: 'home' (duży baner) | 'native' (wiersz w liście) | 'compact' (pasek nad wynikami/trasą) */
export function renderAd(slot, kind) {
  if (!slot) return;
  const a = pick(kind);
  slot.dataset.ad = a.id;
  slot.dataset.tab = a.tab;
  if (kind === 'home') {
    slot.className = 'ad-slot ad-home';
    slot.innerHTML = `<div class="ad-label">REKLAMA</div><div class="ad-body">${a.art(true)}<span class="ad-choice">${icon('external')}</span></div>`;
  } else if (kind === 'native') {
    slot.className = 'ad-native';
    slot.innerHTML = `<div class="ad-label left">REKLAMA</div><div class="adn"><span class="adn-txt"><b>${a.title}</b><small>${a.sub}</small></span>
      <span class="adn-thumb">${a.art(false)}</span><span class="adn-fold">${icon('expand')}</span></div>`;
  } else {
    slot.className = 'ad-slot ad-compact';
    slot.innerHTML = `<div class="ad-label">REKLAMA</div><div class="adx"><span class="adx-art">${a.art(false)}</span>
      <span class="adx-side"><span class="adx-name">${ji('brand-mark')}<b>trasa</b></span><span class="adx-btn">${a.cta === 'kup bilet' ? 'Kup bilet' : 'Otwórz'}</span></span>
      <span class="ad-choice">${icon('external')}</span></div>`;
  }
}

// klik w reklamę = przejście do reklamowanej części aplikacji; pauza zatrzymuje animację „wideo”
document.addEventListener('click', (e) => {
  const pause = e.target.closest('.adv-pause');
  if (pause) { e.stopPropagation(); pause.closest('.adc-video').classList.toggle('paused'); return; }
  const fold = e.target.closest('.adn-fold');
  if (fold) { e.stopPropagation(); fold.closest('.ad-native').classList.toggle('folded'); return; }
  const slot = e.target.closest('[data-ad]');
  // w trybie wpisywania (otwarta klawiatura i podpowiedzi) reklama nie przełącza zakładki
  if (slot && slot.dataset.tab && slot.dataset.tab !== 'home' && !document.body.classList.contains('searching')) switchTab(slot.dataset.tab);
});
