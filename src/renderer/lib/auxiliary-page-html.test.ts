import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildTOCPageHTML,
  buildCoverPageHTML,
  buildAbstractPageHTML,
  buildBilingualAbstractPageHTML,
  turkishToday,
  getAppendixCount,
  buildAppendixBlockHTML,
  normalizeAppendicesHTML,
  removeAppendixFromHTML
} from './auxiliary-page-html';

afterEach(() => {
  delete (window as any).editor;
  delete (window as any).AQTipTapWordTOC;
  delete (window as any).AQTipTapWordTemplates;
  delete (window as any).buildAppendixHTML;
  delete (window as any).renumberAppendicesHTML;
  document.body.innerHTML = '';
});

// ─── Cover ──────────────────────────────────────────────────────────────────

describe('buildCoverPageHTML', () => {
  it('builds APA-7 cover with all fields', () => {
    const html = buildCoverPageHTML({
      title: 'Thesis Title',
      author: 'John Smith',
      institution: 'XYZ University',
      course: 'PSY 401',
      professor: 'Dr. Jane Doe',
      dateText: '13 Mayıs 2026'
    });
    expect(html).toContain('Thesis Title');
    expect(html).toContain('John Smith');
    expect(html).toContain('XYZ University');
    expect(html).toContain('PSY 401');
    expect(html).toContain('Dr. Jane Doe');
    expect(html).toContain('13 Mayıs 2026');
    // Title gets bold
    expect(html).toMatch(/font-weight:bold;">Thesis Title</);
  });

  it('omits empty fields entirely', () => {
    const html = buildCoverPageHTML({
      title: 'Just Title',
      author: '',
      institution: '',
      course: '',
      professor: '',
      dateText: ''
    });
    expect(html).toContain('Just Title');
    // No empty <p> tags from missing fields
    expect(html.match(/<p[^>]*><\/p>/)).toBeNull();
  });

  it('REGRESSION: HTML-escapes title (XSS via cover title)', () => {
    const html = buildCoverPageHTML({
      title: '<script>alert(1)</script>',
      author: '',
      institution: '',
      course: '',
      professor: '',
      dateText: ''
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('delegates to AQTipTapWordTemplates.buildCoverHTML when available', () => {
    const fake = vi.fn(() => '<legacy-cover/>');
    (window as any).AQTipTapWordTemplates = { buildCoverHTML: fake };
    const html = buildCoverPageHTML({
      title: 'X', author: '', institution: '', course: '', professor: '', dateText: ''
    });
    expect(fake).toHaveBeenCalled();
    expect(html).toBe('<legacy-cover/>');
  });
});

describe('turkishToday', () => {
  it('formats date with Turkish month names', () => {
    const result = turkishToday(new Date(2026, 4, 13)); // 13 May 2026
    expect(result).toMatch(/Mayıs/);
    expect(result).toContain('2026');
    expect(result).toMatch(/^13/);
  });
});

// ─── Abstract ───────────────────────────────────────────────────────────────

describe('buildAbstractPageHTML (Turkish-only)', () => {
  it('builds Öz with body + keywords', () => {
    const html = buildAbstractPageHTML({
      text: 'Bu çalışma kuantum hesaplamayı incelemektedir.',
      keywords: 'kuantum, hesaplama, fizik'
    });
    expect(html).toContain('<h1');
    expect(html).toContain('Öz</h1>');
    expect(html).toContain('Bu çalışma kuantum hesaplamayı incelemektedir.');
    expect(html).toContain('kuantum, hesaplama, fizik');
    expect(html).toContain('Anahtar Kelimeler:');
  });

  it('omits keywords paragraph when empty', () => {
    const html = buildAbstractPageHTML({ text: 'Body only.', keywords: '' });
    expect(html).not.toContain('Anahtar Kelimeler:');
  });

  it('normalizes comma-spaced keyword list', () => {
    const html = buildAbstractPageHTML({ text: 'X', keywords: 'a ,  b,c , d  ' });
    expect(html).toMatch(/a, b, c, d/);
  });

  it('REGRESSION: escapes body and keywords (XSS)', () => {
    const html = buildAbstractPageHTML({
      text: '<script>alert(1)</script>',
      keywords: '<img>'
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img&gt;');
  });
});

describe('buildBilingualAbstractPageHTML', () => {
  it('omits English section when englishBody empty', () => {
    const html = buildBilingualAbstractPageHTML({
      turkish: { text: 'Türkçe', keywords: 'a, b' },
      english: { text: '', keywords: '' }
    });
    expect(html).toContain('Türkçe');
    expect(html).toContain('Anahtar Kelimeler:');
    expect(html).not.toContain('Abstract');
    expect(html).not.toContain('Keywords:');
    expect(html).not.toContain('data-aq-abstract-section="en"');
  });

  it('includes English section when englishBody present', () => {
    const html = buildBilingualAbstractPageHTML({
      turkish: { text: 'Türkçe metin', keywords: 'a' },
      english: { text: 'English body', keywords: 'a, b' }
    });
    expect(html).toContain('Türkçe metin');
    expect(html).toContain('English body');
    expect(html).toContain('<h1');
    expect(html).toMatch(/Abstract<\/h1>/);
    expect(html).toContain('Keywords:');
    expect(html).toContain('data-aq-abstract-section="en"');
  });

  it('omits English keywords paragraph when English keywords empty', () => {
    const html = buildBilingualAbstractPageHTML({
      turkish: { text: 'T', keywords: '' },
      english: { text: 'E', keywords: '' }
    });
    expect(html).toContain('E');
    expect(html).not.toContain('Keywords:');
  });

  it('REGRESSION: escapes both languages (XSS)', () => {
    const html = buildBilingualAbstractPageHTML({
      turkish: { text: '<script>tr</script>', keywords: '<x>' },
      english: { text: '<script>en</script>', keywords: '<y>' }
    });
    expect(html).not.toContain('<script>tr</script>');
    expect(html).not.toContain('<script>en</script>');
    expect(html).toContain('&lt;script&gt;tr');
    expect(html).toContain('&lt;script&gt;en');
  });
});

// ─── TOC ────────────────────────────────────────────────────────────────────

describe('buildTOCPageHTML', () => {
  it('returns empty string when no editor and no headings on page', () => {
    expect(buildTOCPageHTML()).toBe('');
  });

  it('uses AQTipTapWordTOC.buildAQEngineTOCHTML when editor has _aqEngine + _docModel', () => {
    const fake = vi.fn(() => '<aq-engine-toc/>');
    (window as any).AQTipTapWordTOC = { buildAQEngineTOCHTML: fake };
    (window as any).editor = {
      _aqEngine: true,
      _reflow: vi.fn(),
      _docModel: { get: () => ({}) }
    };
    expect(buildTOCPageHTML()).toBe('<aq-engine-toc/>');
    expect(fake).toHaveBeenCalledTimes(1);
    expect((window as any).editor._reflow).toHaveBeenCalled();
  });

  it('falls back to AQTipTapWordTOC.buildTOCHTML over DOM headings', () => {
    const fake = vi.fn(() => '<dom-toc/>');
    (window as any).AQTipTapWordTOC = { buildTOCHTML: fake };
    document.body.innerHTML = '<div id="apaed"><h1>A</h1><h2>B</h2></div>';
    expect(buildTOCPageHTML()).toBe('<dom-toc/>');
    expect(fake).toHaveBeenCalled();
  });

  it('returns empty when AQTipTapWordTOC absent and no editor', () => {
    document.body.innerHTML = '<div id="apaed"><h1>Heading</h1></div>';
    expect(buildTOCPageHTML()).toBe('');
  });
});

// ─── Appendices ─────────────────────────────────────────────────────────────

describe('getAppendixCount', () => {
  it('returns 0 for empty', () => {
    expect(getAppendixCount('')).toBe(0);
    expect(getAppendixCount('   ')).toBe(0);
  });

  it('counts by class="appendix-block"', () => {
    expect(getAppendixCount('<div class="appendix-block">a</div><div class="appendix-block other">b</div>')).toBe(2);
  });

  it('falls back to counting "EK-N" titles', () => {
    expect(getAppendixCount('<h1>EK-1</h1> ... <h1>EK-2</h1>')).toBe(2);
  });
});

describe('buildAppendixBlockHTML', () => {
  it('uses window.buildAppendixHTML when present', () => {
    const fake = vi.fn((i: number) => `<legacy-ek-${i}/>`);
    (window as any).buildAppendixHTML = fake;
    expect(buildAppendixBlockHTML(3)).toBe('<legacy-ek-3/>');
    expect(fake).toHaveBeenCalledWith(3);
  });

  it('falls back to built-in template', () => {
    const html = buildAppendixBlockHTML(2);
    expect(html).toContain('class="appendix-block"');
    expect(html).toContain('data-appendix-id="appendix-2"');
    expect(html).toContain('EK-2');
  });
});

describe('normalizeAppendicesHTML', () => {
  it('applies window.renumberAppendicesHTML if available', () => {
    const renumber = vi.fn(() => '<renumbered/>');
    (window as any).renumberAppendicesHTML = renumber;
    const sanitize = vi.fn((h: string) => `[sanitized]${h}`);
    expect(normalizeAppendicesHTML('<x/>', sanitize)).toBe('[sanitized]<renumbered/>');
    expect(renumber).toHaveBeenCalledWith('<x/>');
    expect(sanitize).toHaveBeenCalledWith('<renumbered/>');
  });

  it('passes through when no renumber helper', () => {
    const sanitize = (h: string) => `[s]${h}`;
    expect(normalizeAppendicesHTML('<x/>', sanitize)).toBe('[s]<x/>');
  });
});

describe('removeAppendixFromHTML', () => {
  it('returns empty for empty input', () => {
    expect(removeAppendixFromHTML('', 'appendix-1', (h) => h)).toBe('');
  });

  it('removes the matching appendix block + re-normalizes', () => {
    const html = '<div class="appendix-block" data-appendix-id="appendix-1">A</div><div class="appendix-block" data-appendix-id="appendix-2">B</div>';
    const result = removeAppendixFromHTML(html, 'appendix-1', (h) => h);
    expect(result).not.toContain('appendix-1');
    expect(result).toContain('appendix-2');
  });

  it('leaves HTML alone when id does not match', () => {
    const html = '<div class="appendix-block" data-appendix-id="appendix-1">A</div>';
    const result = removeAppendixFromHTML(html, 'appendix-99', (h) => h);
    expect(result).toContain('appendix-1');
  });

  it('passes the result through sanitizeFn', () => {
    const sanitize = vi.fn((h: string) => `[s]${h}`);
    const result = removeAppendixFromHTML('<div class="appendix-block" data-appendix-id="x">A</div>', 'x', sanitize);
    expect(sanitize).toHaveBeenCalled();
    expect(result.startsWith('[s]')).toBe(true);
  });
});
