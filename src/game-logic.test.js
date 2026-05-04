import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EXHAUSTED,
  PTS,
  normalizeWordList,
  mergeUsedWords,
  getGlobalUsed,
  markWordUsed,
  pickWord,
  calcMarkCard,
  calcPassPenalty,
  getStats,
  saveStats,
  logPassStat,
  getTotalRounds,
  incRounds,
  buildSessionLeaderText,
  calcTimerState,
  parseFetchMoreResponse,
  deduplicateWords,
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
});

// ─── calcMarkCard ─────────────────────────────────────────────────────────────

describe('calcMarkCard', () => {
  it('awards 1 pt for easy', () => {
    expect(calcMarkCard({ diff: 'easy', status: null }, 'right').pts).toBe(1);
  });

  it('awards 2 pts for medium', () => {
    expect(calcMarkCard({ diff: 'medium', status: null }, 'right').pts).toBe(2);
  });

  it('awards 3 pts for hard', () => {
    expect(calcMarkCard({ diff: 'hard', status: null }, 'right').pts).toBe(3);
  });

  it('awards 1 pt for barn', () => {
    expect(calcMarkCard({ diff: 'barn', status: null }, 'right').pts).toBe(1);
  });

  it('awards 0 pts on pass', () => {
    expect(calcMarkCard({ diff: 'hard', status: null }, 'pass').pts).toBe(0);
  });

  it('returns null for an already-scored card', () => {
    expect(calcMarkCard({ diff: 'easy', status: 'right' }, 'right')).toBeNull();
    expect(calcMarkCard({ diff: 'easy', status: 'pass' }, 'right')).toBeNull();
  });

  it('returns null for a missing card', () => {
    expect(calcMarkCard(null, 'right')).toBeNull();
    expect(calcMarkCard(undefined, 'right')).toBeNull();
  });

  it('defaults to 1 pt for an unknown diff', () => {
    expect(calcMarkCard({ diff: 'unknown', status: null }, 'right').pts).toBe(1);
  });
});

// ─── PTS constant ─────────────────────────────────────────────────────────────

describe('PTS constant', () => {
  it('has the correct values for all difficulties', () => {
    expect(PTS.easy).toBe(1);
    expect(PTS.medium).toBe(2);
    expect(PTS.hard).toBe(3);
    expect(PTS.barn).toBe(1);
  });
});

// ─── calcPassPenalty ──────────────────────────────────────────────────────────

