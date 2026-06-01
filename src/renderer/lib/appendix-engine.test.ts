import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyAppendicesToEngine,
  parseAppendicesHTMLToEngineBlocks,
  syncAppendicesToEngine,
  removeAppendixFromEngine,
  scrollToLatestAppendix,
  installAppendixDeleteButtons,
  resolveAppendixIdFromButton
} from './appendix-engine';

afterEach(() => {
  delete (window as any).editor;
  delete (window as any).getActiveEditorInstance;
  delete (window as any).updateAQEngineAppendices;
  document.body.innerHTML = '';
});

function makeEngine(blocks: any[] = []) {
  const replace = vi.fn((next: any[]) => { blocks.length = 0; blocks.push(...next); });
  return {
    _aqEngine: true,
    _docModel: {
      get: () => ({ blocks }),
      replace
    },
    _reflow: vi.fn(),
    emit: vi.fn(),
    _blocks: blocks,
    _replace: replace
  };
}

// ─── applyAppendicesToEngine ────────────────────────────────────────────

const APP2 =
  '<div class="appendix-block"><h1 class="appendix-title">EK-1</h1><p>Birinci</p></div>' +
  '<div class="appendix-block"><h1 class="appendix-title">EK-2</h1><p>İkinci</p></div>';

function lastReplace(editor: any) {
  const calls = editor._replace.mock.calls;
  return calls[calls.length - 1][0] as any[];
}

describe('parseAppendicesHTMLToEngineBlocks', () => {
  it('produces one heading + content paragraph per appendix-block (text preserved)', () => {
    const blocks = parseAppendicesHTMLToEngineBlocks(APP2);
    const headings = blocks.filter((b: any) => b._isAppendixHeading);
    expect(headings).toHaveLength(2);
    expect(headings[0].runs[0].text).toBe('EK-1');
    expect(headings[1].runs[0].text).toBe('EK-2');
    const entries = blocks.filter((b: any) => b._isAppendixEntry);
    expect(entries[0].runs[0].text).toBe('Birinci');
    expect(entries[1].runs[0].text).toBe('İkinci');
  });

  it('falls back to a placeholder entry when an appendix has no content', () => {
    const blocks = parseAppendicesHTMLToEngineBlocks('<div class="appendix-block"><h1 class="appendix-title">EK-1</h1></div>');
    expect(blocks).toHaveLength(2);
    expect(blocks[1].runs[0].text).toBe('Ek içeriği...');
  });

  it('returns [] for empty / non-appendix HTML', () => {
    expect(parseAppendicesHTMLToEngineBlocks('')).toEqual([]);
    expect(parseAppendicesHTMLToEngineBlocks('<p>nope</p>')).toEqual([]);
  });
});

describe('applyAppendicesToEngine', () => {
  it('returns false when no editor available', () => {
    expect(applyAppendicesToEngine(APP2)).toBe(false);
  });

  it('returns false when editor is not AQ Engine', () => {
    (window as any).editor = { _aqEngine: false };
    expect(applyAppendicesToEngine(APP2)).toBe(false);
  });

  it('syncs ALL appendices from the HTML (regression: only one appendix could be added)', () => {
    const editor = makeEngine([{ type: 'paragraph', runs: [{ text: 'body' }] }]);
    (window as any).editor = editor;
    expect(applyAppendicesToEngine(APP2)).toBe(true);
    const next = lastReplace(editor);
    const headings = next.filter((b: any) => b._isAppendixHeading);
    expect(headings).toHaveLength(2);
    expect(headings[0]._appendixId).toBe('appendix-1');
    expect(headings[0].runs[0].text).toBe('EK-1');
    expect(headings[1]._appendixId).toBe('appendix-2');
    expect(headings[1].runs[0].text).toBe('EK-2');
    expect(next[0].runs[0].text).toBe('body'); // base content preserved
    expect(editor._reflow).toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('update');
  });

  it('replaces the existing appendix section instead of duplicating it', () => {
    const editor = makeEngine([
      { type: 'paragraph', runs: [{ text: 'body' }] },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1', runs: [{ text: 'EK-1' }] },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-1' }
    ]);
    (window as any).editor = editor;
    applyAppendicesToEngine(APP2);
    const next = lastReplace(editor);
    expect(next.filter((b: any) => b._isAppendixHeading)).toHaveLength(2);
    expect(next[0].runs[0].text).toBe('body'); // base kept once, not duplicated
  });

  it('overrides window.updateAQEngineAppendices with the corrected parser', () => {
    const editor = makeEngine([{ type: 'paragraph', runs: [{ text: 'x' }] }]);
    (window as any).editor = editor;
    applyAppendicesToEngine(APP2);
    expect(typeof (window as any).updateAQEngineAppendices).toBe('function');
    const e2 = makeEngine([{ type: 'paragraph', runs: [{ text: 'y' }] }]);
    expect((window as any).updateAQEngineAppendices(e2, APP2)).toBe(true);
    expect(lastReplace(e2).filter((b: any) => b._isAppendixHeading)).toHaveLength(2);
  });

  it('uses getActiveEditorInstance when registered', () => {
    const editor = makeEngine([{ type: 'paragraph', runs: [{ text: 'x' }] }]);
    const getActive = vi.fn(() => editor);
    (window as any).getActiveEditorInstance = getActive;
    applyAppendicesToEngine(APP2);
    expect(getActive).toHaveBeenCalled();
  });
});

