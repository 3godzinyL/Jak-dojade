'use strict';
// Miasta z otwartymi rozkładami GTFS. Nowe miasto = nowy wpis z adresami paczek.
// autoload: pobierane i ładowane przy starcie serwera (pozostałe na żądanie z ustawień).

const CITIES = [
  {
    id: 'gdansk',
    name: 'Gdańsk',
    center: [54.3520, 18.6466],
    autoload: true,
    feeds: [
      {
        id: 'G',
        name: 'ZTM Gdańsk',
        url: 'https://ckan.multimediagdansk.pl/dataset/c24aa637-3619-4dc2-a171-a23eec8f2172/resource/30e783e4-2bec-4a7d-bb22-ee3e3b26ca96/download/google_transit.zip',
      },
      // Trójmiasto jak w aplikacji (MZKZG): trolejbusy i autobusy Gdyni, pociągi SKM, MZK Wejherowo.
      // optional: niedostępna paczka nie blokuje Gdańska (np. wygasły certyfikat serwera Gdyni 07.11.2026).
      // ZKM Gdynia — Zarząd Dróg i Zieleni w Gdyni, licencja CC BY (otwartedane.gdynia.pl)
      { id: 'GD', name: 'ZKM Gdynia', optional: true, url: 'https://api.zdiz.gdynia.pl/pt/gtfs.zip' },
      // PKP Szybka Kolej Miejska w Trójmieście Sp. z o.o. — https://bip.skm.pkp.pl/otwarte-dane (aktualizacja raz na dobę)
      { id: 'SKM', name: 'SKM', optional: true, url: 'https://www.skm.pkp.pl/gtfs-mi-kpd.zip' },
      // MZK Wejherowo — przez mkuran.pl, licencja CC0
      { id: 'WEJ', name: 'MZK Wejherowo', optional: true, url: 'https://mkuran.pl/gtfs/wejherowo.zip' },
    ],
  },
  {
    id: 'krakow',
    name: 'Kraków',
    center: [50.0614, 19.9372],
    feeds: [
      { id: 'A', name: 'ZTP Kraków — autobusy', url: 'https://gtfs.ztp.krakow.pl/GTFS_KRK_A.zip' },
      { id: 'T', name: 'ZTP Kraków — tramwaje', url: 'https://gtfs.ztp.krakow.pl/GTFS_KRK_T.zip' },
      { id: 'M', name: 'ZTP Kraków — Mobilis', url: 'https://gtfs.ztp.krakow.pl/GTFS_KRK_M.zip' },
    ],
  },
  {
    id: 'warszawa',
    name: 'Warszawa',
    center: [52.2297, 21.0122],
    feeds: [
      { id: 'W', name: 'Warszawa (ZTM, Metro, SKM, KM) — mkuran.pl', url: 'https://mkuran.pl/gtfs/warsaw.zip' },
    ],
  },
  {
    id: 'poznan',
    name: 'Poznań',
    center: [52.4064, 16.9252],
    feeds: [
      { id: 'P', name: 'ZTM Poznań', url: 'https://www.ztm.poznan.pl/pl/dla-deweloperow/getGTFSFile' },
    ],
  },
];

module.exports = { CITIES };
