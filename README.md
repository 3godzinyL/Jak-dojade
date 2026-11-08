# Trasa — planer podróży komunikacją miejską

Aplikacja pod telefon (mobile-first): zakładki Trasa / Rozkłady / Bilety (Konto pod ikoną w nagłówku), wyszukiwanie połączeń
skąd → dokąd, warianty z przesiadkami, szczegóły trasy na mapie, odjazdy z przystanków,
linie z kierunkami, przebieg kursu. Przy pierwszym uruchomieniu zakłada się konto
administratora i podaje adres serwera (pod przyszłe APK). Własny silnik tras (RAPTOR) na **otwartych
rozkładach GTFS** przewoźników — bez cudzego API.

## Wygląd (lokalna kopia do nauki)

Interfejs odtworzony 1:1 z mobilnej strony jakdojade.pl (06.11.2026): kolory, wymiary, układ ekranów,
animacje — wartości zmierzone w przeglądarce na oryginale. Bez ich logo i nazwy (w nagłówku „trasa”),
bez ich serwerów i API, bez sprzedaży i wyświetlania biletów (zakładka Bilety odsyła do przewoźnika).

- `public/js/icons.js` — ikony interfejsu pobrane z jakdojade.pl, `public/img/stop-types/` — ikony przystanków.
  **Tylko do lokalnej nauki: nie publikować i nie dołączać do APK** (przy publikacji podmienić na własne/Material).
- `public/fonts/` — Manrope (licencja SIL OFL, wolno rozpowszechniać).
- `wersje/public-przed-wygladem-2026-11-06/` — poprzedni własny wygląd (kopia całego `public/`).

## Start

```
npm install          # raz
npm start            # albo START_TRASA.cmd
```

Przy pierwszym starcie serwer sam pobiera rozkład ZTM Gdańsk (~24 MB) i odświeża go co dobę.
Inne miasta (Kraków, Warszawa, Poznań) — Konto → Miasto albo
`npm run gtfs -- krakow` / `CITIES=gdansk,krakow npm start`.

Konta: `data/auth.json` (hasła jako scrypt, tokeny). Testowy serwer: `AUTH_FILE=…` = osobny stan.
Nie kasuj `data/` na serwerze — są tam konta i rozkłady.

| adres | co |
|---|---|
| `http://localhost:3400` | na komputerze otwiera **podgląd w ramce telefonu** (`/dev`): wybór urządzenia, log sieci i konsoli, kod QR |
| `http://localhost:3400/?app=1` | sama aplikacja w pełnym oknie |
| `http://<IP-komputera>:3400` | telefon w tej samej sieci Wi-Fi (adresy i QR w terminalu) |

## Debugowanie na telefonie

1. **Szybko, przez Wi-Fi:** zeskanuj QR z terminala albo z `/dev`. Dopisz `?debug=1` —
   włącza konsolę na telefonie (eruda: konsola, sieć, DOM). Wyłączenie: `?debug=0`
   albo Menu → Konsola debugowania. Błędy JS z telefonu trafiają też do terminala serwera.
   Jeśli telefon się nie łączy: Zapora Windows → zezwól Node.js w sieciach prywatnych.
2. **Pełne DevTools + GPS, przez USB (Android):** na telefonie Opcje programisty →
   Debugowanie USB. Na komputerze w Chrome `chrome://inspect` → *Port forwarding* →
   `3400` → `localhost:3400`. Na telefonie otwórz `http://localhost:3400`.
   Lokalizacja działa (przeglądarki dają GPS tylko na https lub localhost), a w
   `chrome://inspect` masz zwykłe DevTools tej karty telefonu.

## Zegar

Komputer może się spieszyć (tu: ~30 min). Serwer porównuje się z czasem z sieci
(nagłówek `Date`), a aplikacja liczy „za X min” wg czasu serwera, nie urządzenia.

## Struktura

- `server.js` — HTTP: API + pliki strony, `0.0.0.0:3400` (`PORT`, `HOST`, `CITIES`, `DATA_DIR`)
- `src/cities.js` — miasta i adresy paczek GTFS
- `src/gtfs/` — pobieranie, ZIP, CSV, budowa modelu (wzorce kursów, przesiadki piesze, kalendarz)
- `src/router/raptor.js` — RAPTOR (Pareto: przyjazd × liczba przesiadek), kursy po północy
- `src/router/plan.js` — dojście/odejście, warianty, „przyjazd na”, odjazdy, kurs
- `src/search.js` — przystanki z rozkładu, adresy z Photon (OpenStreetMap)
- `public/` — aplikacja (bez frameworka): `js/app.js` start/Trasa z wyszukiwaniem w polach/Konto/miasta,
  `js/screens.js` wyniki/szczegóły trasy/odjazdy/kurs/godzina/Opcje, `js/tabs.js` Rozkłady i linia,
  `js/tickets.js` Bilety, `js/render.js` widoki, `js/nav.js` ekrany i nakładki na historii
  (systemowy „wstecz”), `dev.html` ramka telefonu
- `test/` — `npm test` (silnik tras na małym rozkładzie)
- `scripts/bench-plan.js` — szybki test silnika na prawdziwych danych

## API

Bez logowania: `/api/time`, `/api/auth/{status,setup,login,logout}`, `/api/dev/*`.
Z tokenem (`Authorization: Bearer …`): `/api/cities`, `POST /api/cities/:id/load`,
`/api/c/:miasto/{search,geocode,reverse,stops,nearby,plan,departures,trip,lines,line}`.
Miejsce w `plan`: `n:Nazwa przystanku@lat,lon`, `g:<id zespołu>` albo `lat,lon`.

## Źródła danych

Rozkłady: ZTM Gdańsk, ZTP Kraków, ZTM Poznań (otwarte GTFS), Warszawa — mkuran.pl.
Mapa i adresy: © OpenStreetMap (kafelki OSM, geokoder Photon). Ikony: interfejs — jakdojade.pl (lokalnie, patrz wyżej), pozostałe Material Design Icons (Apache 2.0).
