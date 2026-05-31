import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  readFileAsText,
  readFileAsDataURL,
  insertImageFile,
  importWordFileDirect,
  importBibliographyFile
} from './file-import';
import { appStore } from './app-store';

beforeEach(() => {
  appStore.setState({ cur: 'workspace-1', wss: [{ id: 'workspace-1', name: 'Workspace 1', lib: [] }] });
  (window as any).uid = () => 'fake-uid';
});

afterEach(() => {
  delete (window as any).S;
  delete (window as any).uid;
  delete (window as any).editor;
  delete (window as any).mammoth;
  delete (window as any).parseBibTeX;
  delete (window as any).parseRIS;
  delete (window as any).AQReferenceParse;
  delete (window as any).AQTipTapWordContent;
  delete (window as any).AQTipTapWordDocument;
  delete (window as any).AQTipTapWordIO;
  delete (window as any).__importFromFileInput;
  delete (window as any).runEditorMutationEffects;
  delete (window as any).save;
  document.body.innerHTML = '';
});

// ─── FileReader wrappers ─────────────────────────────────────────────────

describe('readFileAsText', () => {
  it('resolves with file text content', async () => {
    const file = new File(['hello world'], 'a.txt', { type: 'text/plain' });
    expect(await readFileAsText(file)).toBe('hello world');
  });

  it('resolves with empty string for empty file', async () => {
    const file = new File([''], 'empty.txt');
    expect(await readFileAsText(file)).toBe('');
  });
});

describe('readFileAsDataURL', () => {
  it('resolves with data URL', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const result = await readFileAsDataURL(file);
    expect(result).toMatch(/^data:image\/png;base64,/);
  });
});

// ─── insertImageFile ─────────────────────────────────────────────────────

describe('insertImageFile', () => {
  function buildEvent(files: File[]) {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: files });
    return { currentTarget: input, nativeEvent: new Event('change') } as any;
  }

  it('returns early when no file selected', async () => {
    const onStatus = vi.fn();
    await insertImageFile(buildEvent([]), onStatus);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('delegates to AQTipTapWordContent.insertImageFile when available', async () => {
    const onStatus = vi.fn();
    const fake = vi.fn(() => true);
    (window as any).AQTipTapWordContent = { insertImageFile: fake };
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    await insertImageFile(buildEvent([file]), onStatus);
    expect(fake).toHaveBeenCalledTimes(1);
    const callArg = (fake.mock.calls[0] as any[])[0] as { file: File };
    expect(callArg.file).toBe(file);
    expect(onStatus).toHaveBeenCalledWith('Görsel eklendi');
  });

  it('falls back to editor.chain when TipTap helper missing', async () => {
    const onStatus = vi.fn();
    const insertContent = vi.fn(() => ({ run: vi.fn() }));
    const chain = vi.fn(() => ({ focus: () => ({ insertContent }) }));
    (window as any).editor = { chain };
    const file = new File(['data'], 'img.png', { type: 'image/png' });

    await insertImageFile(buildEvent([file]), onStatus);
    expect(chain).toHaveBeenCalled();
    expect(insertContent).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Görsel eklendi');
  });

  it('reports "Görsel eklenemedi" when nothing handles it', async () => {
    const onStatus = vi.fn();
    const file = new File(['data'], 'img.png', { type: 'image/png' });
    await insertImageFile(buildEvent([file]), onStatus);
    expect(onStatus).toHaveBeenCalledWith('Görsel eklenemedi');
  });

  it('leaves input value empty after processing (browsers only allow empty assignment)', async () => {
    const onStatus = vi.fn();
    const file = new File(['data'], 'img.png', { type: 'image/png' });
    const event = buildEvent([file]);
    await insertImageFile(event, onStatus);
    // Function calls `input.value = ''` in the finally block — verify no throw
    expect(event.currentTarget.value).toBe('');
  });
});

// ─── importBibliographyFile ──────────────────────────────────────────────

