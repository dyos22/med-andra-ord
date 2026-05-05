# Multiplayer-arkitektur: kvarvarande fixar

Den här filen beskriver fixar som inte är lämpliga som "drive-by"-edits utan
att kunna köra spelet och se det live mot Supabase. De kräver designval och
verifiering med två klienter.

Fixar som *redan* är gjorda i denna branch finns i commit-historiken på
`bug-fixes-from-review`.

---

## Kvar att göra

### A. CAS-baserade Supabase-uppdateringar (review-fynd #2, #5)

**Problem:** `mpSaveRoom` (index.html ≈ rad 3034) gör `upsert` utan optimistic
concurrency. Två klienter som markerar varsitt ord *samtidigt* läser båda
samma `state.version`, beräknar nästa state lokalt och skriver. En av
upserts vinner och den andras data förloras (t.ex. ett ord blir aldrig
markerat → båda lagen drar samma ord nästa gång).

**Förslag:**

1. Byt `upsert` mot `update().eq('room_code', code).eq('version', expected)`.
2. Om `data.length === 0` (CAS-fel) → läs aktuell state, kör action-handlern
   igen mot den nya state-versionen, försök på nytt. Max 3 försök.
3. För `setup`-action där rummet inte finns: använd `insert` separat.

**Risk:** alla actions måste vara reproducerbara mot ny state. `score_event`
inkrementerar `last_event.seq` — säkert. `end_round` adderar poäng — säkert
om vi är försiktiga (inte adderar två gånger). Inga side-effects i action-
handlern utöver state-mutationen.

**Test som krävs:** öppna spelet i två tabbar, markera ord/ändra poäng
samtidigt, verifiera att state inte tappas.

---

### B. Presence-tracking + host-failover (review-fynd #3)

**Problem:** om aktiv spelare stänger fliken under `phase: 'playing'` rör
sig `idx` aldrig och alla andra fastnar i spectator-vyn för evigt. Idag
finns ingen mekanism för att märka att en spelare lämnat.

**Förslag:**

1. Lägg till Supabase channel presence:
   ```js
   MP.channel = MP.supabase.channel(`mao-room-${MP.roomCode}`, {
     config: { presence: { key: MP.sessionId } }
   });
   MP.channel.on('presence', { event: 'sync' }, () => {
     const presenceState = MP.channel.presenceState();
     const onlinePlayers = Object.values(presenceState).flat().map(p => p.player);
     // Spara i MP.onlinePlayers
   });
   MP.channel.subscribe(async (status) => {
     if (status === 'SUBSCRIBED' && MP.myName) {
       await MP.channel.track({ player: MP.myName, joinedAt: Date.now() });
     }
   });
   ```
2. I `mpShowSpectator`: om aktiv spelare *inte* finns i `MP.onlinePlayers`
   under > 30 sekunder, visa en "Hoppa över spelaren"-knapp som anropar
   `mpPost('next_player')`.
3. På sikt: kör automatisk skip efter t.ex. 90s.

**Test som krävs:** två tabbar, stäng den aktiva tabben, vänta 30s,
verifiera att knappen syns och fungerar. Stäng *inte* aktiv spelare medan
det går snabbt — tillfälliga nätverksavbrott ska inte trigga skip.

---

### C. End_round / score_event som server-as-authority (review-fynd #3 ursprungligen)

**Problem:** `endRound` skriver lokalt till `S.scores[player] += pts` och
sedan postar `mpPost('end_round')`. Servern adderar samma poäng igen och
nästa `mpHandle` skriver över `S.scores` med `sv.scores`. Slutresultatet
blir korrekt men kan visa dubbla poäng kortvarigt mellan local-write och
server-eko.

**Förslag:**

1. Ta bort den lokala `S.scores[player] += pts`-raden i `endRound`.
2. Vänta in `mpPost('end_round')` innan modalen visas.
3. Lokala spel utan MP behöver fortsatt sin lokala score-mutation —
   gate på `MP.supabase`.

**Risk:** en kort fördröjning mellan klick och modal-visning vid långsam
backend.

---

### D. fetchMore när poolen är låg

`pickWord` anropar `fetchMore(lang, theme, diff)` om `S.apiKey` finns. Den
funktionen är inte granskad — kontrollera att den hanterar:

- Concurrent calls (samma diff anropas tre gånger i `renderRound`)
- Långsam respons (> 30s)
- Fel-svar från Anthropic API
- Att svaret faktiskt mergas in i `WORDS` så `pickWord` ser nya orden

---

### E. RLS i Supabase

`supabase-setup.sql` bör granskas: vem som helst med publishable-nyckeln
kan i nuläget förmodligen läsa/skriva `mao_rooms`. Säkerställ att RLS:

- Tillåter `select` på alla rader (för join-flow).
- Tillåter `insert/update/delete` bara från authentiserade sessioner *eller*
  via en server-side-funktion som validerar host-identitet.

Nuläget kan accepteras för en familje-användning, men dokumentera det.
