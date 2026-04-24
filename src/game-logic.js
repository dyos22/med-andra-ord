// Pure game logic extracted from index.html.
// Functions here take all dependencies as parameters so they can be tested
// without a DOM or global state. Implementations must stay in sync with
// their counterparts in index.html.

export const EXHAUSTED = '__EXHAUSTED__';

export const PTS = { easy: 1, medium: 2, hard: 3, barn: 1 };

// ─── Word tracking ───────────────────────────────────────────────────────────

export function getGlobalUsed(lang) {
  try {
    const raw = localStorage.getItem(`mao_used_${lang}`);
    return new Set(raw ? JSON.parse(raw) : []);
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
  const avail = pool.filter(w => !used.has(w.toLowerCase()));
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

// ─── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Calculate the point result of marking a card right or pass.
 * Returns null when the card is already scored or missing (no-op).
 */
export function calcMarkCard(card, status) {
  if (!card || card.status) return null;
  return { pts: status === 'right' ? (PTS[card.diff] || 1) : 0 };
}

/** Apply the pass penalty: subtract 1 point, floor at 0. */
export function calcPassPenalty(roundPts) {
  return Math.max(0, roundPts - 1);
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

// ─── Session ─────────────────────────────────────────────────────────────────

/**
 * Return the " · Name leder med N p" suffix used in the session-resume banner,
 * or an empty string when scores is empty/null.
 */
export function buildSessionLeaderText(scores) {
  const leader = Object.entries(scores || {}).sort((a, b) => b[1] - a[1])[0];
  return leader ? ` · ${leader[0]} leder med ${leader[1]} p` : '';
}

// ─── Timer ───────────────────────────────────────────────────────────────────

/**
 * Derive the visual warning state from the current timer value.
 * warn:   40 % ≥ pct > 20 %
 * danger: pct ≤ 20 %
 */
export function calcTimerState(timerLeft, timerDur) {
  const pct = timerLeft / timerDur;
  return {
    pct,
    warn: pct <= 0.4 && pct > 0.2,
    danger: pct <= 0.2,
  };
}

// ─── Claude API response helpers ─────────────────────────────────────────────

/**
 * Extract the JSON word array from a raw Claude API response text.
 * Returns [] when no array is found or parsing fails.
 */
export function parseFetchMoreResponse(text) {
  const m = text.match(/\[[\s\S]*]/);
  if (!m) return [];
  try {
    return JSON.parse(m[0]).filter(w => typeof w === 'string');
  } catch { return []; }
}

/**
 * Filter incoming words down to those not already in the pool or globally used.
 * Case-insensitive on both sides.
 */
export function deduplicateWords(fresh, existingPool, globalUsed) {
  const poolSet = new Set(existingPool.map(x => x.toLowerCase()));
  const usedSet = globalUsed instanceof Set ? globalUsed : new Set(globalUsed);
  return fresh.filter(w => !poolSet.has(w.toLowerCase()) && !usedSet.has(w.toLowerCase()));
}
