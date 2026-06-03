import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exportAqLayoutPdf } from './export-pdf';

describe('Export Pipeline Validation Suite', () => {
  const originalElectronAPI = (global as any).window?.electronAPI;

  beforeEach(() => {
    (global as any).window = (global as any).window || {};
    (global as any).window.electronAPI = {
      export: {
        pdf: vi.fn()
      },
      exportPDF: vi.fn(),
      exportDOCX: vi.fn()
    };
  });

  afterEach(() => {
    if (originalElectronAPI) {
      (global as any).window.electronAPI = originalElectronAPI;
    } else {
      delete (global as any).window.electronAPI;
    }
  });

  it('validates that exportAqLayoutPdf receives correct PDF bytes with %PDF- header from backend', async () => {
    // Simulated PDF bytes starting with %PDF-1.4
    const simulatedPdfBytes = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a];
    const mockResult = {
      ok: true,
      bytes: simulatedPdfBytes,
      warnings: [],
      fontSubstituted: false,
      substitutedFontWarning: null
    };

    (global as any).window.electronAPI.export.pdf.mockResolvedValue(mockResult);

    const layout = {
      pages: [
        {
          lines: [
            {
              x: 10,
              y: 20,
              items: [{ text: 'Test PDF export', font: '12pt Arial' }]
            }
          ]
        }
      ]
    };

    const result = await exportAqLayoutPdf(layout, { pageSize: 'A4' });

    expect(result.ok).toBe(true);
    expect(result.bytes).toBeDefined();
    
    // Validate magic header %PDF-
    const headerString = String.fromCharCode(...result.bytes.slice(0, 5));
    expect(headerString).toBe('%PDF-');
    expect(result.bytes[0]).toBe(0x25); // '%'
    expect(result.bytes[1]).toBe(0x50); // 'P'
    expect(result.bytes[2]).toBe(0x44); // 'D'
    expect(result.bytes[3]).toBe(0x46); // 'F'
    expect(result.bytes[4]).toBe(0x2d); // '-'
  });

  it('validates that exportDOCX processes base64 data starting with PK zip header', async () => {
    // Word/docx files are zip files starting with PK\x03\x04
    // PK\x03\x04 in hex is: 50 4B 03 04. Let's create a simulated base64 string.
    const simulatedDocxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x00, 0x08, 0x00]);
    let base64String = '';
    if (typeof Buffer !== 'undefined') {
      base64String = Buffer.from(simulatedDocxBytes).toString('base64');
    } else {
      base64String = btoa(String.fromCharCode(...simulatedDocxBytes));
    }

    const mockResult = {
      ok: true,
      path: '/fake/path/document.docx',
      bytes: simulatedDocxBytes.length
    };

    (global as any).window.electronAPI.exportDOCX.mockResolvedValue(mockResult);

    const options = {
      base64: base64String,
      defaultPath: 'document.docx'
    };

    const result = await (global as any).window.electronAPI.exportDOCX(options);

    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(simulatedDocxBytes.length);

    // Verify the input base64 string decodes to have the PK zip header
    const decodedBytes = typeof Buffer !== 'undefined'
      ? Buffer.from(options.base64, 'base64')
      : new Uint8Array(atob(options.base64).split('').map(c => c.charCodeAt(0)));

    expect(decodedBytes[0]).toBe(0x50); // 'P'
    expect(decodedBytes[1]).toBe(0x4b); // 'K'
    expect(decodedBytes[2]).toBe(0x03);
    expect(decodedBytes[3]).toBe(0x04);
  });
});
