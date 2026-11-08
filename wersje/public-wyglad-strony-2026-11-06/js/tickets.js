// Zakładka Bilety: układ jak strona „Bilety” w oryginale (karty + nagłówek + odesłanie), ale tylko informacyjnie.
// Aplikacja nie sprzedaje i nie wyświetla biletów — kupuje się je w oficjalnych kanałach przewoźnika.
import { esc } from './util.js';
import { ji } from './icons.js';
import { S } from './state.js';
import { onScreen } from './nav.js';

const $ = (s) => document.querySelector(s);

// strony przewoźników z cennikiem i listą miejsc sprzedaży
const SALES = {
  gdansk: { name: 'ZTM Gdańsk', url: 'https://ztm.gda.pl' },
  krakow: { name: 'ZTP Kraków', url: 'https://ztp.krakow.pl' },
  warszawa: { name: 'ZTM Warszawa', url: 'https://www.wtp.waw.pl' },
  poznan: { name: 'ZTM Poznań', url: 'https://www.ztm.poznan.pl' },
};

function render() {
  const c = S.city || { id: '', name: '' };
  const s = SALES[c.id] || { name: 'przewoźnika', url: '' };
  $('#ticketsBody').innerHTML = `
    <div class="tk-cards" aria-hidden="true">
      <div class="tk-card"><div class="tk-band y">ULGOWY</div><div class="tk-op">${esc(s.name.split(' ')[0])}</div><div class="tk-zone">${esc(c.name)}</div><div class="tk-big">%</div><div class="tk-unit">zniżki<br>wg cennika</div></div>
      <div class="tk-card"><div class="tk-band">NORMALNY</div><div class="tk-op">${esc(s.name.split(' ')[0])}</div><div class="tk-zone">${esc(c.name)}</div><div class="tk-big">zł</div><div class="tk-unit">ceny<br>u przewoźnika</div></div>
    </div>
    <div class="tk-title">Bilety kupisz u przewoźnika</div>
    <div class="tk-text">Aktualny cennik, ulgi i miejsca sprzedaży ${esc(s.name)} — na jego oficjalnej stronie, w biletomatach i punktach sprzedaży.</div>
    <div class="tk-fares">
      <div class="tk-fare"><span>Bilety jednorazowe i czasowe<small>ceny i strefy według cennika ${esc(s.name)}</small></span></div>
      <div class="tk-fare"><span>Bilety okresowe<small>imienne lub na okaziciela — szczegóły u przewoźnika</small></span></div>
      <div class="tk-fare"><span>Ulgi<small>uprawnienia sprawdzisz w regulaminie przewoźnika</small></span></div>
    </div>
    ${s.url ? `<a class="tk-link" href="${s.url}" target="_blank" rel="noopener">Cennik i sprzedaż: ${esc(s.url.replace(/^https?:\/\//, ''))}${ji('right-alt')}</a>` : ''}
    <div class="tk-note">Ta aplikacja nie sprzedaje i nie pokazuje biletów do kontroli.</div>`;
}

onScreen('tickets', render);