describe('importBibliographyFile', () => {
  function buildEvent(files: File[]) {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: files });
    return { currentTarget: input } as any;
  }

  it('returns early when no file', async () => {
    const onStatus = vi.fn();
    await importBibliographyFile(buildEvent([]), onStatus);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('parses .bib via window.parseBibTeX and dispatches CustomEvent', async () => {
    const onStatus = vi.fn();
    const parser = vi.fn(() => [{ id: 'r1' }, { id: 'r2' }]);
    (window as any).parseBibTeX = parser;

    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);

    const file = new File(['@article{x,title={y}}'], 'refs.bib');
    await importBibliographyFile(buildEvent([file]), onStatus);

    expect(parser).toHaveBeenCalledWith(
      '@article{x,title={y}}',
      { createId: (window as any).uid, workspaceId: 'workspace-1' }
    );
    expect(listener).toHaveBeenCalledTimes(1);
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.entries).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(ev.detail.sourceLabel).toBe('BibTeX');

    window.removeEventListener('aq:import-references', listener as any);
  });

  it('parses .ris via window.parseRIS', async () => {
    const onStatus = vi.fn();
    const parser = vi.fn(() => [{ id: 'r1' }]);
    (window as any).parseRIS = parser;
    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);

    const file = new File(['TY - JOUR\nT1 - Foo\nER -'], 'refs.ris');
    await importBibliographyFile(buildEvent([file]), onStatus);

    expect(parser).toHaveBeenCalled();
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.sourceLabel).toBe('RIS');
    window.removeEventListener('aq:import-references', listener as any);
  });

  // ── BUG REGRESSION ─────────────────────────────────────────────────
  it('REGRESSION: falls back to AQReferenceParse.parseBibTeX when window.parseBibTeX missing', async () => {
    const onStatus = vi.fn();
    const parser = vi.fn(() => [{ id: 'fallback' }]);
    (window as any).AQReferenceParse = { parseBibTeX: parser };
    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);

    const file = new File(['@article{x}'], 'refs.bib');
    await importBibliographyFile(buildEvent([file]), onStatus);

    expect(parser).toHaveBeenCalled();
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.entries).toEqual([{ id: 'fallback' }]);
    window.removeEventListener('aq:import-references', listener as any);
  });

  it('REGRESSION: does NOT throw when neither parser nor AQReferenceParse exists', async () => {
    const onStatus = vi.fn();
    const file = new File(['@article{x}'], 'refs.bib');
    // Should not throw even with no parsers — old code crashed on `AQReferenceParseç.parseBibTeX`
    await expect(importBibliographyFile(buildEvent([file]), onStatus)).resolves.toBeUndefined();
    expect(onStatus).toHaveBeenCalledWith('BibTeX/RIS aktarılamadı');
  });

  it('reports "Kaynak bulunamadı" when parser returns []', async () => {
    const onStatus = vi.fn();
    (window as any).parseBibTeX = () => [];
    const file = new File(['@article{x}'], 'refs.bib');
    await importBibliographyFile(buildEvent([file]), onStatus);
    expect(onStatus).toHaveBeenCalledWith('Kaynak bulunamadı');
  });

  it('falls back to __importFromFileInput when no parser available', async () => {
    const onStatus = vi.fn();
    const fallback = vi.fn();
    (window as any).__importFromFileInput = fallback;
    const file = new File(['@article{x}'], 'refs.bib');
    await importBibliographyFile(buildEvent([file]), onStatus);
    expect(fallback).toHaveBeenCalled();
  });

  it('leaves input value empty after processing (browsers only allow empty assignment)', async () => {
    const onStatus = vi.fn();
    (window as any).parseBibTeX = () => [{ id: 'r' }];
    const file = new File(['@article{x}'], 'refs.bib');
    const event = buildEvent([file]);
    await importBibliographyFile(event, onStatus);
    // Function calls `input.value = ''` in finally — verify no throw
    expect(event.currentTarget.value).toBe('');
  });
});

// ─── importWordFileDirect ────────────────────────────────────────────────

describe('importWordFileDirect', () => {
  function buildEvent(file: File | null) {
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: file ? [file] : [] });
    return { currentTarget: input } as any;
  }

  it('returns early when no file', async () => {
    const onStatus = vi.fn();
    await importWordFileDirect(buildEvent(null), onStatus);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('uses electronAPI.wordToHtml when file.path provided', async () => {
    const onStatus = vi.fn();
    (window as any).electronAPI = {
      wordToHtml: vi.fn(async () => ({ ok: true, html: '<p>Imported</p>' })),
      saveData: vi.fn(async () => ({ ok: true })),
      saveEditorDraft: vi.fn(async () => ({ ok: true }))
    };
    const setContent = vi.fn();
    (window as any).editor = { commands: { setContent, focus: vi.fn() } };

    const file = new File(['placeholder'], 'doc.docx');
    Object.defineProperty(file, 'path', { value: '/fake/path/doc.docx' });

    await importWordFileDirect(buildEvent(file), onStatus);
    expect((window as any).electronAPI.wordToHtml).toHaveBeenCalledWith('/fake/path/doc.docx');
    expect(setContent).toHaveBeenCalledWith('<p>Imported</p>', false);
  });

  it('falls back to mammoth in renderer when electronAPI fails', async () => {
    const onStatus = vi.fn();
    (window as any).electronAPI = {
      wordToHtml: vi.fn(async () => ({ ok: false })),
      saveData: vi.fn(async () => ({ ok: true })),
      saveEditorDraft: vi.fn(async () => ({ ok: true }))
    };
    (window as any).mammoth = {
      convertToHtml: vi.fn(async () => ({ value: '<p>From mammoth</p>' }))
    };
    const setContent = vi.fn();
    (window as any).editor = { commands: { setContent, focus: vi.fn() } };

    const file = new File(['x'], 'doc.docx');
    await importWordFileDirect(buildEvent(file), onStatus);
    expect((window as any).mammoth.convertToHtml).toHaveBeenCalled();
    expect(setContent).toHaveBeenCalledWith('<p>From mammoth</p>', false);
  });

  it('reports unreadable file when no decoder works', async () => {
    const onStatus = vi.fn();
    // Mock TextDecoder to always return empty
    const origTextDecoder = global.TextDecoder;
    (global as any).TextDecoder = class { decode() { return ''; } };
    try {
      const file = new File([new ArrayBuffer(0)], 'doc.docx');
      await importWordFileDirect(buildEvent(file), onStatus);
      expect(onStatus).toHaveBeenCalledWith('Word dosyası okunamadı');
    } finally {
      global.TextDecoder = origTextDecoder;
    }
  });
});
