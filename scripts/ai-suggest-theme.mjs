// scripts/ai-suggest-theme.mjs
//
// Genererar KANDIDAT-ord (enstaka svenska substantiv) för ett NYTT tema via den
// lokala Gemma-servern (LM Studio på Air:en). Kandidaterna ska GRANSKAS innan de
// förs in i data/curated/sv.json. För vanliga substantiv är Gemma pålitlig nog
// att granskningen blir lätt (kolla: riktigt ord, passar temat, rätt svårighet).
//
// Kör:  node scripts/ai-suggest-theme.mjs musik
// Ut:   data/curated/_theme-<key>-candidates.json   (deduppat)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CURATED = path.join(ROOT, 'data', 'curated', 'sv.json');

const API = process.env.GEMMA_API || 'http://localhost:1234/v1/chat/completions';
const MODEL = process.env.GEMMA_MODEL || 'google/gemma-4-e4b';
const N = Number(process.env.N || 30);
const DIFFS = ['easy', 'medium', 'hard', 'barn'];

const THEME_DEFS = {
  musik: {
    topic: 'MUSIK & INSTRUMENT (instrument, musiktermer, sång, noter, musikgenrer)',
    levels: {
      easy:   'mycket vanliga ord som alla känner till (t.ex. gitarr, piano, trumma, fiol, flöjt, sång, not)',
      medium: 'ganska vanliga ord (t.ex. cello, dragspel, klarinett, trumpet, saxofon, orkester, dirigent, ackord, refräng)',
      hard:   'ovanliga eller mer specialiserade ord (t.ex. oboe, fagott, marimba, kontrabas, valthorn, cembalo, klaviatur)',
      barn:   'de allra enklaste musikorden som barn känner till (t.ex. trumma, gitarr, piano, flöjt, sjunga)',
    },
  },
};

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function clean(line) {
  return line
    .replace(/^\s*[-*•\d]+[.)]?\s*/, '')
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.!?:,]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function ask(def, diff) {
  const sys =
    `Du är expert på svensk vokabulär. Lista vanliga svenska SUBSTANTIV inom temat ${def.topic}. ` +
    'Ett ord per rad, gemener, inga förklaringar, inga citattecken, ingen numrering. ' +
    'Bara enstaka ord eller högst tvåordssammansättningar — inga meningar. ' +
    `Svårighetsnivå: ${def.levels[diff]}.`;
  const user = `Ge ${N} svenska ord på nivån "${diff}". Ett per rad, inget annat.`;
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
    temperature: 0.7,
    max_tokens: 1000,
  };
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || '';
  return txt
    .split('\n')
    .map(clean)
    .filter((x) => x.length >= 2 && x.length <= 22 && /^[a-zåäöé ]+$/.test(x) && x.split(' ').length <= 2);
}

const key = process.argv[2] || 'musik';
const def = THEME_DEFS[key];
if (!def) { console.error(`Okänt tema: ${key}. Lägg till i THEME_DEFS.`); process.exit(1); }
const OUT = path.join(ROOT, 'data', 'curated', `_theme-${key}-candidates.json`);

// dedup mot allt befintligt i sv.json (alla teman) så vi inte upprepar
const curated = JSON.parse(fs.readFileSync(CURATED, 'utf8'));
const existing = new Set();
for (const theme of Object.values(curated)) for (const list of Object.values(theme)) for (const w of list) existing.add(norm(w));

const out = {};
for (const diff of DIFFS) {
  process.stderr.write(`Genererar ${key}/${diff} ... `);
  let list = [];
  try { list = await ask(def, diff); } catch (e) { process.stderr.write(`FEL: ${e.message}\n`); }
  const seen = new Set();
  const keep = [];
  for (const w of list) { const n = norm(w); if (!existing.has(n) && !seen.has(n)) { seen.add(n); keep.push(w); } }
  out[diff] = keep;
  process.stderr.write(`${keep.length} kandidater\n`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log('\nKandidater skrivna till', path.relative(ROOT, OUT));
for (const d of DIFFS) console.log(`  ${d}: ${out[d].length}`);
