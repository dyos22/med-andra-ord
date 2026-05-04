# Ordlistepipeline

Spelet använder `words.generated.js` om filen finns. Den genereras av:

```bash
node scripts/generate-wordlists.mjs
```

Scriptet kräver bara Node.js samt systemverktygen `curl`, `tar` och `unzip`.
Rådata cachas i `.cache/wordlists/` och checkas inte in.

## Källor

- Svenska lexikonvalidering: SALDO från Språkbanken Text, CC-BY-4.0.
- Svenska frekvensrankning: Flex från Språkbanken Text, CC-BY-4.0.
- Engelska lexikon/svårighet: SCOWL 2020.12.07, MIT-liknande/BSD-kompatibel licens.

## Svårighet

- Svenska ord måste finnas i SALDO och frekvensrankas med Flex.
- Engelska ord måste finnas i SCOWL. SCOWL-nivåerna används som grov frekvens/svårighet.
- Korta och vanliga ord går mot `easy`.
- Medellånga och måttligt vanliga ord går mot `medium`.
- Längre, ovanligare och mer abstrakta ord går mot `hard`.
- Vanliga funktionsord, förkortningar, enbokstavsord och känsliga ämnen filtreras bort.

## Barnläge

Barnläget är en separat, konservativ lista. Den byggs av befintliga barnord,
tematiska barnord och en kuraterad barnsäker seedlista, men orden valideras mot
SALDO/SCOWL när det är enskilda ord.

## Personer och meningar

`personer` och `meningar` är kuraterade i `data/curated/sv.json` och
`data/curated/en.json`. De genereras inte från SALDO/SCOWL, eftersom namn,
fiktiva figurer, idiom och fraser fungerar bättre som redaktionellt innehåll.
Generatorn validerar att listorna finns, inte är tomma och saknar dubletter.

## Fallback

Temalistorna är hårdare filtrerade än standardlistan. Om ett tema tar slut för
en svårighet faller spelet tillbaka till motsvarande standardlista i stället för
att visa slut-på-ord direkt.
