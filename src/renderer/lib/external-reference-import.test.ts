import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExternalReferenceText,
  importExternalEntries,
  runExternalReferenceTextImport,
  runExternalReferenceBibliographyTextImport,
  runExternalReferenceFileImport,
  runExternalReferenceDoiImport
} from './external-reference-import';
import { appStore } from './app-store';

// Snapshot of original window globals before each test
const SAVED: Record<string, any> = {};
function stashWin(...keys: string[]) {
  keys.forEach((k) => { SAVED[k] = (window as any)[k]; });
}
function restoreWin() {
  Object.keys(SAVED).forEach((k) => { (window as any)[k] = SAVED[k]; });
  for (const k of Object.keys(SAVED)) delete SAVED[k];
}

beforeEach(() => {
  // Set up minimal state surface
  appStore.setState({ cur: 'workspace-1', wss: [{ id: 'workspace-1', name: 'Workspace 1', lib: [] }] });
  (window as any).uid = () => 'fake-uid-' + Math.floor(Math.random() * 1e6);
});

afterEach(() => {
  restoreWin();
  delete (window as any).S;
  delete (window as any).uid;
  delete (window as any).parseBibTeX;
  delete (window as any).parseRIS;
  delete (window as any).parseApaReferenceText;
  delete (window as any).normalizeRefDoi;
  delete (window as any).AQReferenceParse;
  delete (window as any).importReferenceEntries;
  delete (window as any).importExternalReferenceFile;
  delete (window as any).__importFromFileInput;
  delete (window as any).importExternalReferenceDoi;
  document.body.innerHTML = '';
});

describe('parseExternalReferenceText', () => {
  it('returns [] for empty input', () => {
    expect(parseExternalReferenceText('')).toEqual([]);
    expect(parseExternalReferenceText('   ')).toEqual([]);
  });

  it('uses window.parseBibTeX when input looks like BibTeX', () => {
    const fake = vi.fn(() => [{ id: 'a', title: 'Parsed BibTeX entry' }]);
    (window as any).parseBibTeX = fake;
    const result = parseExternalReferenceText('@article{foo, title={X}}', 'auto');
    expect(fake).toHaveBeenCalledTimes(1);
    expect((fake.mock.calls[0] as any[])[1]).toMatchObject({ workspaceId: 'workspace-1' });
    expect(result).toEqual([{ id: 'a', title: 'Parsed BibTeX entry' }]);
  });

  it('uses window.parseRIS when input looks like RIS', () => {
    const fake = vi.fn(() => [{ id: 'b', title: 'Parsed RIS entry' }]);
    (window as any).parseRIS = fake;
    const result = parseExternalReferenceText('TY - JOUR\nT1 - Foo\nER -', 'auto');
    expect(fake).toHaveBeenCalledTimes(1);
    expect(result[0].title).toBe('Parsed RIS entry');
  });

  it('uses window.parseApaReferenceText for free-form APA text', () => {
    const fake = vi.fn(() => [{ id: 'c', title: 'Parsed APA entry' }]);
    (window as any).parseApaReferenceText = fake;
    const result = parseExternalReferenceText('Smith, J. (2020). Some article. Nature.', 'apa');
    expect(fake).toHaveBeenCalled();
    expect(result[0].id).toBe('c');
  });

  it('falls back to AQReferenceParse.parseBibTeX when window.parseBibTeX missing', () => {
    const fake = vi.fn(() => [{ id: 'd', title: 'fallback' }]);
    (window as any).AQReferenceParse = { parseBibTeX: fake };
    const result = parseExternalReferenceText('@article{x,title={y}}', 'bibtex');
    expect(fake).toHaveBeenCalled();
    expect(result[0].id).toBe('d');
  });

  it('uses built-in APA fallback parser when no legacy parser available', () => {
    // No parseApaReferenceText, no AQReferenceParse
    const result = parseExternalReferenceText(
      'Smith, J. (2020). A title with content. Nature, 5, 100-120. https://doi.org/10.1234/abc',
      'apa'
    );
    expect(result.length).toBeGreaterThan(0);
    const entry = result[0] as any;
    expect(entry.year).toBe('2020');
    expect(entry.doi).toBe('10.1234/abc');
    expect(entry.url).toBe('https://doi.org/10.1234/abc');
    expect(entry.wsId).toBe('workspace-1');
  });

  it('built-in APA fallback handles n.d. dates', () => {
    const result = parseExternalReferenceText('Doe, J. (n.d.). Untitled. Site.', 'apa');
    expect((result[0] as any).year).toBe('n.d.');
  });

  // ── BUG REGRESSION ─────────────────────────────────────────────────
  // The original LegacyCompatibilityHost.tsx had `win.AQReferenceParseç`
  // (stray ç). When window.parseBibTeX was undefined, the fallback would
  // throw on `undefined.parseBibTeX` before short-circuiting. After the
  // extraction-time fix, the fallback uses the correctly-spelled object.
  it('REGRESSION: falls back gracefully when window.parseBibTeX missing AND AQReferenceParse missing', () => {
    // No parseBibTeX on window AND no AQReferenceParse → should not throw
    expect(() => parseExternalReferenceText('@article{x,title={y}}', 'bibtex'))
      .not.toThrow();
  });
});