// ─── removeAppendixFromEngine ───────────────────────────────────────────

describe('removeAppendixFromEngine', () => {
  it('returns false when no editor', () => {
    expect(removeAppendixFromEngine()).toBe(false);
  });

  it('returns false when no appendix blocks in doc model', () => {
    const editor = makeEngine([{ type: 'paragraph' }]);
    (window as any).editor = editor;
    expect(removeAppendixFromEngine()).toBe(false);
  });

  it('removes from first appendix heading to end when appendixId not given', () => {
    const editor = makeEngine([
      { type: 'paragraph', runs: [{ text: 'body' }] },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-1' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-2' },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-2' }
    ]);
    (window as any).editor = editor;
    expect(removeAppendixFromEngine()).toBe(true);
    const result = (editor._replace.mock.calls[0] as any[])[0];
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('paragraph');
  });

  it('removes only the matched appendix when appendixId given', () => {
    const editor = makeEngine([
      { type: 'paragraph' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-1' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-2' },
      { type: 'paragraph', _isAppendixEntry: true, _appendixId: 'appendix-2' }
    ]);
    (window as any).editor = editor;
    expect(removeAppendixFromEngine('appendix-1')).toBe(true);
    const result = (editor._replace.mock.calls[0] as any[])[0];
    expect(result.length).toBe(3);
    expect(result[1]._appendixId).toBe('appendix-2');
  });

  it('returns false when appendixId not found', () => {
    const editor = makeEngine([
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' }
    ]);
    (window as any).editor = editor;
    expect(removeAppendixFromEngine('appendix-missing')).toBe(false);
  });
});

// ─── scrollToLatestAppendix ─────────────────────────────────────────────

