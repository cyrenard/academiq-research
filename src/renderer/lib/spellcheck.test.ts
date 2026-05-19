import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ensureSpellLoaded,
  checkText,
  checkLoaded,
  suggestWord,
  isSpellReady,
  disposeSpell,
  _setSpellInstanceForTests,
  type SpellMatch
} from './spellcheck';

/**
 * The real dictionary is 9 MB and we don't want to read it from disk in
 * the unit suite. Instead we drive a fake nspell instance whose `correct`
 * and `suggest` methods are deterministic — that lets us exercise the
 * tokenizer, the offset math, and the API surface without booting nspell.
 */
function fakeSpell(opts: { knownWords?: string[]; suggestionsFor?: Record<string, string[]> } = {}) {
  const known = new Set((opts.knownWords ?? []).map((w) => w.toLocaleLowerCase('tr-TR')));
  const sug = opts.suggestionsFor ?? {};
  return {
    correct: (word: string) => known.has(word.toLocaleLowerCase('tr-TR')),
    suggest: (word: string) => sug[word.toLocaleLowerCase('tr-TR')] || []
  } as any;
}

beforeEach(() => {
  _setSpellInstanceForTests(null);
});

afterEach(() => {
  disposeSpell();
});

// ─── lifecycle ─────────────────────────────────────────────────────────────

describe('ensureSpellLoaded', () => {
  it('returns the cached instance on subsequent calls', async () => {
    const spell = fakeSpell({ knownWords: ['merhaba'] });
    _setSpellInstanceForTests(spell);
    const a = await ensureSpellLoaded();
    const b = await ensureSpellLoaded();
    expect(a).toBe(b);
  });

  it('fetches aff + dic via the injected fetchImpl when not loaded', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => url.endsWith('.aff')
        ? 'SET UTF-8\nTRY abcde'
        : '1\nmerhaba\n'
    })) as any;
    const spell = await ensureSpellLoaded({
      affUrl: 'http://test/x.aff',
      dicUrl: 'http://test/x.dic',
      fetchImpl
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(spell.correct('merhaba')).toBe(true);
  });

  it('shares a single in-flight load across concurrent callers', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => url.endsWith('.aff') ? 'SET UTF-8\n' : '1\nmerhaba\n'
      };
    }) as any;
    const [a, b] = await Promise.all([
      ensureSpellLoaded({ affUrl: 'a', dicUrl: 'd', fetchImpl }),
      ensureSpellLoaded({ affUrl: 'a', dicUrl: 'd', fetchImpl })
    ]);
    expect(a).toBe(b);
    expect(calls).toBe(2); // one aff + one dic, not four
  });

  it('rejects (and lets a retry happen) on a 404', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })) as any;
    await expect(ensureSpellLoaded({ affUrl: 'x', dicUrl: 'y', fetchImpl })).rejects.toThrow(/HTTP 404/);
    // Retry: fetchImpl was reset
    const fetchImpl2 = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      text: async () => url.endsWith('x') ? 'SET UTF-8\n' : '1\nmerhaba\n'
    })) as any;
    const spell = await ensureSpellLoaded({ affUrl: 'x', dicUrl: 'y', fetchImpl: fetchImpl2 });
    expect(spell.correct('merhaba')).toBe(true);
  });
});

describe('isSpellReady / disposeSpell', () => {
  it('reflects the loaded state', () => {
    expect(isSpellReady()).toBe(false);
    _setSpellInstanceForTests(fakeSpell());
    expect(isSpellReady()).toBe(true);
    disposeSpell();
    expect(isSpellReady()).toBe(false);
  });
});

// ─── checkLoaded ───────────────────────────────────────────────────────────

describe('checkLoaded', () => {
  it('throws when called before the dictionary is loaded', () => {
    expect(() => checkLoaded('herhangi bir metin')).toThrow(/not loaded/);
  });

  it('returns [] for empty text', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['merhaba'] }));
    expect(checkLoaded('')).toEqual([]);
    expect(checkLoaded('   \n  ')).toEqual([]);
  });

  it('flags only unknown words and reports correct offsets', () => {
    _setSpellInstanceForTests(fakeSpell({
      knownWords: ['merhaba', 'dünya'],
      suggestionsFor: { 'dnya': ['dünya', 'denya'] }
    }));
    const matches = checkLoaded('Merhaba dnya nasılsın');
    expect(matches.map((m) => m.text)).toEqual(['dnya', 'nasılsın']);
    expect(matches[0]!.offset).toBe(8);
    expect(matches[0]!.length).toBe(4);
    expect(matches[0]!.replacements).toEqual([{ value: 'dünya' }, { value: 'denya' }]);
  });

  it('caps suggestions to maxSuggestions', () => {
    _setSpellInstanceForTests(fakeSpell({
      suggestionsFor: { 'foo': ['a', 'b', 'c', 'd', 'e', 'f'] }
    }));
    const matches = checkLoaded('Foo', { maxSuggestions: 2 });
    expect(matches[0]!.replacements).toHaveLength(2);
  });

  it('skips ALL-CAPS tokens (acronyms like APA / DOI)', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: [] }));
    const matches = checkLoaded('APA ve DOI standartları');
    expect(matches.find((m) => m.text === 'APA')).toBeUndefined();
    expect(matches.find((m) => m.text === 'DOI')).toBeUndefined();
  });

  it('skips 1-letter tokens', () => {
    _setSpellInstanceForTests(fakeSpell());
    const matches = checkLoaded('a b c');
    expect(matches).toEqual([]);
  });

  it('keeps apostrophes inside a single token (kitap’ı)', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: [] }));
    const matches = checkLoaded("kitap'ı");
    expect(matches).toHaveLength(1);
    expect(matches[0]!.text).toBe("kitap'ı");
  });

  it('preserves Turkish diacritics in offsets (no surrogate drift)', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['öğrenci', 'çalışıyor'] }));
    const matches = checkLoaded('öğrenci çalışıyor xyzz');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.text).toBe('xyzz');
    expect(matches[0]!.offset).toBe(18);
  });

  it('emits LT-compatible match shape', () => {
    _setSpellInstanceForTests(fakeSpell({ suggestionsFor: { yanlis: ['yanlış'] } }));
    const matches = checkLoaded('yanlis');
    expect(matches[0]).toMatchObject<Partial<SpellMatch>>({
      text: 'yanlis',
      message: expect.any(String),
      ruleId: 'NSPELL_TR',
      category: 'TYPOS'
    });
  });

  it('suggests missing-letter and Turkish de-asciified corrections first', async () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['merhaba', 'yanlış', 'çalışma'] }));

    expect(await suggestWord('meraba')).toContain('merhaba');
    expect((await suggestWord('yanlis'))[0]).toBe('yanlış');
    expect((await suggestWord('calisma'))[0]).toBe('çalışma');
  });
});

// ─── checkText (load + check convenience) ──────────────────────────────────

describe('checkText', () => {
  it('loads on demand then runs the check', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true, status: 200,
      text: async () => url.endsWith('.aff') ? 'SET UTF-8\n' : '2\nmerhaba\ndünya\n'
    })) as any;
    const matches = await checkText('merhaba xyzz', {
      affUrl: 'a', dicUrl: 'd', fetchImpl
    });
    expect(matches.map((m) => m.text)).toEqual(['xyzz']);
  });
});
