import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setSpellcheckEnabled,
  getSpellcheckState,
  subscribeSpellcheck,
  scheduleRecheck,
  runCheckNow,
  shutdownSpellcheck
} from './spellcheck-controller';
import { _setSpellInstanceForTests } from './spellcheck';

function fakeSpell(opts: { knownWords?: string[]; suggestionsFor?: Record<string, string[]> } = {}) {
  const known = new Set((opts.knownWords ?? []).map((w) => w.toLocaleLowerCase('tr-TR')));
  const sug = opts.suggestionsFor ?? {};
  return {
    correct: (word: string) => known.has(word.toLocaleLowerCase('tr-TR')),
    suggest: (word: string) => sug[word.toLocaleLowerCase('tr-TR')] || []
  } as any;
}

/** Replace the body with N consecutive token spans whose
 *  data-offset-start / -end add up to the given text. */
function paintDocument(text: string) {
  document.body.innerHTML = '';
  // One span per word (matching how the engine emits inline-block tokens).
  let cursor = 0;
  const wordRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = wordRe.exec(text)) !== null) {
    const span = document.createElement('span');
    span.textContent = m[0];
    span.dataset.offsetStart = String(m.index);
    span.dataset.offsetEnd = String(m.index + m[0].length);
    document.body.appendChild(span);
    cursor = m.index + m[0].length;
  }
  return cursor;
}

beforeEach(() => {
  shutdownSpellcheck();
  _setSpellInstanceForTests(null);
  document.body.innerHTML = '';
});

afterEach(() => {
  shutdownSpellcheck();
});

describe('setSpellcheckEnabled', () => {
  it('starts disabled with no markers and no matches', () => {
    expect(getSpellcheckState()).toMatchObject({ enabled: false, matches: [] });
  });

  it('enables synchronously when the dictionary is already loaded', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['merhaba'] }));
    paintDocument('merhaba xyzz');
    setSpellcheckEnabled(true);
    const s = getSpellcheckState();
    expect(s.enabled).toBe(true);
    expect(s.matches.map((m) => m.text)).toEqual(['xyzz']);
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(1);
  });

  it('toggling off clears markers and matches', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['merhaba'] }));
    paintDocument('merhaba xyzz');
    setSpellcheckEnabled(true);
    setSpellcheckEnabled(false);
    expect(getSpellcheckState().matches).toEqual([]);
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(0);
  });

  it('publishes state changes to subscribers', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeSpellcheck((s) => seen.push(s.enabled));
    setSpellcheckEnabled(true);
    setSpellcheckEnabled(false);
    unsubscribe();
    // initial snapshot + enable + disable
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen[0]).toBe(false);
    expect(seen.includes(true)).toBe(true);
    expect(seen[seen.length - 1]).toBe(false);
  });
});

describe('runCheckNow / applyMarkers', () => {
  it('marks every span that intersects a misspelling', () => {
    _setSpellInstanceForTests(fakeSpell({
      knownWords: ['öğrenci', 'çalışıyor'],
      suggestionsFor: { 'xyzz': ['xxx'] }
    }));
    paintDocument('öğrenci çalışıyor xyzz');
    setSpellcheckEnabled(true);
    const marked = document.body.querySelectorAll('.aq-spell-error');
    expect(marked.length).toBe(1);
    expect((marked[0] as HTMLElement).textContent).toBe('xyzz');
  });

  it('marks all spans an error spans, not just the first', () => {
    _setSpellInstanceForTests(fakeSpell());
    // single word painted as two adjacent spans (engine may split tokens)
    document.body.innerHTML = '';
    const a = document.createElement('span');
    a.textContent = 'yan';
    a.dataset.offsetStart = '0';
    a.dataset.offsetEnd = '3';
    document.body.appendChild(a);
    const b = document.createElement('span');
    b.textContent = 'lis';
    b.dataset.offsetStart = '3';
    b.dataset.offsetEnd = '6';
    document.body.appendChild(b);
    setSpellcheckEnabled(true);
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(2);
  });

  it('stores the match offset on each marked span', () => {
    _setSpellInstanceForTests(fakeSpell());
    paintDocument('xyzz');
    setSpellcheckEnabled(true);
    const el = document.body.querySelector('.aq-spell-error') as HTMLElement;
    expect(el.dataset.spellOffset).toBe('0');
  });

  it('does nothing when disabled', () => {
    _setSpellInstanceForTests(fakeSpell());
    paintDocument('xyzz');
    runCheckNow();
    expect(getSpellcheckState().matches).toEqual([]);
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(0);
  });
});

describe('scheduleRecheck (debounce)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('coalesces rapid calls into a single check', () => {
    _setSpellInstanceForTests(fakeSpell({ knownWords: ['merhaba'] }));
    paintDocument('merhaba');
    setSpellcheckEnabled(true);
    // Now change the document and schedule three times back-to-back
    paintDocument('merhaba xyzz aaa bbb');
    scheduleRecheck();
    scheduleRecheck();
    scheduleRecheck();
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(0);
    vi.advanceTimersByTime(800);
    // After debounce fires, all three unknowns are marked once.
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(3);
  });

  it('ignores schedule when disabled', () => {
    _setSpellInstanceForTests(fakeSpell());
    setSpellcheckEnabled(false);
    paintDocument('xyzz');
    scheduleRecheck();
    vi.advanceTimersByTime(2000);
    expect(getSpellcheckState().matches).toEqual([]);
  });
});

describe('shutdownSpellcheck', () => {
  it('disables, clears markers, and notifies subscribers', () => {
    _setSpellInstanceForTests(fakeSpell());
    paintDocument('xyzz');
    setSpellcheckEnabled(true);
    const seen: boolean[] = [];
    subscribeSpellcheck((s) => seen.push(s.enabled));
    shutdownSpellcheck();
    expect(getSpellcheckState().enabled).toBe(false);
    expect(document.body.querySelectorAll('.aq-spell-error').length).toBe(0);
    expect(seen.includes(false)).toBe(true);
  });
});