describe('calcPassPenalty', () => {
  it('subtracts 1 from the current round points', () => {
    expect(calcPassPenalty(5)).toBe(4);
    expect(calcPassPenalty(1)).toBe(0);
  });

  it('never returns a negative value', () => {
    expect(calcPassPenalty(0)).toBe(0);
  });

  it('does not subtract points in barnläge', () => {
    expect(calcPassPenalty(5, 'barn')).toBe(5);
    expect(calcPassPenalty(0, 'barn')).toBe(0);
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

// ─── buildSessionLeaderText ───────────────────────────────────────────────────

describe('buildSessionLeaderText', () => {
  it('returns an empty string for empty scores', () => {
    expect(buildSessionLeaderText({})).toBe('');
  });

  it('returns an empty string for null/undefined', () => {
    expect(buildSessionLeaderText(null)).toBe('');
    expect(buildSessionLeaderText(undefined)).toBe('');
  });

  it('names the player with the highest score', () => {
    expect(buildSessionLeaderText({ Alice: 10, Bob: 5 }))
      .toBe(' · Alice leder med 10 p');
  });

  it('picks the highest score when there are many players', () => {
    const text = buildSessionLeaderText({ Alice: 3, Bob: 12, Carol: 7 });
    expect(text).toBe(' · Bob leder med 12 p');
  });

  it('includes 0-point leaders (single player, no rounds scored)', () => {
    const text = buildSessionLeaderText({ Alice: 0 });
    expect(text).toBe(' · Alice leder med 0 p');
  });
});

// ─── calcTimerState ───────────────────────────────────────────────────────────

describe('calcTimerState', () => {
  it('has no warnings at full time', () => {
    const s = calcTimerState(60, 60);
    expect(s.warn).toBe(false);
    expect(s.danger).toBe(false);
    expect(s.pct).toBeCloseTo(1);
  });

  it('is not warning just above 40 %', () => {
    // 25/60 ≈ 0.4167
    const s = calcTimerState(25, 60);
    expect(s.warn).toBe(false);
    expect(s.danger).toBe(false);
  });

  it('enters warn at exactly 40 % (24/60)', () => {
    const s = calcTimerState(24, 60);
    expect(s.warn).toBe(true);
    expect(s.danger).toBe(false);
  });

  it('is still warn just above 20 % (13/60 ≈ 0.2167)', () => {
    const s = calcTimerState(13, 60);
    expect(s.warn).toBe(true);
    expect(s.danger).toBe(false);
  });

  it('enters danger at exactly 20 % (12/60)', () => {
    const s = calcTimerState(12, 60);
    expect(s.warn).toBe(false);
    expect(s.danger).toBe(true);
  });

  it('is danger below 20 %', () => {
    const s = calcTimerState(5, 60);
    expect(s.warn).toBe(false);
    expect(s.danger).toBe(true);
  });

  it('is danger at 0', () => {
    const s = calcTimerState(0, 60);
    expect(s.warn).toBe(false);
    expect(s.danger).toBe(true);
  });
});

// ─── parseFetchMoreResponse ───────────────────────────────────────────────────

describe('parseFetchMoreResponse', () => {
  it('extracts a plain JSON array', () => {
    expect(parseFetchMoreResponse('["apple","banana"]'))
      .toEqual(['apple', 'banana']);
  });

  it('extracts an array embedded in prose', () => {
    expect(parseFetchMoreResponse('Here are words: ["apple","banana","cherry"]'))
      .toEqual(['apple', 'banana', 'cherry']);
  });

  it('returns [] when no array is found', () => {
    expect(parseFetchMoreResponse('no array here')).toEqual([]);
  });

  it('filters out non-string elements', () => {
    expect(parseFetchMoreResponse('["ok", 42, null, true, "good"]'))
      .toEqual(['ok', 'good']);
  });

  it('returns [] on invalid JSON inside brackets', () => {
    expect(parseFetchMoreResponse('[not valid json]')).toEqual([]);
  });

  it('handles a multiline array', () => {
    const text = `[\n  "one",\n  "two"\n]`;
    expect(parseFetchMoreResponse(text)).toEqual(['one', 'two']);
  });
});

// ─── deduplicateWords ─────────────────────────────────────────────────────────

describe('deduplicateWords', () => {
  it('removes words already in the pool', () => {
    expect(deduplicateWords(['apple', 'banana'], ['apple'], new Set()))
      .toEqual(['banana']);
  });

  it('removes words in globalUsed', () => {
    expect(deduplicateWords(['apple', 'banana'], [], new Set(['banana'])))
      .toEqual(['apple']);
  });

  it('is case-insensitive for pool membership', () => {
    expect(deduplicateWords(['Apple'], ['apple'], new Set())).toEqual([]);
  });

  it('is case-insensitive for globalUsed membership', () => {
    expect(deduplicateWords(['Apple'], [], new Set(['apple']))).toEqual([]);
  });

  it('keeps words absent from both pool and globalUsed', () => {
    expect(deduplicateWords(['cherry', 'date'], ['apple'], new Set(['banana'])))
      .toEqual(['cherry', 'date']);
  });

  it('accepts globalUsed as a plain array as well as a Set', () => {
    expect(deduplicateWords(['apple', 'banana'], [], ['banana']))
      .toEqual(['apple']);
  });

  it('returns [] when all words are duplicates', () => {
    expect(deduplicateWords(['a', 'b'], ['a', 'b'], new Set())).toEqual([]);
  });
});
