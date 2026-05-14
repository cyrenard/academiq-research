import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  applyAppendicesToEngine,
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

describe('applyAppendicesToEngine', () => {
  it('returns false when no editor available', () => {
    expect(applyAppendicesToEngine('<x/>', () => 0)).toBe(false);
  });

  it('returns false when editor is not AQ Engine', () => {
    (window as any).editor = { _aqEngine: false };
    expect(applyAppendicesToEngine('<x/>', () => 0)).toBe(false);
  });

  it('delegates to legacy updateAQEngineAppendices when present', () => {
    const fake = vi.fn(() => true);
    (window as any).editor = { _aqEngine: true };
    (window as any).updateAQEngineAppendices = fake;
    const result = applyAppendicesToEngine('<x/>', () => 0);
    expect(result).toBe(true);
    expect(fake).toHaveBeenCalledWith((window as any).editor, '<x/>');
  });

  it('appends a new appendix heading + paragraph via docModel.replace', () => {
    const editor = makeEngine([{ type: 'paragraph', runs: [{ text: 'pre' }] }]);
    (window as any).editor = editor;
    const getCount = vi.fn(() => 2);
    expect(applyAppendicesToEngine('html', getCount)).toBe(true);
    expect(editor._replace).toHaveBeenCalled();
    const appended = (editor._replace.mock.calls[0] as any[])[0];
    expect(appended.length).toBe(3);
    expect(appended[1].type).toBe('heading');
    expect(appended[1]._isAppendixHeading).toBe(true);
    expect(appended[1]._appendixId).toBe('appendix-2');
    expect(appended[1].runs[0].text).toBe('EK-2');
    expect(appended[2].type).toBe('paragraph');
    expect(appended[2]._isAppendixEntry).toBe(true);
    expect(editor._reflow).toHaveBeenCalled();
    expect(editor.emit).toHaveBeenCalledWith('update');
  });

  it('uses appendix index from getCount but never less than 1', () => {
    const editor = makeEngine();
    (window as any).editor = editor;
    applyAppendicesToEngine('html', () => 0); // count 0 should still produce appendix-1
    const appended = (editor._replace.mock.calls[0] as any[])[0];
    expect(appended[0]._appendixId).toBe('appendix-1');
  });

  it('uses getActiveEditorInstance when registered', () => {
    const editor = makeEngine();
    const getActive = vi.fn(() => editor);
    (window as any).getActiveEditorInstance = getActive;
    applyAppendicesToEngine('html', () => 0);
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
