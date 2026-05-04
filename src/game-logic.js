// Mirrors of selected helpers from index.html, exported so vitest can run them
// without a DOM. Only helpers whose inline counterpart in index.html shares
// the same name and (close to) the same body are kept here. When you change
// one of these, change the inline copy in index.html too.

export const EXHAUSTED = '__EXHAUSTED__';

// ─── Word tracking ───────────────────────────────────────────────────────────

export function normalizeWordList(words) {
  const seen = new Set();
  (Array.isArray(words) ? words : []).forEach(word => {
    const key = String(word || '').trim().toLowerCase();
    if (key) seen.add(key);
  });
  return [...seen];
}

export function mergeUsedWords(...sources) {
  const merged = { sv: [], en: [] };
  sources.forEach(source => {
    ['sv', 'en'].forEach(lang => {
      merged[lang] = normalizeWordList([
        ...merged[lang],
        ...(Array.isArray(source?.[lang]) ? source[lang] : []),
      ]);
    });
  });
  return merged;
}

export function getGlobalUsed(lang) {
  try {
    const raw = localStorage.getItem(`mao_used_${lang}`);
    return new Set(normalizeWordList(raw ? JSON.parse(raw) : []));
  } catch { return new Set(); }
}

export function markWordUsed(lang, word) {
  if (word === EXHAUSTED) return;
  try {
    const used = getGlobalUsed(lang);
    used.add(word.toLowerCase());
    localStorage.setItem(`mao_used_${lang}`, JSON.stringify([...used]));
  } catch {}
}

/**
 * Pick a random unused word from the pool.
 *
 * @param {string}   lang       'sv' | 'en'
 * @param {string}   theme      theme key, e.g. 'standard'
 * @param {string}   diff       'easy' | 'medium' | 'hard' | 'barn'
 * @param {object}   words      WORDS data structure
 * @param {Function} onLowWord  called with (remaining, lang, theme, diff) when ≤30 words remain;
 *                              called at most once per lang/theme/diff combination
 * @returns {string} a word, or EXHAUSTED
 */
export function pickWord(lang, theme, diff, words, onLowWord = null) {
  const pool = diff === 'barn'
    ? (words[lang][theme]?.barn || words[lang].standard.barn)
    : (words[lang][theme]?.[diff] || words[lang].standard[diff]);
  const used = getGlobalUsed(lang);
  let activePool = pool;
  let avail = activePool.filter(w => !used.has(w.toLowerCase()));
  if (!avail.length && theme !== 'standard') {
    activePool = diff === 'barn' ? words[lang].standard.barn : words[lang].standard[diff];
    avail = activePool.filter(w => !used.has(w.toLowerCase()));
  }
  if (!avail.length) return EXHAUSTED;
  const word = avail[Math.floor(Math.random() * avail.length)];
  markWordUsed(lang, word);
  const remaining = avail.length - 1;
  if (remaining <= 30 && onLowWord) {
    const wk = `mao_warned_${lang}_${theme}_${diff}`;
    if (!localStorage.getItem(wk)) {
      localStorage.setItem(wk, '1');
      onLowWord(remaining, lang, theme, diff);
    }
  }
  return word;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export function getStats(lang) {
  try { return JSON.parse(localStorage.getItem(`mao_stats_${lang}`) || '{}'); } catch { return {}; }
}

export function saveStats(lang, stats) {
  try { localStorage.setItem(`mao_stats_${lang}`, JSON.stringify(stats)); } catch {}
}

export function logPassStat(lang, word) {
  const stats = getStats(lang);
  stats[word] = (stats[word] || 0) + 1;
  saveStats(lang, stats);
}

export function getTotalRounds(lang) {
  try { return parseInt(localStorage.getItem(`mao_rounds_${lang}`) || '0'); } catch { return 0; }
}

export function incRounds(lang) {
  localStorage.setItem(`mao_rounds_${lang}`, getTotalRounds(lang) + 1);
}