describe('importExternalEntries', () => {
  it('sets status to empty-message and returns when entries is empty', () => {
    const onStatus = vi.fn();
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);
    importExternalEntries([], 'X', onStatus);
    expect(statusEl.textContent).toMatch(/Kaynak bulunamadı/);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('dispatches React import event even when legacy importer is present', () => {
    const onStatus = vi.fn();
    const importerFake = vi.fn(() => ({ imported: 5, duplicates: 1, skipped: 0 }));
    const listener = vi.fn();
    (window as any).importReferenceEntries = importerFake;
    window.addEventListener('aq:import-references', listener as any);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    importExternalEntries([{ id: 'r1' }, { id: 'r2' }], 'BibTeX', onStatus);
    expect(importerFake).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('kaydediliyor'));
    expect(statusEl.textContent).toMatch(/kaydediliyor/);
    window.removeEventListener('aq:import-references', listener as any);
  });

  it('falls back to CustomEvent dispatch when legacy importer missing', () => {
    const onStatus = vi.fn();
    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    importExternalEntries([{ id: 'r1' }], 'APA', onStatus);
    expect(listener).toHaveBeenCalledTimes(1);
    const ev = listener.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.entries).toEqual([{ id: 'r1' }]);
    expect(ev.detail.sourceLabel).toBe('APA');
    expect(ev.detail.includeInBibliography).toBe(true);
    expect(statusEl.textContent).toMatch(/1 kaynak bulundu/);

    window.removeEventListener('aq:import-references', listener as any);
  });

  it('catches errors and reports them via onStatus + status DOM', () => {
    const onStatus = vi.fn();
    const dispatch = vi.spyOn(window, 'dispatchEvent').mockImplementation(() => { throw new Error('boom'); });
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    importExternalEntries([{ id: 'r1' }], 'BibTeX', onStatus);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('aktarılamadı'));
    expect(statusEl.textContent).toMatch(/aktarılamadı/);
    dispatch.mockRestore();
  });
});

