import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getActiveDocRecord,
  commitEditorHTMLToLegacyState,
  sanitizeAuxiliaryHTML,
  saveAuxiliaryChange,
  setStatusText,
  setAuxiliaryPageHTML
} from './legacy-doc-helpers';

afterEach(() => {
  delete (window as any).S;
  delete (window as any).sanitizeAuxPageHTML;
  delete (window as any).syncAuxiliaryPages;
  delete (window as any).save;
  delete (window as any).setDst;
  document.body.innerHTML = '';
});

// ─── getActiveDocRecord ──────────────────────────────────────────────────

describe('getActiveDocRecord', () => {
  it('returns null when window.S is missing', () => {
    expect(getActiveDocRecord()).toBe(null);
  });

  it('returns null when window.S is not an object', () => {
    (window as any).S = 'not an object';
    expect(getActiveDocRecord()).toBe(null);
  });

  it('returns doc matching curDoc', () => {
    (window as any).S = {
      curDoc: 'doc-2',
      docs: [
        { id: 'doc-1', name: 'First' },
        { id: 'doc-2', name: 'Second' }
      ]
    };
    expect(getActiveDocRecord()).toEqual({ id: 'doc-2', name: 'Second' });
  });

  it('falls back to first doc when curDoc not found', () => {
    (window as any).S = {
      curDoc: 'missing',
      docs: [{ id: 'doc-1', name: 'First' }]
    };
    expect(getActiveDocRecord()).toEqual({ id: 'doc-1', name: 'First' });
  });

  it('returns null when docs is empty', () => {
    (window as any).S = { curDoc: 'x', docs: [] };
    expect(getActiveDocRecord()).toBe(null);
  });
});

// ─── commitEditorHTMLToLegacyState ───────────────────────────────────────

describe('commitEditorHTMLToLegacyState', () => {
  it('returns html unchanged when no state', () => {
    expect(commitEditorHTMLToLegacyState('<p>X</p>')).toBe('<p>X</p>');
  });

  it('writes html to state.doc and active doc.content', () => {
    const docs = [{ id: 'd1', content: 'old' }];
    (window as any).S = { curDoc: 'd1', docs };
    commitEditorHTMLToLegacyState('<p>New</p>');
    expect((window as any).S.doc).toBe('<p>New</p>');
    expect(docs[0]!.content).toBe('<p>New</p>');
  });

  it('writes to first doc when curDoc missing', () => {
    const docs = [{ id: 'd1', content: 'old' }];
    (window as any).S = { curDoc: 'missing', docs };
    commitEditorHTMLToLegacyState('<p>fallback</p>');
    expect(docs[0]!.content).toBe('<p>fallback</p>');
  });
});

// ─── sanitizeAuxiliaryHTML ───────────────────────────────────────────────

describe('sanitizeAuxiliaryHTML', () => {
  it('returns input unchanged when no legacy sanitizer', () => {
    expect(sanitizeAuxiliaryHTML('<p>X</p>')).toBe('<p>X</p>');
  });

  it('delegates to window.sanitizeAuxPageHTML when present', () => {
    const sanitizer = vi.fn((h: string) => `[sanitized]${h}`);
    (window as any).sanitizeAuxPageHTML = sanitizer;
    expect(sanitizeAuxiliaryHTML('<p>X</p>')).toBe('[sanitized]<p>X</p>');
    expect(sanitizer).toHaveBeenCalledWith('<p>X</p>');
  });
});

// ─── saveAuxiliaryChange ─────────────────────────────────────────────────

describe('saveAuxiliaryChange', () => {
  it('calls window.save when present', () => {
    const save = vi.fn();
    (window as any).save = save;
    saveAuxiliaryChange();
    expect(save).toHaveBeenCalled();
  });

  it('calls fallbackNotify when no window.save', () => {
    const fallback = vi.fn();
    saveAuxiliaryChange(fallback);
    expect(fallback).toHaveBeenCalled();
  });

  it('calls syncAuxiliaryPages before save', () => {
    const sync = vi.fn();
    const save = vi.fn();
    (window as any).syncAuxiliaryPages = sync;
    (window as any).save = save;
    saveAuxiliaryChange();
    expect(sync).toHaveBeenCalled();
    expect(save).toHaveBeenCalled();
  });

  it('tolerates syncAuxiliaryPages throwing', () => {
    (window as any).syncAuxiliaryPages = () => { throw new Error('sync fail'); };
    const save = vi.fn();
    (window as any).save = save;
    expect(() => saveAuxiliaryChange()).not.toThrow();
    expect(save).toHaveBeenCalled();
  });
});

// ─── setStatusText ───────────────────────────────────────────────────────

describe('setStatusText', () => {
  it('no-op when window.setDst missing', () => {
    expect(() => setStatusText('hello')).not.toThrow();
  });

  it('calls setDst with message + default tone ok', () => {
    const setter = vi.fn();
    (window as any).setDst = setter;
    setStatusText('done');
    expect(setter).toHaveBeenCalledWith('done', 'ok');
  });

  it('passes through error tone', () => {
    const setter = vi.fn();
    (window as any).setDst = setter;
    setStatusText('failed', 'er');
    expect(setter).toHaveBeenCalledWith('failed', 'er');
  });
});

// ─── setAuxiliaryPageHTML ────────────────────────────────────────────────

describe('setAuxiliaryPageHTML', () => {
  it('writes HTML to body and shows page', () => {
    document.body.innerHTML = `
      <div id="tocpage" style="display:none">
        <div id="tocbody"></div>
      </div>
    `;
    setAuxiliaryPageHTML('tocpage', 'tocbody', '<p>TOC</p>');
    expect((document.getElementById('tocbody') as HTMLElement).innerHTML).toBe('<p>TOC</p>');
    expect((document.getElementById('tocpage') as HTMLElement).style.display).toBe('block');
  });

  it('hides page when html is empty', () => {
    document.body.innerHTML = `
      <div id="p" style="display:block">
        <div id="b">old</div>
      </div>
    `;
    setAuxiliaryPageHTML('p', 'b', '');
    expect((document.getElementById('b') as HTMLElement).innerHTML).toBe('');
    expect((document.getElementById('p') as HTMLElement).style.display).toBe('none');
  });

  it('runs onShown callback after non-empty render', () => {
    document.body.innerHTML = '<div id="p"><div id="b"></div></div>';
    const onShown = vi.fn();
    setAuxiliaryPageHTML('p', 'b', '<p>X</p>', onShown);
    expect(onShown).toHaveBeenCalledTimes(1);
    expect(onShown.mock.calls[0]![0]).toBe(document.getElementById('b'));
  });

  it('does NOT run onShown when html empty', () => {
    document.body.innerHTML = '<div id="p"><div id="b"></div></div>';
    const onShown = vi.fn();
    setAuxiliaryPageHTML('p', 'b', '   ', onShown);
    expect(onShown).not.toHaveBeenCalled();
  });

  it('no-op when DOM elements missing', () => {
    expect(() => setAuxiliaryPageHTML('nope', 'nope2', '<p>X</p>')).not.toThrow();
  });
});
