import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeHeadingText,
  getBlockText,
  findBibliographyBlockIndex,
  getBlockStartOffset,
  scrollToBibliographyBlock
} from './bibliography-navigation';

afterEach(() => {
  delete (window as any).editor;
  document.body.innerHTML = '';
});

// ─── Pure helpers ────────────────────────────────────────────────────────

describe('normalizeHeadingText', () => {
  it('Turkish lowercases + strips diacritics + collapses whitespace', () => {
    expect(normalizeHeadingText('Kaynakça')).toBe('kaynakca');
    expect(normalizeHeadingText('  KAYNAKÇA  ')).toBe('kaynakca');
    expect(normalizeHeadingText('References')).toBe('references');
    expect(normalizeHeadingText('Bibliography')).toBe('bibliography');
  });

  it('strips combining diacritics (ö → o, ğ → g) but keeps dotless ı', () => {
    const result = normalizeHeadingText('Ölü Bağlantı');
    // ö-ğ are accented forms decomposable via NFD; ı is its own letter (U+0131)
    expect(result).not.toMatch(/[öğ]/);
    expect(result).toContain('o');
    expect(result).toContain('g');
    // ı survives because it doesn't decompose under NFD
    expect(result).toContain('ı');
  });

  it('returns empty for empty/whitespace', () => {
    expect(normalizeHeadingText('')).toBe('');
    expect(normalizeHeadingText('   ')).toBe('');
  });
});

describe('getBlockText', () => {
  it('joins run.text strings for run-based blocks', () => {
    expect(getBlockText({ runs: [{ text: 'Hello ' }, { text: 'World' }] })).toBe('Hello World');
  });

  it('falls back to block.text for legacy blocks', () => {
    expect(getBlockText({ text: 'Plain text' })).toBe('Plain text');
  });

  it('returns empty for null/empty block', () => {
    expect(getBlockText(null)).toBe('');
    expect(getBlockText({})).toBe('');
  });

  it('handles missing run text gracefully', () => {
    expect(getBlockText({ runs: [{}, { text: 'only' }] })).toBe('only');
  });
});

// ─── findBibliographyBlockIndex ──────────────────────────────────────────

describe('findBibliographyBlockIndex', () => {
  it('returns -1 when no editor', () => {
    expect(findBibliographyBlockIndex()).toBe(-1);
  });

  it('returns -1 when editor is not AQ Engine', () => {
    (window as any).editor = { _aqEngine: false, _docModel: { get: () => ({ blocks: [] }) } };
    expect(findBibliographyBlockIndex()).toBe(-1);
  });

  it('detects block via _isBibHeading flag', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [
        { runs: [{ text: 'body' }] },
        { _isBibHeading: true, runs: [{ text: 'whatever' }] }
      ] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(1);
  });

  it('detects Kaynakça heading by text', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [
        { runs: [{ text: 'Body text' }] },
        { runs: [{ text: 'Kaynakça' }] },
        { runs: [{ text: 'Ref 1' }] }
      ] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(1);
  });

  it('detects References heading (case + diacritic insensitive)', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [{ runs: [{ text: 'References' }] }] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(0);
  });

  it('detects Bibliography heading (lowercase)', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [{ runs: [{ text: 'Bibliography' }] }] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(0);
  });

  // KNOWN-LIMITATION: Turkish locale lowercases capital I to ı (dotless),
  // so an ALL-CAPS English "BIBLIOGRAPHY" heading currently does NOT match.
  // Documented here so the test suite reflects the actual current behavior.
  it('KNOWN-LIMITATION: all-caps English heading misses (Turkish locale I→ı)', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [{ runs: [{ text: 'BIBLIOGRAPHY' }] }] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(-1);
  });

  it('returns -1 when no matching block', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [
        { runs: [{ text: 'Just body content' }] },
        { runs: [{ text: 'Conclusion' }] }
      ] }) }
    };
    expect(findBibliographyBlockIndex()).toBe(-1);
  });
});

// ─── getBlockStartOffset ─────────────────────────────────────────────────

describe('getBlockStartOffset', () => {
  it('returns 0 for blockIndex 0', () => {
    (window as any).editor = {
      _docModel: { get: () => ({ blocks: [{ runs: [{ text: 'X' }] }] }) }
    };
    expect(getBlockStartOffset(0)).toBe(0);
  });

  it('returns 0 when no editor', () => {
    expect(getBlockStartOffset(5)).toBe(0);
  });

  it('sums block text lengths + 1 (separator) per preceding block', () => {
    (window as any).editor = {
      _docModel: {
        get: () => ({ blocks: [
          { runs: [{ text: 'abc' }] },    // length 3
          { runs: [{ text: 'de' }] },     // length 2
          { runs: [{ text: 'fghij' }] }   // length 5
        ] })
      }
    };
    // offset to block 2: (3+1) + (2+1) = 7
    expect(getBlockStartOffset(2)).toBe(7);
  });

  it('uses editor._docModel.blockTextLength when available', () => {
    const blockTextLength = vi.fn((i: number) => [10, 5, 7][i] ?? 0);
    (window as any).editor = {
      _docModel: {
        get: () => ({ blocks: [{ runs: [] }, { runs: [] }, { runs: [] }] }),
        blockTextLength
      }
    };
    expect(getBlockStartOffset(2)).toBe(10 + 1 + 5 + 1);
    expect(blockTextLength).toHaveBeenCalledTimes(2);
  });

  it('returns 0 for invalid blockIndex', () => {
    (window as any).editor = {
      _docModel: { get: () => ({ blocks: [{ runs: [] }] }) }
    };
    expect(getBlockStartOffset(-5)).toBe(0);
  });
});

// ─── scrollToBibliographyBlock ───────────────────────────────────────────

describe('scrollToBibliographyBlock', () => {
  it('returns false when bibliography block not found', () => {
    expect(scrollToBibliographyBlock()).toBe(false);
  });

  it('returns false when no .aq-engine-line element exists', () => {
    (window as any).editor = {
      _aqEngine: true,
      _docModel: { get: () => ({ blocks: [{ runs: [{ text: 'Kaynakça' }] }] }) }
    };
    // no DOM line element for block 0
    expect(scrollToBibliographyBlock()).toBe(false);
  });

  it('scrolls the matching DOM line, restores selection, and reflows', () => {
    const restoreSelection = vi.fn();
    const reflow = vi.fn();
    (window as any).editor = {
      _aqEngine: true,
      _docModel: {
        get: () => ({ blocks: [
          { runs: [{ text: 'body' }] },
          { runs: [{ text: 'Kaynakça' }] }
        ] }),
        blockTextLength: (i: number) => [4, 8][i] ?? 0
      },
      _restoreSelection: restoreSelection,
      _reflow: reflow
    };
    const line = document.createElement('div');
    line.className = 'aq-engine-line';
    line.dataset.blockIndex = '1';
    line.scrollIntoView = vi.fn();
    document.body.appendChild(line);

    expect(scrollToBibliographyBlock()).toBe(true);
    expect(line.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth', block: 'center', inline: 'nearest'
    });
    // Offset to block 1: 4 + 1 = 5
    expect(restoreSelection).toHaveBeenCalledWith({
      type: 'aq', from: 5, to: 5, anchor: 5, focus: 5
    });
    expect(reflow).toHaveBeenCalled();
  });
});