describe('runExternalReferenceTextImport (APA textarea)', () => {
  it('reads from #externalReferenceTextInput, parses, imports, and clears', () => {
    const onStatus = vi.fn();
    const apaFake = vi.fn(() => [{ id: 'apa-1', title: 'X' }]);
    const listener = vi.fn();
    (window as any).parseApaReferenceText = apaFake;
    window.addEventListener('aq:import-references', listener as any);

    const input = document.createElement('textarea');
    input.id = 'externalReferenceTextInput';
    input.value = 'Smith, J. (2020). Title.';
    document.body.appendChild(input);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceTextImport(onStatus);
    expect(apaFake).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    expect(input.value).toBe('');
    window.removeEventListener('aq:import-references', listener as any);
  });

  it('reports empty-input status without parsing', () => {
    const onStatus = vi.fn();
    const apaFake = vi.fn();
    (window as any).parseApaReferenceText = apaFake;
    const input = document.createElement('textarea');
    input.id = 'externalReferenceTextInput';
    input.value = '   ';
    document.body.appendChild(input);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceTextImport(onStatus);
    expect(apaFake).not.toHaveBeenCalled();
    expect(statusEl.textContent).toMatch(/bos/);
  });
});

describe('runExternalReferenceBibliographyTextImport', () => {
  it('parses BibTeX and reports BibTeX label', () => {
    const onStatus = vi.fn();
    const parser = vi.fn(() => [{ id: 'bib' }]);
    (window as any).parseBibTeX = parser;
    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);

    const input = document.createElement('textarea');
    input.id = 'externalReferenceBibRisInput';
    input.value = '@article{x,title={y}}';
    document.body.appendChild(input);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceBibliographyTextImport(onStatus);
    expect(parser).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('BibTeX'));
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('aq:import-references', listener as any);
  });

  it('parses RIS and reports RIS label', () => {
    const onStatus = vi.fn();
    const parser = vi.fn(() => [{ id: 'ris' }]);
    (window as any).parseRIS = parser;
    const listener = vi.fn();
    window.addEventListener('aq:import-references', listener as any);

    const input = document.createElement('textarea');
    input.id = 'externalReferenceBibRisInput';
    input.value = 'TY - JOUR\nT1 - Foo\nER -';
    document.body.appendChild(input);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceBibliographyTextImport(onStatus);
    expect(parser).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('RIS'));
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('aq:import-references', listener as any);
  });
});

describe('runExternalReferenceFileImport (legacy hooks)', () => {
  it('delegates to window.importExternalReferenceFile when present', () => {
    const onStatus = vi.fn();
    const fake = vi.fn();
    (window as any).importExternalReferenceFile = fake;

    const file = new File(['@article{x}'], 'refs.bib', { type: 'application/x-bibtex' });
    const input = document.createElement('input');
    input.id = 'externalReferenceFileInput';
    input.type = 'file';
    document.body.appendChild(input);
    Object.defineProperty(input, 'files', { value: [file] });
    const event = { currentTarget: input, nativeEvent: new Event('change') } as any;

    runExternalReferenceFileImport(event, onStatus);
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it('reports unavailability when no legacy handler exists', () => {
    const onStatus = vi.fn();
    const file = new File(['x'], 'refs.bib', { type: 'application/x-bibtex' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceFileImport({ currentTarget: input } as any, onStatus);
    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('hazır değil'));
  });
});

describe('runExternalReferenceDoiImport', () => {
  it('reports empty-input when DOI textarea is blank', () => {
    const onStatus = vi.fn();
    const input = document.createElement('textarea');
    input.id = 'externalReferenceDoiInput';
    input.value = '   ';
    document.body.appendChild(input);
    const statusEl = document.createElement('div');
    statusEl.id = 'externalReferenceImportStatus';
    document.body.appendChild(statusEl);

    runExternalReferenceDoiImport(onStatus);
    expect(statusEl.textContent).toMatch(/bos/);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('calls legacy window.importExternalReferenceDoi when present + input non-empty', () => {
    const onStatus = vi.fn();
    const fake = vi.fn();
    (window as any).importExternalReferenceDoi = fake;
    const input = document.createElement('textarea');
    input.id = 'externalReferenceDoiInput';
    input.value = '10.1234/abc';
    document.body.appendChild(input);

    runExternalReferenceDoiImport(onStatus);
    expect(fake).toHaveBeenCalledTimes(1);
  });
});
