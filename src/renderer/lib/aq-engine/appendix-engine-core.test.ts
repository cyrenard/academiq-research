import { describe, it, expect, vi } from 'vitest';
import {
  normalizeAQAppendixTitle,
  getAppendixTitleText,
  isAQAppendixHeading,
  renumberAppendicesHTML,
  renumberAQEngineAppendicesInBlocks,
  deleteAQEngineAppendix,
  findAQAppendixRange,
  normalizeAQEngineAppendixBlocks,
  updateAQEngineAppendices
} from './appendix-engine-core';

describe('normalizeAQAppendixTitle', () => {
  it('lowercases and folds Turkish letters', () => {
    expect(normalizeAQAppendixTitle('  EK-Şğüöç  ')).toBe('ek-sguoc');
    expect(normalizeAQAppendixTitle(null)).toBe('');
  });
});

describe('getAppendixTitleText', () => {
  it('renders EK-N with a minimum of 1', () => {
    expect(getAppendixTitleText(1)).toBe('EK-1');
    expect(getAppendixTitleText(3)).toBe('EK-3');
    expect(getAppendixTitleText(0)).toBe('EK-1');
    expect(getAppendixTitleText('2')).toBe('EK-2');
    expect(getAppendixTitleText(undefined)).toBe('EK-1');
  });
});

describe('isAQAppendixHeading', () => {
  it('detects the explicit flag', () => {
    expect(isAQAppendixHeading({ _isAppendixHeading: true })).toBe(true);
  });
  it('detects EK / EKLER / APPENDIX text headings', () => {
    expect(isAQAppendixHeading({ runs: [{ text: 'EK' }] })).toBe(true);
    expect(isAQAppendixHeading({ runs: [{ text: 'EKLER' }] })).toBe(true);
    expect(isAQAppendixHeading({ runs: [{ text: 'EK-1' }] })).toBe(true);
    expect(isAQAppendixHeading({ runs: [{ text: 'Appendix A' }] })).toBe(true);
  });
  it('rejects non-appendix text and null', () => {
    expect(isAQAppendixHeading({ runs: [{ text: 'Giriş' }] })).toBe(false);
    expect(isAQAppendixHeading(null)).toBe(false);
  });
});

describe('renumberAQEngineAppendicesInBlocks', () => {
  it('renumbers headings sequentially and tags entries with the current id', () => {
    const blocks = [
      { type: 'paragraph', runs: [{ text: 'intro' }] },
      { _isAppendixHeading: true, runs: [{ text: 'whatever' }] },
      { _isAppendixEntry: true, runs: [{ text: 'a1 body' }] },
      { _isAppendixHeading: true, runs: [{ text: 'whatever2' }] },
      { _appendixId: 'stale', runs: [{ text: 'a2 body' }] }
    ];
    const out = renumberAQEngineAppendicesInBlocks(blocks);
    expect(out).toBe(blocks); // mutates + returns same array
    expect(out[1]._appendixId).toBe('appendix-1');
    expect(out[1].type).toBe('heading');
    expect(out[1].level).toBe(1);
    expect(out[1].pageBreak).toBe(true);
    expect(out[1].align).toBe('center');
    expect(out[1].runs).toEqual([{ text: 'EK-1', bold: true }]);
    expect(out[2]._appendixId).toBe('appendix-1');
    expect(out[2]._isAppendixEntry).toBe(true);
    expect(out[3]._appendixId).toBe('appendix-2');
    expect(out[3].runs).toEqual([{ text: 'EK-2', bold: true }]);
    expect(out[4]._appendixId).toBe('appendix-2');
  });

  it('handles non-array input', () => {
    expect(renumberAQEngineAppendicesInBlocks(null as any)).toEqual([]);
  });
});

describe('renumberAppendicesHTML', () => {
  it('returns empty for blank input', () => {
    expect(renumberAppendicesHTML('')).toBe('');
    expect(renumberAppendicesHTML(null)).toBe('');
  });

  it('renumbers .appendix-block headings and ids', () => {
    const html =
      '<div class="appendix-block" data-appendix-id="appendix-9">' +
      '<h1 class="appendix-title">EK-9</h1><p>a</p></div>' +
      '<div class="appendix-block" data-appendix-id="appendix-7">' +
      '<h1 class="appendix-title">EK-7</h1><p>b</p></div>';
    const out = renumberAppendicesHTML(html);
    expect(out).toContain('data-appendix-id="appendix-1"');
    expect(out).toContain('data-appendix-id="appendix-2"');
    expect(out).toContain('>EK-1<');
    expect(out).toContain('>EK-2<');
    expect(out).not.toContain('appendix-9');
  });

  it('renumbers loose h1.appendix-title when no blocks present', () => {
    const html = '<h1 class="appendix-title">x</h1><h1 class="appendix-title">y</h1>';
    const out = renumberAppendicesHTML(html);
    expect(out).toContain('data-appendix-id="appendix-1"');
    expect(out).toContain('data-appendix-id="appendix-2"');
    expect(out).toContain('>EK-1<');
    expect(out).toContain('>EK-2<');
  });
});

