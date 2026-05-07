# Med Andra Ord

Ett webbaserat partyspel i en enda HTML-fil.

Spelet hostas statiskt via GitHub Pages och använder Supabase Realtime för rum,
spelare och poängsynk.

## Driftmodell

Spelet är avsett för familj och vänner i ett enda gemensamt rum (`FAMILY`).
Supabase-nyckeln är publik, och tabellens RLS-policyer tillåter anonym läsning
och uppdatering av rummet. Det är ett medvetet förenklat val för ett privat
partyspel där bara ett spel förväntas vara igång samtidigt, inte en generell
multiplayer-tjänst med separata privata rum.

## Ordlistor

`words.generated.js` byggs med `scripts/generate-wordlists.mjs` från SALDO,
Flex, SCOWL och de kuraterade filerna i `data/curated/`. Läs mer i
`WORDLISTS.md`.

## Filer

- `index.html` - spelet som GitHub Pages publicerar
- `supabase-setup.sql` - SQL som skapar tabellen för spelrum
- `med-andra-ord-qr.png` - QR-kod till den publicerade GitHub Pages-sidan
- `med-andra-ord-qr.svg` - vektorversion av samma QR-kod
