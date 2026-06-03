import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleTauriDroppedPaths } from './drop-router';

describe('handleTauriDroppedPaths', () => {
  let onStatus: any;

  beforeEach(() => {
    onStatus = vi.fn();
    (global as any).window = (global as any).window || {};
    (global as any).window.electronAPI = {
      pdf: {
        ingest: vi.fn().mockResolvedValue({ ok: true })
      },
      wordToHtml: vi.fn().mockResolvedValue({ ok: true, html: '<p>Mocked word content</p>' }),
      fs: {
        readFileText: vi.fn().mockResolvedValue('@article{test, title={Test}}'),
        readFileBase64: vi.fn().mockResolvedValue('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
      }
    };
    (global as any).window.AQReferenceParse = {
      parseBibTeX: vi.fn().mockReturnValue([{ id: 'ref_1', title: 'Test BibTeX' }])
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ingests PDF path correctly', async () => {
    const paths = ['/path/to/doc.pdf'];
    const result = await handleTauriDroppedPaths(paths, onStatus);
    expect(result).toBe(true);
    const api = window.electronAPI as any;
    expect(api.pdf.ingest).toHaveBeenCalledWith('/path/to/doc.pdf');
    expect(onStatus).toHaveBeenCalledWith('1 PDF kütüphaneye eklendi');
  });

  it('imports Word path correctly', async () => {
    const paths = ['/path/to/doc.docx'];
    const result = await handleTauriDroppedPaths(paths, onStatus);
    expect(result).toBe(true);
    const api = window.electronAPI as any;
    expect(api.wordToHtml).toHaveBeenCalledWith('/path/to/doc.docx');
  });

  it('imports RIS/BibTeX path correctly', async () => {
    const paths = ['/path/to/ref.bib'];
    const result = await handleTauriDroppedPaths(paths, onStatus);
    expect(result).toBe(true);
    const api = window.electronAPI as any;
    expect(api.fs.readFileText).toHaveBeenCalledWith('/path/to/ref.bib');
  });

  it('inserts Image path correctly', async () => {
    const paths = ['/path/to/image.png'];
    const result = await handleTauriDroppedPaths(paths, onStatus);
    expect(result).toBe(true);
    const api = window.electronAPI as any;
    expect(api.fs.readFileBase64).toHaveBeenCalledWith('/path/to/image.png');
  });
});
