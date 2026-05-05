import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EXHAUSTED,
  normalizeWordList,
  mergeUsedWords,
  getGlobalUsed,
  markWordUsed,
  pickWord,
  getStats,
  saveStats,
  logPassStat,
  getTotalRounds,
  incRounds,
} from './game-logic.js';

// jsdom provides localStorage; wipe it before every test for isolation.
beforeEach(() => localStorage.clear());

// ─── Word tracking ────────────────────────────────────────────────────────────

describe('getGlobalUsed', () => {
  it('returns an empty Set when nothing is stored', () => {
    expect(getGlobalUsed('sv').size).toBe(0);
  });

  it('returns previously stored words', () => {
    localStorage.setItem('mao_used_sv', JSON.stringify(['hund', 'katt']));
    const used = getGlobalUsed('sv');
    expect(used.has('hund')).toBe(true);
    expect(used.has('katt')).toBe(true);
  });

  it('is scoped per language', () => {
    localStorage.setItem('mao_used_sv', JSON.stringify(['hund']));
    expect(getGlobalUsed('en').has('hund')).toBe(false);
  });

  it('returns an empty Set on corrupt JSON', () => {
    localStorage.setItem('mao_used_sv', '{not valid json}');
    expect(getGlobalUsed('sv').size).toBe(0);
  });
});

describe('normalizeWordList', () => {
  it('normalizes, trims and deduplicates words', () => {
    expect(normalizeWordList([' Hund ', 'hund', 'KATT', '', null]))
      .toEqual(['hund', 'katt']);
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeWordList(null)).toEqual([]);
  });
});

describe('mergeUsedWords', () => {
  it('merges both languages case-insensitively', () => {
    expect(mergeUsedWords(
      { sv: ['Hund'], en: ['Cat'] },
      { sv: ['hund', 'Katt'], en: ['cat', 'Dog'] },
    )).toEqual({ sv: ['hund', 'katt'], en: ['cat', 'dog'] });
  });

  it('keeps missing languages as empty arrays', () => {
    expect(mergeUsedWords({ sv: ['hund'] })).toEqual({ sv: ['hund'], en: [] });
  });
});

describe('markWordUsed', () => {
  it('persists the word in lowercase', () => {
    markWordUsed('sv', 'Hund');
    expect(getGlobalUsed('sv').has('hund')).toBe(true);
  });

  it('accumulates across multiple calls', () => {
    markWordUsed('sv', 'hund');
    markWordUsed('sv', 'katt');
    const used = getGlobalUsed('sv');
    expect(used.has('hund')).toBe(true);
    expect(used.has('katt')).toBe(true);
  });

  it('does not mark the EXHAUSTED sentinel', () => {
    markWordUsed('sv', EXHAUSTED);
    expect(getGlobalUsed('sv').size).toBe(0);
  });

  it('is scoped per language', () => {
    markWordUsed('sv', 'hund');
    expect(getGlobalUsed('en').has('hund')).toBe(false);
  });
});

// ─── pickWord ─────────────────────────────────────────────────────────────────

const MINI_WORDS = {
  sv: {
    standard: {
      easy:   ['alpha', 'beta', 'gamma'],
      medium: ['delta'],
      hard:   ['epsilon'],
      barn:   ['zeta'],
    },
  },
};

