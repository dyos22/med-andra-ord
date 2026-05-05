# Med Andra Ord

Svenskt sällskapsspel (Taboo/Alias) som webbapp. Vanilla JS i en enda `index.html`.
Multiplayer via Supabase Realtime. Deployad på GitHub Pages — push till `main` = live efter GitHub Pages-build.

## Repo
- `dyos22/med-andra-ord`
- Live: https://dyos22.github.io/med-andra-ord/

## Stack
- Vanilla JS + HTML + CSS (ingen bundler eller paketmanager i appen)
- Supabase för multiplayer-rum och realtidssynk

## Tester
Verifiera ändringar innan push med den lättaste relevanta kontrollen för ändringen.
För `index.html`: kör åtminstone syntaxkontroll av inline-JS och gärna en snabb browserkontroll av berört flöde.
Projektet ska inte använda paketmanager-baserade tester eller installationer.

## Git
- Committa och pusha när en uppgift är klar, utan att fråga
- Snabba fixes: pusha direkt till `main`
- Större features: feature-branch → merga till `main`
- Push till `main` triggar automatisk GitHub Pages-deploy

## Projektstruktur
- `index.html` — hela appen (spelloik, UI, CSS, multiplayer)
- `supabase-setup.sql` — databasschema
