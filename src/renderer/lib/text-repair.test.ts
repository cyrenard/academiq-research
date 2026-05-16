/**
 * Smoke tests for src/text-repair.js — the mojibake fixer used by import
 * handlers (PDF text extraction, clipboard paste, legacy file load).
 *
 * The MutationObserver-based runtime auto-repair was removed in the
 * polish pass; from now on, repair must be called explicitly on data
 * that crosses the encoding boundary. These tests pin the API surface
 * we rely on.
 */
import { describe, it, expect, beforeAll } from 'vitest';

let repairText: (value: unknown) => string;

beforeAll(async () => {
  // text-repair.js is a UMD-style script that assigns to globalThis.AQTextRepair.
  // Importing it as a side effect registers the API for the rest of the test.
  await import('../../text-repair.js' as any);
  repairText = (globalThis as any).AQTextRepair.repairText;
});

describe('AQTextRepair.repairText', () => {
  it('is exposed on globalThis as AQTextRepair', () => {
    expect((globalThis as any).AQTextRepair).toBeDefined();
    expect(typeof repairText).toBe('function');
  });

  it('passes clean Turkish text through untouched', () => {
    const clean = 'Öğrenci çalışması başarılı oldu.';
    expect(repairText(clean)).toBe(clean);
  });

  it('repairs common cp1252-as-utf8 mojibake', () => {
    expect(repairText('Ã¼')).toBe('ü');
    expect(repairText('Ã§')).toBe('ç');
    expect(repairText('ÅŸ')).toBe('ş');
    expect(repairText('Ä±')).toBe('ı');
    expect(repairText('Ä°')).toBe('İ');
  });

  it('repairs a real-world mojibake phrase', () => {
    expect(repairText('KÃ¼tÃ¼phane DÄ±ÅŸa AktarÄ±m')).toContain('Kütüphane');
    expect(repairText('KÃ¼tÃ¼phane DÄ±ÅŸa AktarÄ±m')).toContain('Dışa');
  });

  it('returns "" for nullish input', () => {
    expect(repairText(null)).toBe('');
    expect(repairText(undefined)).toBe('');
  });

  it('coerces numbers to strings', () => {
    expect(repairText(42)).toBe('42');
  });

  it('does not double-repair text that is already clean', () => {
    const clean = 'Çağrı';
    expect(repairText(repairText(clean))).toBe(clean);
  });
});
