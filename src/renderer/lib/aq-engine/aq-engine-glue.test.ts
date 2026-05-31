import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeAQAppendixTitle,
  isAQAppendixHeading,
  findAQAppendixRange,
  buildAppendixHTML,
  getAppendixTitleText,
  countAppendicesInHTML,
  appendAppendixHTML,
  renumberAppendicesHTML,
  normalizeAQEngineAppendixBlocks,
  renumberAQEngineAppendicesInBlocks,
  updateAQEngineAppendices,
  deleteAQEngineAppendix
} from './aq-engine-glue';
import { appStore } from '../app-store';

describe('aq-engine-glue', () => {
  beforeEach(() => {
    appStore.setState({
      docs: [
        { id: 'doc-1', content: '', appendicesHTML: '<div class="appendix-block" data-appendix-id="appendix-1"><h1 class="appendix-title">EK-1</h1></div>' }
      ],
      curDoc: 'doc-1'
    });
  });

  it('normalizeAQAppendixTitle replaces Turkish characters', () => {
    expect(normalizeAQAppendixTitle('ÇıŞĞÜÖ')).toBe('cisguo');
    expect(normalizeAQAppendixTitle('  Ekler  ')).toBe('ekler');
  });

  it('isAQAppendixHeading detects appendix heading', () => {
    expect(isAQAppendixHeading({ runs: [{ text: 'Ek 1' }] })).toBe(true);
    expect(isAQAppendixHeading({ runs: [{ text: 'Appendix A' }] })).toBe(true);
    expect(isAQAppendixHeading({ runs: [{ text: 'Random Text' }] })).toBe(false);
  });

  it('findAQAppendixRange locates correct indices', () => {
    const blocks = [
      { type: 'paragraph', runs: [{ text: 'hello' }] },
      { type: 'heading', runs: [{ text: 'Ek-1' }] },
      { type: 'paragraph', runs: [{ text: 'content' }] }
    ];
    expect(findAQAppendixRange(blocks)).toEqual({ start: 1, end: 3 });
    expect(findAQAppendixRange([])).toEqual({ start: -1, end: -1 });
  });

  it('buildAppendixHTML and getAppendixTitleText build expected markup', () => {
    expect(getAppendixTitleText(3)).toBe('EK-3');
    expect(buildAppendixHTML(2)).toContain('data-appendix-id="appendix-2"');
    expect(buildAppendixHTML(2)).toContain('<h1 class="appendix-title">EK-2</h1>');
  });

  it('countAppendicesInHTML and appendAppendixHTML work as expected', () => {
    const initial = buildAppendixHTML(1);
    expect(countAppendicesInHTML(initial)).toBe(2);
    const appended = appendAppendixHTML(initial);
    expect(countAppendicesInHTML(appended)).toBe(4);
  });

  it('renumberAppendicesHTML updates index references', () => {
    const dirty = '<div class="appendix-block" data-appendix-id="appendix-9"><h1 class="appendix-title">EK-X</h1></div>';
    const clean = renumberAppendicesHTML(dirty);
    expect(clean).toContain('data-appendix-id="appendix-1"');
    expect(clean).toContain('EK-1');
  });

  it('normalizeAQEngineAppendixBlocks configures heading level/runs', () => {
    const raw = [
      { type: 'heading', runs: [{ text: 'Ek' }] },
      { type: 'paragraph', runs: [{ text: 'desc' }] }
    ];
    const normalized = normalizeAQEngineAppendixBlocks(raw);
    expect(normalized[0]).toEqual({
      type: 'heading',
      level: 1,
      pageBreak: true,
      align: 'center',
      _isAppendixHeading: true,
      _appendixId: 'appendix-1',
      runs: [{ text: 'EK-1', bold: true }]
    });
  });

  it('renumberAQEngineAppendicesInBlocks updates heading index and runs', () => {
    const raw = [
      { type: 'heading', _isAppendixHeading: true, runs: [{ text: 'EK-9' }] },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-9' }
    ];
    const renumbered = renumberAQEngineAppendicesInBlocks(raw);
    expect(renumbered[0]._appendixId).toBe('appendix-1');
    expect(renumbered[0].runs).toEqual([{ text: 'EK-1', bold: true }]);
    expect(renumbered[1]._appendixId).toBe('appendix-1');
  });

  it('updateAQEngineAppendices replaces editor blocks', () => {
    const blockList: any[] = [];
    const docModel = {
      get: () => ({ blocks: blockList }),
      replace: vi.fn((newBlocks) => {
        blockList.push(...newBlocks);
      })
    };
    const editor = {
      _aqEngine: true,
      _docModel: docModel,
      _reflow: vi.fn(),
      emit: vi.fn()
    };

    updateAQEngineAppendices(editor, '');
    expect(docModel.replace).toHaveBeenCalledWith([]);

    updateAQEngineAppendices(editor, '<div>some content</div>');
    expect(docModel.replace).toHaveBeenCalled();
    expect(editor._reflow).toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('update');
  });

  it('deleteAQEngineAppendix modifies block list and updates store', () => {
    const blockList = [
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1', runs: [{ text: 'EK-1' }] },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-1' }
    ];
    const docModel = {
      get: () => ({ blocks: blockList }),
      replace: vi.fn((newBlocks) => {
        blockList.length = 0;
        blockList.push(...newBlocks);
      })
    };
    const editor = {
      _aqEngine: true,
      _docModel: docModel,
      _reflow: vi.fn(),
      emit: vi.fn()
    };

    deleteAQEngineAppendix(editor, 'appendix-1', 0);
    expect(blockList.length).toBe(0);
    expect(docModel.replace).toHaveBeenCalledWith([]);
    expect(appStore.getState().docs[0].appendicesHTML).toBe('');
  });
});
