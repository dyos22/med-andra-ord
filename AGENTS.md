# Instruktioner för agenter

Svara alltid på svenska.

Det här projektet är en statisk webbapp i `index.html`. Använd inte paketmanager-baserade tester eller installationer. Verifiera i stället med den lättaste relevanta kontrollen för ändringen: syntaxkontroll av berörd JavaScript och browserkontroll av berört flöde.
Vid ändringar i ordlistor: kör `node scripts/check-wordlists.mjs`.

## Lokal testserver

När en kontroll behöver server eller multiplayer-backend ska du använda den lokala testservern:

```sh
node scripts/local-test-server.mjs --port 8091
```

Öppna sedan URL:en som skrivs ut, normalt:

```text
http://127.0.0.1:8091/
```

Servern gör tre saker bara i den lokalt serverade kopian:

- serverar `index.html` och övriga statiska filer
- tar bort Supabase-CDN-scriptet så appen använder sina befintliga `/state`- och `/action`-fallbacks
- håller multiplayer-state i minnet under testet

Det här rör inte GitHub Pages, Supabase eller produktionsdata.

När kontrollen är klar ska servern stoppas igen med `Ctrl-C` eller genom att avsluta den shell-session som kör servern. Lämna inte testservern igång efter avslutat arbete. Om porten redan används, välj en annan port och testa mot den URL:en.

Exempel på flöde:

1. Starta servern med kommandot ovan.
2. Öppna `http://127.0.0.1:8091/` i browsern.
3. Kör det relevanta flödet, till exempel starta spel, joina spelare, starta runda, markera rätt/pass och gå till nästa spelare.
4. Kontrollera konsolloggar om UI:t beter sig oväntat.
5. Stoppa servern.

## Git

Committa och pusha när en uppgift är klar, utan att fråga. Snabba fixes kan pushas direkt till `main`; större features bör gå via feature-branch och merge.
