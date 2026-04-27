# Med Andra Ord

Svenskt sällskapsspel (Taboo/Alias) som webbapp. Vanilla JS i en enda `index.html`.
Multiplayer via Supabase Realtime. Deployad på Netlify — push till `main` = live inom ~1 minut.

## Repo
- `dyos22/med-andra-ord`
- Live: https://fancy-blini-022ba3.netlify.app

## Stack
- Vanilla JS + HTML + CSS (ingen bundler, inga npm-paket i appen)
- Supabase för multiplayer-rum och realtidssynk
- Vitest + jsdom för tester

## Tester
Kör alltid tester innan push till `main`:
```
npm test
```
Alla 62 tester ska passera. Ny logik läggs till i `src/game-logic.js` med tillhörande tester i `src/game-logic.test.js`.

## Git
- Committa och pusha när en uppgift är klar, utan att fråga
- Snabba fixes: pusha direkt till `main`
- Större features: feature-branch → merga till `main`
- Push till `main` triggar automatisk Netlify-deploy

## Projektstruktur
- `index.html` — hela appen (spelloik, UI, CSS, multiplayer)
- `src/game-logic.js` — extraherade pure functions (testbara utan DOM)
- `src/game-logic.test.js` — testsuite
- `.claude/hooks/session-start.sh` — kör `npm install` vid sessionsstart
- `supabase-setup.sql` — databasschema
