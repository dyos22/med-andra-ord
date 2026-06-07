#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'wordlists');
const INDEX = path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'words.generated.js');
const CURATED_DIR = path.join(ROOT, 'data', 'curated');

const SOURCES = {
  saldoXml: 'https://svn.spraakbanken.gu.se/sb-arkiv/pub/lmf/saldo/saldo.xml',
  flexCsvZip: 'https://spraakbanken.gu.se/resurser/data/flex.csv.zip',
  scowl2020: 'https://downloads.sourceforge.net/project/wordlist/SCOWL/2020.12.07/scowl-2020.12.07.tar.gz',
};

const THEMES = ['standard', 'djur', 'mat', 'sport', 'natur', 'yrken', 'musik', 'meningar', 'personer', 'lotr'];
// Teman som helt och hållet kommer från data/curated (egennamn/fraser som inte
// finns i de generella ordkorpusarna och därför inte ska valideras mot dem).
const CURATED_THEMES = ['personer', 'meningar', 'musik', 'lotr'];
const DIFFS = ['easy', 'medium', 'hard', 'barn'];
const STANDARD_LIMITS = { easy: 650, medium: 750, hard: 750, barn: 320 };

const STOP_SV = new Set(`
och att det i som på är en jag inte av har för med till den du de så om ett men var mig vi man kan när han
hon ska sig här ha alla nu från vara vad över sin bara skulle eller min detta något utan under mycket där efter
inom redan mellan sedan också eftersom varje vilka dessa sådan sådant vilka
`.trim().split(/\s+/));

const STOP_EN = new Set(`
the of and to in a is that for it on with as are was be by this from at or an have not but they you he she we
all any some into out about up down over under again once very just than then there here who what when where why how
`.trim().split(/\s+/));

const BLOCK_SV = [
  /^(?:[a-zåäö])$/, /^(?:det|den|dom|han|hon|jag|mig|dig|sig|oss|er|ni|vi)$/,
  /(ism|istisk|ologi|grafi|teknik|tion|itet|else|ande|ende|skap|het|barhet)$/,
  /(sjukdom|cancer|krig|vapen|bomb|sex|porr|alkohol|sprit|narkotik|drog|mord|död|hat|rasism)/,
];

const BLOCK_EN = [
  /^[a-z]$/, /(ism|istic|ology|ography|ization|isation|tion|sion|ness|ment|ance|ence)$/,
  /(disease|cancer|war|weapon|bomb|sex|porn|alcohol|liquor|drug|murder|death|hate|racism)/,
];

const SV_CHILD_EXTRA = `
apa björn boll bok brev buss cykel docka delfin drake elefant familj fisk fotboll fågel glass groda hund häst
kaka kanin katt ko koja kompis lejon lampa lek lärare mamma morfar mormor musik pappa pingvin pizza polis regn
robot skola skog skor sol soppa spel stol strand tiger tåg vatten vän äpple öga öra
badboll badkar badstrand bana banan basket berg bil blomma blåbär brandbil bro bröd busskort cykelhjälm dator
dinosaurie djurpark dörr ekorre eld enhörning fjäril flagga flygplan frukt färg godis grotta gurka gunga halsduk
hammare hamster haj helikopter himmel hjärta hockey hopprep hundvalp huvud häxa igelkott isbjörn jordgubbe julgran
kamera karamell kex kikare klossar kompass krokodil kudde kök leksak lillasyster lillebror lördagsgodis måla nalle
ninja nyckel pannkaka papper park pirat pyjamas raket regnbåge riddare rita rutschkana skatt snögubbe soffa sparkcykel
spindel stjärna superhjälte svamp syskon teckning telefon tomat tårta ubåt utflykt val valp viking våffla zoo
`.trim().split(/\s+/);

const EN_CHILD_EXTRA = `
apple astronaut ball banana bear bike book bus cake candy car cat circus cookie cow dinosaur dog dolphin dragon duck
elephant family fish football frog game giraffe gorilla hamster horse icecream island jellyfish kangaroo kite koala
lego lion monkey moon ninja panda park penguin pirate pizza rabbit rainbow robot school shark soccer spaceship spider
star superhero tiger toy train turtle unicorn volcano whale wizard zebra
airplane backpack baseball beach birthday blanket blocks camera castle cave chocolate classroom clown compass cupcake
detective drawing drum fairy flashlight friend ghost guitar helmet helicopter jungle kitten knight ladder lamp magic
map mermaid movie ocean pancake parrot pencil playground popcorn present puppy puzzle rocket sandwich skateboard snowman
soccerball spy sticker strawberry treasure trampoline tree truck videogame waterfall yo-yo zoo
`.trim().split(/\s+/);

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 260 * 1024 * 1024, ...options });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function download(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 1024) return;
  console.log(`Hämtar ${url}`);
  run('curl', ['-L', '--fail', '--retry', '2', '--connect-timeout', '20', '--max-time', '180', '-o', file, url], { stdio: 'inherit' });
}