describe('scrollToLatestAppendix', () => {
  it('returns false when no editor and no appendix page', () => {
    expect(scrollToLatestAppendix()).toBe(false);
  });

  it('scrolls to engine block when latest appendix heading found', () => {
    const editor = makeEngine([
      { type: 'paragraph' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' },
      { type: 'paragraph' }
    ]);
    (window as any).editor = editor;
    const line = document.createElement('div');
    line.className = 'aq-engine-line';
    line.dataset.blockIndex = '1';
    line.scrollIntoView = vi.fn();
    document.body.appendChild(line);
    expect(scrollToLatestAppendix()).toBe(true);
    expect(line.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  });

  it('falls back to #appendixpage when visible', () => {
    const page = document.createElement('div');
    page.id = 'appendixpage';
    page.style.display = 'block';
    page.scrollIntoView = vi.fn();
    document.body.appendChild(page);
    expect(scrollToLatestAppendix()).toBe(true);
    expect(page.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('returns false when #appendixpage has display:none', () => {
    const page = document.createElement('div');
    page.id = 'appendixpage';
    page.style.display = 'none';
    page.scrollIntoView = vi.fn();
    document.body.appendChild(page);
    expect(scrollToLatestAppendix()).toBe(false);
  });
});

// ─── installAppendixDeleteButtons ───────────────────────────────────────

describe('installAppendixDeleteButtons', () => {
  it('adds button on each engine appendix heading line', () => {
    const editor = makeEngine([
      { type: 'paragraph' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' },
      { type: 'paragraph' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-2' }
    ]);
    (window as any).editor = editor;
    const line1 = document.createElement('div');
    line1.className = 'aq-engine-line';
    line1.dataset.blockIndex = '1';
    const line3 = document.createElement('div');
    line3.className = 'aq-engine-line';
    line3.dataset.blockIndex = '3';
    document.body.appendChild(line1);
    document.body.appendChild(line3);

    const onDelete = vi.fn();
    installAppendixDeleteButtons(onDelete);

    expect(line1.querySelector('.appendix-remove-btn')).not.toBeNull();
    expect(line3.querySelector('.appendix-remove-btn')).not.toBeNull();
    expect(line1.classList.contains('aq-appendix-heading-line')).toBe(true);

    // Click triggers onDelete
    (line1.querySelector('.appendix-remove-btn') as HTMLButtonElement).click();
    expect(onDelete).toHaveBeenCalledWith('appendix-1', 1);
  });

  it('is idempotent — re-installing does not add duplicate buttons', () => {
    const editor = makeEngine([
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'appendix-1' }
    ]);
    (window as any).editor = editor;
    const line = document.createElement('div');
    line.className = 'aq-engine-line';
    line.dataset.blockIndex = '0';
    document.body.appendChild(line);

    installAppendixDeleteButtons(vi.fn());
    installAppendixDeleteButtons(vi.fn());
    expect(line.querySelectorAll('.appendix-remove-btn').length).toBe(1);
  });

  it('handles legacy #appendixbody .appendix-block DOM blocks', () => {
    document.body.innerHTML = `
      <div id="appendixbody">
        <div class="appendix-block" data-appendix-id="appendix-1">A1</div>
        <div class="appendix-block" data-appendix-id="appendix-2">A2</div>
      </div>
    `;
    const onDelete = vi.fn();
    installAppendixDeleteButtons(onDelete);
    const block = document.querySelector('[data-appendix-id="appendix-2"]') as HTMLElement;
    const btn = block.querySelector('.appendix-remove-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(onDelete).toHaveBeenCalledWith('appendix-2', -1);
  });

  it('does not crash when no editor + no DOM', () => {
    expect(() => installAppendixDeleteButtons(vi.fn())).not.toThrow();
  });
});

// ─── resolveAppendixIdFromButton ────────────────────────────────────────

describe('resolveAppendixIdFromButton', () => {
  it('returns dataset.appendixId when set directly', () => {
    const btn = document.createElement('button');
    btn.dataset.appendixId = 'a-direct';
    expect(resolveAppendixIdFromButton(btn)).toBe('a-direct');
  });

  it('falls back to data-appendix-id attribute', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-appendix-id', 'a-attr');
    expect(resolveAppendixIdFromButton(btn)).toBe('a-attr');
  });

  it('falls back to closest .appendix-block dataset', () => {
    document.body.innerHTML = `
      <div class="appendix-block" data-appendix-id="a-block">
        <button class="appendix-remove-btn">X</button>
      </div>
    `;
    const btn = document.querySelector('button') as HTMLButtonElement;
    expect(resolveAppendixIdFromButton(btn)).toBe('a-block');
  });

  it('falls back to engine block via aq-engine-line dataset.blockIndex', () => {
    const editor = makeEngine([
      { type: 'paragraph' },
      { type: 'heading', _isAppendixHeading: true, _appendixId: 'a-engine' }
    ]);
    (window as any).editor = editor;
    document.body.innerHTML = `
      <div class="aq-engine-line" data-block-index="1">
        <button class="appendix-remove-btn">X</button>
      </div>
    `;
    const btn = document.querySelector('button') as HTMLButtonElement;
    expect(resolveAppendixIdFromButton(btn)).toBe('a-engine');
  });

  it('returns empty string when no source resolves', () => {
    const btn = document.createElement('button');
    expect(resolveAppendixIdFromButton(btn)).toBe('');
  });
});
