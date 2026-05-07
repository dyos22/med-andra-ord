#!/usr/bin/env node
await import('../words.generated.js');

const words = globalThis.MAO_GENERATED_WORDS;
if (!words?.sv || !words?.en) throw new Error('Kunde inte läsa words.generated.js');

const SV_FALSE_FRIENDS = new Set([
  // Vanliga engelska ord som kan slinka in i svensk lista. Lägg till här när
  // manuella kontroller hittar nya uppenbara språkfel. Svenska homografer som
  // "problem" ska inte ligga här.
  'different',
]);

const EN_FALSE_FRIENDS = new Set([
  'skola', 'vatten', 'fönster', 'månadslön', 'sommardag', 'skildring',
  'klarspråk', 'återskapa', 'borgerlig', 'flygbolag', 'befintlig',
]);

const issues = [];

for (const [theme, diffs] of Object.entries(words.sv)) {
  for (const [diff, list] of Object.entries(diffs)) {
    for (const word of list) {
      const key = String(word).trim().toLowerCase();
      if (SV_FALSE_FRIENDS.has(key)) issues.push(`sv.${theme}.${diff}: "${word}" ser engelskt ut`);
    }
  }
}

for (const [theme, diffs] of Object.entries(words.en)) {
  for (const [diff, list] of Object.entries(diffs)) {
    for (const word of list) {
      const key = String(word).trim().toLowerCase();
      if (EN_FALSE_FRIENDS.has(key)) issues.push(`en.${theme}.${diff}: "${word}" ser svenskt ut`);
      if (theme !== 'personer' && /[åäö]/i.test(key)) {
        issues.push(`en.${theme}.${diff}: "${word}" innehåller svensk bokstav`);
      }
    }
  }
}

if (issues.length) {
  console.error(issues.join('\n'));
  process.exit(1);
}

console.log('wordlists OK');
