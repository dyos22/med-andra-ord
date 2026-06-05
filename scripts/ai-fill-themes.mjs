// scripts/ai-fill-themes.mjs
//
// Genererar KANDIDAT-ord för att fylla på TUNNA nivåer i befintliga ordteman,
// via lokal Gemma. Deduppar mot ord som redan finns i words.generated.js.
// Kandidaterna granskas innan de förs in i tilläggs-overlayn (extra-words.json).
//
// Kör:  node scripts/ai-fill-themes.mjs
// Ut:   data/curated/_fill-candidates.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API = process.env.GEMMA_API || 'http://localhost:1234/v1/chat/completions';
const MODEL = process.env.GEMMA_MODEL || 'google/gemma-4-e4b';
const N = Number(process.env.N || 30);
const OUT = path.join(ROOT, 'data', 'curated', '_fill-candidates.json');

const THEMES = {
  djur:  { topic: 'DJUR (djurarter)', levels: { hard: 'ovanligare djur (t.ex. myrslok, vessla, järv, lämmel, tapir, näbbmus, åkersork)' } },
  mat:   { topic: 'MAT (maträtter, ingredienser, råvaror)', levels: { medium: 'ganska vanlig mat (t.ex. lasagne, omelett, paprika, zucchini, kanelbulle)', hard: 'ovanligare mat och råvaror (t.ex. surströmming, palsternacka, kålrot, kassler, rödbeta)' } },
  sport: { topic: 'SPORT (sporter och idrotter)', levels: { medium: 'ganska vanliga sporter (t.ex. innebandy, handboll, simning, badminton, gymnastik)', hard: 'ovanligare sporter (t.ex. curling, rodd, fäktning, bob, vattenpolo, bordtennis)' } },
  natur: { topic: 'NATUR (landskap, väder, växter, naturfenomen)', levels: { hard: 'ovanligare naturord (t.ex. tundra, glaciär, vulkan, myr, rev, klyfta, lavin)' } },
  yrken: { topic: 'YRKEN (yrken och arbeten)', levels: { medium: 'ganska vanliga yrken (t.ex. elektriker, frisör, snickare, brevbärare, rörmokare)', hard: 'ovanligare yrken (t.ex. sotare, hovslagare, urmakare, glasblåsare, logoped, optiker)' } },
  musik: { topic: 'MUSIK & INSTRUMENT', levels: { easy: 'mycket vanliga musikord (t.ex. trumma, gitarr, piano, sång, mikrofon, kör, scen)', barn: 'enklaste musikord för barn (t.ex. trumma, gitarr, sjunga, flöjt, visa, sång)' } },
};
const TARGETS = [
  ['djur', ['hard']], ['mat', ['medium', 'hard']], ['sport', ['medium', 'hard']],
  ['natur', ['hard']], ['yrken', ['medium', 'hard']], ['musik', ['easy', 'barn']],
];

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (l) => l
  .replace(/^\s*[-*•\d]+[.)]?\s*/, '').replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
  .replace(/[.!?:,]+$/, '').replace(/\s+/g, ' ').trim().toLowerCase();

async function ask(topic, levelDesc, diff) {
  const sys = `Du är expert på svensk vokabulär. Lista vanliga svenska SUBSTANTIV inom temat ${topic}. ` +
    'Ett ord per rad, gemener, inga förklaringar, inga citattecken, ingen numrering. ' +
    'Bara enstaka ord eller högst tvåordssammansättningar. ' + `Svårighetsnivå: ${levelDesc}.`;
  const user = `Ge ${N} svenska ord på nivån "${diff}". Ett per rad, inget annat.`;
  const body = { model: MODEL, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature: 0.7, max_tokens: 1000 };
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const d = await res.json();
  const txt = d.choices?.[0]?.message?.content || '';
  return txt.split('\n').map(clean).filter((x) => x.length >= 2 && x.length <= 22 && /^[a-zåäöé ]+$/.test(x) && x.split(' ').length <= 2);
}

await import(pathToFileURL(path.join(ROOT, 'words.generated.js')).href);
const WORDS = globalThis.MAO_GENERATED_WORDS;

const out = {};
for (const [theme, diffs] of TARGETS) {
  out[theme] = {};
  const existing = new Set();
  for (const dl of Object.values(WORDS.sv[theme] || {})) for (const w of dl) existing.add(norm(w));
  for (const diff of diffs) {
    process.stderr.write(`${theme}/${diff} ... `);
    let list = [];
    try { list = await ask(THEMES[theme].topic, THEMES[theme].levels[diff], diff); }
    catch (e) { process.stderr.write('FEL ' + e.message + '\n'); }
    const seen = new Set(); const keep = [];
    for (const w of list) { const n = norm(w); if (!existing.has(n) && !seen.has(n)) { seen.add(n); keep.push(w); existing.add(n); } }
    out[theme][diff] = keep;
    process.stderr.write(keep.length + ' kandidater\n');
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('Skrivet till', path.relative(ROOT, OUT));
for (const [t, ds] of TARGETS) for (const d of ds) console.log(`  ${t}/${d}: ${out[t][d].length}`);
