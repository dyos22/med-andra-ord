# Med Andra Ord

Ett webbaserat partyspel i en enda HTML-fil.

Spelet hostas statiskt via GitHub Pages och använder Supabase Realtime för rum,
spelare och poängsynk.

## Ordlistor

`words.generated.js` byggs med `scripts/generate-wordlists.mjs` från SALDO,
Flex och SCOWL. Läs mer i `WORDLISTS.md`.

## Filer

- `index.html` - spelet som GitHub Pages publicerar
- `supabase-setup.sql` - SQL som skapar tabellen för spelrum
- `med-andra-ord-qr.png` - QR-kod till den publicerade GitHub Pages-sidan
- `med-andra-ord-qr.svg` - vektorversion av samma QR-kod