describe('pickWord', () => {
  it('returns a word from the correct pool', () => {
    const w = pickWord('sv', 'standard', 'easy', MINI_WORDS);
    expect(['alpha', 'beta', 'gamma']).toContain(w);
  });

  it('marks the returned word as used', () => {
    const w = pickWord('sv', 'standard', 'easy', MINI_WORDS);
    expect(getGlobalUsed('sv').has(w.toLowerCase())).toBe(true);
  });

  it('never returns a word that is already used', () => {
    markWordUsed('sv', 'alpha');
    markWordUsed('sv', 'beta');
    expect(pickWord('sv', 'standard', 'easy', MINI_WORDS)).toBe('gamma');
  });

  it('returns EXHAUSTED when every word in the pool has been used', () => {
    markWordUsed('sv', 'alpha');
    markWordUsed('sv', 'beta');
    markWordUsed('sv', 'gamma');
    expect(pickWord('sv', 'standard', 'easy', MINI_WORDS)).toBe(EXHAUSTED);
  });

  it('falls back to the standard pool when a theme pool is exhausted', () => {
    const words = {
      sv: {
        standard: { easy: ['alpha'], medium: [], hard: [], barn: ['zeta'] },
        djur: { easy: ['cat'], medium: [], hard: [], barn: [] },
      },
    };
    markWordUsed('sv', 'cat');
    expect(pickWord('sv', 'djur', 'easy', words)).toBe('alpha');
  });

  it('uses the barn pool when diff is "barn"', () => {
    expect(pickWord('sv', 'standard', 'barn', MINI_WORDS)).toBe('zeta');
  });

  it('does not mark EXHAUSTED as used (pool stays intact)', () => {
    ['alpha', 'beta', 'gamma'].forEach(w => markWordUsed('sv', w));
    pickWord('sv', 'standard', 'easy', MINI_WORDS); // returns EXHAUSTED
    // EXHAUSTED must not appear in the used set
    expect(getGlobalUsed('sv').has(EXHAUSTED.toLowerCase())).toBe(false);
  });

  it('fires onLowWord when ≤30 words remain after picking', () => {
    const onLow = vi.fn();
    // 32 words → pick 1 → 31 remain (above threshold, no warning)
    //            pick 2 → 30 remain (at threshold, warning fires)
    const pool = Array.from({ length: 32 }, (_, i) => `word${i}`);
    const words = { sv: { standard: { easy: pool, medium: [], hard: [], barn: [] } } };

    pickWord('sv', 'standard', 'easy', words, onLow);
    expect(onLow).not.toHaveBeenCalled();

    pickWord('sv', 'standard', 'easy', words, onLow);
    expect(onLow).toHaveBeenCalledTimes(1);
    expect(onLow).toHaveBeenCalledWith(30, 'sv', 'standard', 'easy');
  });

  it('fires onLowWord at most once per lang/theme/diff combination', () => {
    const onLow = vi.fn();
    const pool = Array.from({ length: 32 }, (_, i) => `word${i}`);
    const words = { sv: { standard: { easy: pool, medium: [], hard: [], barn: [] } } };

    // exhaust two words to get to the ≤30 threshold
    pickWord('sv', 'standard', 'easy', words, onLow);
    pickWord('sv', 'standard', 'easy', words, onLow); // warning fires here

    // further picks should NOT fire onLow again
    pickWord('sv', 'standard', 'easy', words, onLow);
    pickWord('sv', 'standard', 'easy', words, onLow);
    expect(onLow).toHaveBeenCalledTimes(1);
  });

  it('does not fire onLowWord when pool stays above 30', () => {
    const onLow = vi.fn();
    // Pool of 33: first pick leaves 32 remaining — no warning
    const pool = Array.from({ length: 33 }, (_, i) => `word${i}`);
    const words = { sv: { standard: { easy: pool, medium: [], hard: [], barn: [] } } };
    pickWord('sv', 'standard', 'easy', words, onLow);
    expect(onLow).not.toHaveBeenCalled();
  });

  it('clears the warned flag when the pool grows past 60 again', () => {
    // Simulera att varning redan utfärdats (t.ex. tidigare session)
    localStorage.setItem('mao_warned_sv_standard_easy', '1');
    // Stor pool – >60 ord kvar efter pick → flaggan ska rensas
    const pool = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const words = { sv: { standard: { easy: pool, medium: [], hard: [], barn: [] } } };
    pickWord('sv', 'standard', 'easy', words, () => {});
    expect(localStorage.getItem('mao_warned_sv_standard_easy')).toBe(null);
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('getStats / saveStats', () => {
  it('returns an empty object when nothing is stored', () => {
    expect(getStats('sv')).toEqual({});
  });

  it('round-trips stats through localStorage', () => {
    saveStats('sv', { hund: 3 });
    expect(getStats('sv')).toEqual({ hund: 3 });
  });

  it('returns an empty object on corrupt JSON', () => {
    localStorage.setItem('mao_stats_sv', '{bad}');
    expect(getStats('sv')).toEqual({});
  });

  it('is scoped per language', () => {
    saveStats('sv', { hund: 1 });
    expect(getStats('en')).toEqual({});
  });
});

describe('logPassStat', () => {
  it('increments the count for a word', () => {
    logPassStat('sv', 'hund');
    logPassStat('sv', 'hund');
    expect(getStats('sv').hund).toBe(2);
  });

  it('tracks multiple words independently', () => {
    logPassStat('sv', 'hund');
    logPassStat('sv', 'katt');
    logPassStat('sv', 'hund');
    expect(getStats('sv')).toEqual({ hund: 2, katt: 1 });
  });
});

describe('getTotalRounds / incRounds', () => {
  it('starts at 0', () => {
    expect(getTotalRounds('sv')).toBe(0);
  });

  it('increments by 1 each call', () => {
    incRounds('sv');
    incRounds('sv');
    expect(getTotalRounds('sv')).toBe(2);
  });

  it('is scoped per language', () => {
    incRounds('sv');
    expect(getTotalRounds('en')).toBe(0);
  });
});