function extractCurrentWords() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const start = html.indexOf('const PERSONS_DATA =');
  const end = html.indexOf('// ═══════════════════════════════════════════\n//  THEMES CONFIG', start);
  if (start < 0 || end < 0) throw new Error('Kunde inte hitta befintlig WORDS-block i index.html');
  return new Function(`${html.slice(start, end)}\nreturn { PERSONS_DATA, WORDS };`)();
}

function readCurated() {
  const curated = {};
  for (const lang of ['sv', 'en']) {
    const file = path.join(CURATED_DIR, `${lang}.json`);
    if (!fs.existsSync(file)) throw new Error(`Saknar kuraterad fil: ${file}`);
    curated[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return curated;
}

function normWord(word, lang) {
  const text = String(word || '').trim();
  if (!text) return '';
  return lang === 'sv' ? text.toLocaleLowerCase('sv-SE') : text.toLowerCase();
}

function uniq(words, lang) {
  const out = [];
  const seen = new Set();
  for (const word of words) {
    const normalized = normWord(word, lang);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function hash(word) {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function isPlainSv(word) {
  return /^[a-zåäöé]+$/u.test(word) && word.length >= 3 && word.length <= 20 && !STOP_SV.has(word);
}

function isPlainEn(word) {
  return /^[a-z]+$/u.test(word) && word.length >= 3 && word.length <= 20 && !STOP_EN.has(word);
}

function passesBlocks(word, blocks) {
  return !blocks.some(pattern => pattern.test(word));
}

function readSaldo() {
  const xmlPath = path.join(CACHE, 'saldo.xml');
  download(SOURCES.saldoXml, xmlPath);
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const words = new Map();
  const re = /<FormRepresentation>[\s\S]*?<feat att="writtenForm" val="([^"]+)" \/>[\s\S]*?<feat att="partOfSpeech" val="([^"]+)" \/>[\s\S]*?<\/FormRepresentation>/g;
  for (const m of xml.matchAll(re)) {
    const word = normWord(m[1], 'sv');
    const pos = m[2];
    if (!isPlainSv(word) || !passesBlocks(word, BLOCK_SV)) continue;
    const set = words.get(word) || new Set();
    set.add(pos);
    words.set(word, set);
  }
  return words;
}

function readFlex(saldo) {
  const zipPath = path.join(CACHE, 'flex.csv.zip');
  const csvPath = path.join(CACHE, 'flex.csv');
  download(SOURCES.flexCsvZip, zipPath);
  if (!fs.existsSync(csvPath) || fs.statSync(csvPath).size < 1024) {
    fs.writeFileSync(csvPath, run('unzip', ['-p', zipPath]));
  }
  const rows = [];
  const csv = fs.readFileSync(csvPath, 'utf8');
  for (const line of csv.split('\n')) {
    const [raw, novel, news, forum] = line.split('\t');
    const word = normWord(raw, 'sv');
    if (!saldo.has(word) || !isPlainSv(word)) continue;
    const pos = saldo.get(word);
    if (![...pos].some(p => ['nn', 'vb', 'av'].includes(p))) continue;
    const freq = [novel, news, forum].map(Number).filter(Number.isFinite).reduce((a, b) => a + b, 0) / 3;
    if (freq <= 0) continue;
    rows.push({ word, freq, pos: [...pos] });
  }
  rows.sort((a, b) => b.freq - a.freq || a.word.localeCompare(b.word, 'sv'));
  return rows;
}

function readScowl() {
  const tarPath = path.join(CACHE, 'scowl-2020.12.07.tar.gz');
  download(SOURCES.scowl2020, tarPath);
  const levels = [10, 20, 35, 40, 50, 55, 60, 70];
  const byWord = new Map();
  for (const level of levels) {
    for (const prefix of ['english', 'american']) {
      const member = `scowl-2020.12.07/final/${prefix}-words.${level}`;
      let text = '';
      try { text = run('tar', ['-xOzf', tarPath, member]).toString('utf8'); } catch { continue; }
      for (const raw of text.split(/\r?\n/)) {
        const word = normWord(raw, 'en');
        if (!isPlainEn(word) || !passesBlocks(word, BLOCK_EN)) continue;
        const prev = byWord.get(word);
        if (!prev || level < prev.level) byWord.set(word, { word, level });
      }
    }
  }
  return [...byWord.values()].sort((a, b) => a.level - b.level || a.word.localeCompare(b.word));
}

function validSv(word, saldo, allowPhrase = false) {
  const w = normWord(word, 'sv');
  if (!w) return false;
  if (allowPhrase && w.includes(' ')) return w.split(/\s+/).every(part => saldo.has(part) || part.length > 2);
  return saldo.has(w);
}

function validEn(word, scowlSet, allowPhrase = false) {
  const w = normWord(word, 'en');
  if (!w) return false;
  if (allowPhrase && w.includes(' ')) return w.split(/\s+/).every(part => scowlSet.has(part) || part.length > 2);
  return scowlSet.has(w);
}

function selectSv(rows, diff, limit, existing = []) {
  const selected = [...existing];
  const seen = new Set(selected.map(w => normWord(w, 'sv')));
  const ranges = {
    easy:   row => row.freq >= 7 && row.word.length <= 9 && !BLOCK_SV.some(p => p.test(row.word)),
    medium: row => row.freq >= 0.8 && row.freq < 30 && row.word.length >= 5 && row.word.length <= 13,
    hard:   row => row.freq >= 0.05 && row.freq < 8 && row.word.length >= 7 && row.word.length <= 18,
  };
  const scored = rows
    .filter(row => !seen.has(row.word) && ranges[diff](row))
    .map(row => ({ word: row.word, score: difficultyScoreSv(row, diff) + hash(row.word) * 0.08 }))
    .sort((a, b) => a.score - b.score || a.word.localeCompare(b.word, 'sv'));
  for (const item of scored) {
    if (selected.length >= limit) break;
    selected.push(item.word);
    seen.add(item.word);
  }
  return selected.slice(0, limit);
}

function difficultyScoreSv(row, diff) {
  const len = row.word.length;
  const abstract = /(het|skap|else|tion|itet|ologi|ism)$/u.test(row.word) ? 2 : 0;
  if (diff === 'easy') return len * 0.15 - Math.log10(row.freq + 1) + abstract;
  if (diff === 'medium') return Math.abs(9 - len) * 0.2 + Math.abs(Math.log10(row.freq + 1) - 0.7) + abstract * 0.4;
  return -len * 0.08 + Math.log10(row.freq + 1) * 0.5 - abstract * 0.2;
}

function selectEn(rows, diff, limit, existing = []) {
  const selected = [...existing];
  const seen = new Set(selected.map(w => normWord(w, 'en')));
  const ranges = {
    easy: row => row.level <= 35 && row.word.length <= 9,
    medium: row => row.level > 35 && row.level <= 55 && row.word.length <= 13,
    hard: row => row.level > 50 && row.level <= 70 && row.word.length >= 7,
  };
  const scored = rows
    .filter(row => !seen.has(row.word) && ranges[diff](row))
    .map(row => ({ word: row.word, score: row.level + row.word.length * (diff === 'hard' ? -0.35 : 0.2) + hash(row.word) * 3 }))
    .sort((a, b) => a.score - b.score || a.word.localeCompare(b.word));
  for (const item of scored) {
    if (selected.length >= limit) break;
    selected.push(item.word);
    seen.add(item.word);
  }
  return selected.slice(0, limit);
}

function filterSeedList(words, lang, validator, allowPhrase = false) {
  return uniq(words || [], lang).filter(word => validator(word, allowPhrase));
}

function validateCurated(curated) {
  for (const lang of ['sv', 'en']) {
    for (const theme of CURATED_THEMES) {
      for (const diff of DIFFS) {
        const list = curated[lang]?.[theme]?.[diff];
        if (!Array.isArray(list) || !list.length) {
          throw new Error(`Kuraterad lista saknas eller är tom: ${lang}.${theme}.${diff}`);
        }
        const normalized = uniq(list, lang);
        if (normalized.length !== list.length) {
          throw new Error(`Kuraterad lista har dubletter/tomma poster: ${lang}.${theme}.${diff}`);
        }
      }
    }
  }
}

function buildGenerated(current, curated, saldo, flexRows, scowlRows) {
  const scowlSet = new Set(scowlRows.map(row => row.word));
  const out = { sv: {}, en: {} };

  for (const theme of THEMES) {
    out.sv[theme] = {};
    out.en[theme] = {};
    for (const diff of DIFFS) {
      const allowPhrase = theme === 'meningar' || theme === 'personer' || theme === 'lotr';
      out.sv[theme][diff] = filterSeedList(current.WORDS.sv[theme]?.[diff] || [], 'sv', (w, p) => validSv(w, saldo, p) || allowPhrase, allowPhrase);
      out.en[theme][diff] = filterSeedList(current.WORDS.en[theme]?.[diff] || [], 'en', (w, p) => validEn(w, scowlSet, p) || allowPhrase, allowPhrase);
    }
  }

  validateCurated(curated);
  for (const lang of ['sv', 'en']) {
    for (const theme of CURATED_THEMES) {
      for (const diff of DIFFS) {
        out[lang][theme][diff] = curated[lang][theme][diff];
      }
    }
  }

  out.sv.standard.easy = selectSv(flexRows, 'easy', STANDARD_LIMITS.easy, out.sv.standard.easy);
  out.sv.standard.medium = selectSv(flexRows, 'medium', STANDARD_LIMITS.medium, out.sv.standard.medium);
  out.sv.standard.hard = selectSv(flexRows, 'hard', STANDARD_LIMITS.hard, out.sv.standard.hard);
  out.sv.standard.barn = uniq([
    ...out.sv.standard.barn,
    ...out.sv.djur.barn,
    ...out.sv.mat.barn,
    ...out.sv.sport.barn,
    ...out.sv.natur.barn,
    ...SV_CHILD_EXTRA.filter(word => validSv(word, saldo)),
  ], 'sv').slice(0, STANDARD_LIMITS.barn);

  out.en.standard.easy = selectEn(scowlRows, 'easy', STANDARD_LIMITS.easy, out.en.standard.easy);
  out.en.standard.medium = selectEn(scowlRows, 'medium', STANDARD_LIMITS.medium, out.en.standard.medium);
  out.en.standard.hard = selectEn(scowlRows, 'hard', STANDARD_LIMITS.hard, out.en.standard.hard);
  out.en.standard.barn = uniq([
    ...out.en.standard.barn,
    ...out.en.djur.barn,
    ...out.en.mat.barn,
    ...out.en.sport.barn,
    ...out.en.natur.barn,
    ...EN_CHILD_EXTRA.filter(word => validEn(word, scowlSet)),
  ], 'en').slice(0, STANDARD_LIMITS.barn);

  return out;
}

function counts(words) {
  return Object.fromEntries(['sv', 'en'].map(lang => [
    lang,
    Object.fromEntries(THEMES.map(theme => [
      theme,
      Object.fromEntries(DIFFS.map(diff => [diff, words[lang][theme][diff].length])),
    ])),
  ]));
}

function writeOutput(words) {
  const meta = {
    generatedAt: new Date().toISOString(),
    sources: [
      'SALDO 2017-09-19, Språkbanken Text, CC-BY-4.0',
      'Flex 2025-12-06, Språkbanken Text, CC-BY-4.0',
      'SCOWL 2020.12.07, Kevin Atkinson/en-wl, MIT-like/BSD-compatible',
    ],
    counts: counts(words),
  };
  const body = [
    '/* Generated by scripts/generate-wordlists.mjs. Do not edit by hand. */',
    `globalThis.MAO_WORDLIST_META = ${JSON.stringify(meta, null, 2)};`,
    `globalThis.MAO_GENERATED_WORDS = ${JSON.stringify(words, null, 2)};`,
    '',
  ].join('\n');
  fs.writeFileSync(OUT, body);
  console.log(JSON.stringify(meta.counts, null, 2));
}

function mergeExtraWords(words) {
  const file = path.join(CURATED_DIR, 'extra-words.json');
  if (!fs.existsSync(file)) return;
  const extra = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const lang of ['sv', 'en']) {
    for (const [theme, diffs] of Object.entries(extra[lang] || {})) {
      words[lang][theme] ||= {};
      for (const [diff, list] of Object.entries(diffs)) {
        words[lang][theme][diff] = uniq([...(words[lang][theme][diff] || []), ...list], lang);
      }
    }
  }
  console.log('Tilläggs-overlay (extra-words.json) sammanfogad.');
}

ensureDir(CACHE);
const current = extractCurrentWords();
const curated = readCurated();
const saldo = readSaldo();
const flexRows = readFlex(saldo);
const scowlRows = readScowl();
console.log(`SALDO-kandidater: ${saldo.size}`);
console.log(`Flex-kandidater: ${flexRows.length}`);
console.log(`SCOWL-kandidater: ${scowlRows.length}`);
const built = buildGenerated(current, curated, saldo, flexRows, scowlRows);
mergeExtraWords(built);
writeOutput(built);