describe('deleteAQEngineAppendix', () => {
  const makeEditor = (blocks: any[]) => {
    let model = { blocks };
    return {
      _aqEngine: {},
      _docModel: {
        get: () => model,
        replace: vi.fn((next: any[]) => { model = { blocks: next }; })
      },
      _reflow: vi.fn(),
      emit: vi.fn(),
      get blocks() { return model.blocks; }
    };
  };
  const deps = () => ({
    getDocRecord: vi.fn(() => null),
    sanitize: vi.fn((h: string) => h),
    save: vi.fn()
  });

  it('returns false when the editor lacks the aq-engine', () => {
    expect(deleteAQEngineAppendix(null, '', 0, deps())).toBe(false);
    expect(deleteAQEngineAppendix({ _docModel: {} }, '', 0, deps())).toBe(false);
  });

  it('deletes a heading block + its entries by appendixId and renumbers', () => {
    const editor = makeEditor([
      { type: 'paragraph', runs: [{ text: 'body' }] },
      { _isAppendixHeading: true, _appendixId: 'appendix-1', runs: [{ text: 'EK-1' }] },
      { _isAppendixEntry: true, _appendixId: 'appendix-1', runs: [{ text: 'a1' }] },
      { _isAppendixHeading: true, _appendixId: 'appendix-2', runs: [{ text: 'EK-2' }] },
      { _isAppendixEntry: true, _appendixId: 'appendix-2', runs: [{ text: 'a2' }] }
    ]);
    const d = deps();
    const ok = deleteAQEngineAppendix(editor, 'appendix-1', -1, d);
    expect(ok).toBe(true);
    // first appendix (+ its entry) removed; the remaining one renumbered to 1
    expect(editor.blocks).toHaveLength(3);
    expect(editor.blocks[1]._appendixId).toBe('appendix-1');
    expect(editor.blocks[1].runs).toEqual([{ text: 'EK-1', bold: true }]);
    expect(editor._reflow).toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('update');
    expect(d.save).toHaveBeenCalled();
  });

  it('falls back to blockIndex when appendixId is empty (parseInt coercion)', () => {
    const editor = makeEditor([
      { _isAppendixHeading: true, _appendixId: 'appendix-1', runs: [{ text: 'EK-1' }] },
      { _isAppendixHeading: true, _appendixId: 'appendix-2', runs: [{ text: 'EK-2' }] }
    ]);
    // string blockIndex must still match via parseInt('1', 10)
    const ok = deleteAQEngineAppendix(editor, '', '1' as any, deps());
    expect(ok).toBe(true);
    expect(editor.blocks).toHaveLength(1);
    expect(editor.blocks[0]._appendixId).toBe('appendix-1');
  });

  it('returns false when nothing matches', () => {
    const editor = makeEditor([{ type: 'paragraph', runs: [{ text: 'x' }] }]);
    expect(deleteAQEngineAppendix(editor, 'appendix-9', -1, deps())).toBe(false);
  });

  it('also prunes appendicesHTML from the doc record', () => {
    const editor = makeEditor([
      { _isAppendixHeading: true, _appendixId: 'appendix-1', runs: [{ text: 'EK-1' }] },
      { _isAppendixHeading: true, _appendixId: 'appendix-2', runs: [{ text: 'EK-2' }] }
    ]);
    const doc: any = {
      appendicesHTML:
        '<div class="appendix-block" data-appendix-id="appendix-1"><h1 class="appendix-title">EK-1</h1></div>' +
        '<div class="appendix-block" data-appendix-id="appendix-2"><h1 class="appendix-title">EK-2</h1></div>'
    };
    const d = { getDocRecord: vi.fn(() => doc), sanitize: vi.fn((h: string) => h), save: vi.fn() };
    const ok = deleteAQEngineAppendix(editor, 'appendix-1', -1, d);
    expect(ok).toBe(true);
    expect(d.sanitize).toHaveBeenCalled();
    expect(doc.appendicesHTML).not.toContain('appendix-2');
    // surviving block renumbered to appendix-1 / EK-1
    expect(doc.appendicesHTML).toContain('data-appendix-id="appendix-1"');
    expect(doc.appendicesHTML).toContain('>EK-1<');
  });
});

describe('findAQAppendixRange & normalizeAQEngineAppendixBlocks & updateAQEngineAppendices', () => {
  it('findAQAppendixRange finds the index of first heading which is an appendix', () => {
    const blocks = [
      { type: 'paragraph' },
      { type: 'heading', runs: [{ text: 'Giriş' }] },
      { type: 'heading', _isAppendixHeading: true, runs: [{ text: 'EK-1' }] },
      { type: 'paragraph', _appendixId: 'appendix-1' }
    ];
    const range = findAQAppendixRange(blocks);
    expect(range.start).toBe(2);
    expect(range.end).toBe(4);
  });

  it('normalizeAQEngineAppendixBlocks formats headers and body blocks', () => {
    const blocks = [
      { type: 'heading', runs: [{ text: 'Ek' }] },
      { type: 'paragraph', runs: [{ text: 'Entry content' }] }
    ];
    const normalized = normalizeAQEngineAppendixBlocks(blocks);
    expect(normalized[0]._isAppendixHeading).toBe(true);
    expect(normalized[0]._appendixId).toBe('appendix-1');
    expect(normalized[0].runs[0].text).toBe('EK-1');
    expect(normalized[1]._isAppendixEntry).toBe(true);
    expect(normalized[1]._appendixId).toBe('appendix-1');
  });

  it('updateAQEngineAppendices updates blocks in the editor doc model', () => {
    const editor = {
      _aqEngine: {},
      _docModel: {
        get: () => ({
          blocks: [
            { type: 'paragraph', runs: [{ text: 'intro' }] },
            { type: 'heading', _isAppendixHeading: true, runs: [{ text: 'EK-1' }] }
          ]
        }),
        replace: vi.fn()
      },
      _reflow: vi.fn(),
      emit: vi.fn()
    };

    const compat = {
      htmlToBlocks: (html: string) => [
        { type: 'heading', runs: [{ text: 'New Ek' }] }
      ]
    };

    const ok = updateAQEngineAppendices(editor, 'New Appendix HTML', compat);
    expect(ok).toBe(true);
    expect(editor._docModel.replace).toHaveBeenCalled();
    expect(editor._reflow).toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('update');
  });
});
