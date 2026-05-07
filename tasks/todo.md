# Plan: Bortagning av Claude API + UX/säkerhetsfixar

Fokus: mobil/tablet-spel. Skippar desktop-specifika saker.

## 1. Ta bort all Claude API-kod
- [ ] Ta bort `<input type="hidden" id="apiKey">` (rad 1087)
- [ ] Ta bort `apiKey: ''` från `S` (rad 1817)
- [ ] Ta bort `if (remaining < 30 && S.apiKey) fetchMore(...)`-anropet (rad 1948)
- [ ] Ta bort hela `fetchMore`-funktionen + `// CLAUDE API`-blocket (rad 2193-2233)
- [ ] Ta bort `S.fetching`-fältet (oanvänt efter ovan)
- [ ] Ta bort UI-strängar: `advSummary`, `lblApiKey`, `apiHelp` i både `sv` och `en` (rad 2245-2247, 2285-2287)
- [ ] Ta bort `S.apiKey = ...` + localStorage-write i `startGame` (rad 2471-2472)
- [ ] Ta bort `savedKey`-blocket (rad 3671-3672)
- [ ] Rensa befintlig `mao_apikey` ur localStorage vid start (engångsmigrering, så gamla nycklar inte ligger kvar)

## 2. Dubbelklicksskydd på `startGame`
- [ ] Sätt `startBtn.disabled = true` direkt vid klick
- [ ] Återställ vid fel/timeout (toast om "kunde inte starta")

## 3. Pausa polling i bakgrundsflik (sparar batteri på mobil)
- [ ] Vid `document.visibilityState === 'hidden'`: clearInterval för `mpSync`
- [ ] Vid `visible`: starta om + kör direkt `mpSync()` för catch-up
- [ ] Refaktorera `setInterval(mpSync, 750)` till en variabel + visibilitychange-listener

## 4. Toast vid kritiska multiplayer-fel
- [ ] `mpPost` för `setup`/`join`/`start_round`/`end_round`: visa toast om `.catch` triggas
- [ ] Skippa toast för `mark_used`/`merge_stats` (ofta tysta retries räcker)

## 5. Retry-kö för stats-sync vid nätverksfel
- [ ] `saveAndSyncRichStats`: vid catch, sätt flagga `MP._statsDirty = true`
- [ ] I `mpSync` framgång-branch: om `_statsDirty`, försök skicka igen och rensa flaggan

## 6. Maxålder på `resumeSession`
- [ ] Lägg till `SESSION_MAX_AGE_MS = 24*3600*1000` (24h)
- [ ] I `resumeSession`: kontrollera `savedAt`-fältet, ignorera äldre
- [ ] Säkerställ att `saveSession` skriver `savedAt`

## 7. Översätt resterande svenska strängar i engelskt läge
- [ ] `"Välkommen!"` (rad 3437) → `UI[S.lang].welcome`
- [ ] `'datum saknas'` (~rad 2791) → `UI[S.lang].dateMissing`
- [ ] `"byt spelare"`-länken (rad 3428) → `UI[S.lang].switchPlayer`
- [ ] `'Skit på dig'/'Känn lugnet'`-greeting → låt språkversionen hänga med (mindre prio, men kolla)

## 8. Rensning
- [ ] Ta bort död kod: `getStats`, `saveStats`, `logPassStat` (rad ~1943-1953) om de inte längre kallas
- [ ] Verifiera med grep innan borttagning

## Verifiering
- Kör `node scripts/check-wordlists.mjs`
- Starta `node scripts/local-test-server.mjs --port 8091` och prova:
  - Spela en runda lokalt
  - Verifiera att Avancerade inställningar-disclosure inte längre finns (eller är tom)
  - Verifiera att språkväxling fungerar
- Inline-JS syntaxkontroll via `node --check` på extraherad JS

## Git
- Allt på `main` direkt (snabba fixes per CLAUDE.md), en commit per logiskt steg
