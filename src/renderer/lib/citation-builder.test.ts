import { describe, it, expect, vi } from 'vitest';
import {
  getCitationStyle,
  getInlineCitationText,
  visibleCitationText,
  narrativeCitationText,
  buildCitationHTML,
  formatReference,
  buildBibliographyHTML
} from './citation-builder';

describe('citation-builder', () => {
  const winMock: any = {
    S: {
      curDoc: 'doc-1',
      docs: [
        { id: 'doc-1', citationStyle: 'apa7' }
      ]
    }
  };

  it('getCitationStyle falls back to apa7', () => {
    expect(getCitationStyle(winMock)).toBe('apa7');
    expect(getCitationStyle({})).toBe('apa7');
  });

  it('getInlineCitationText works with fallback', () => {
    const ref = { id: 'r1', authors: ['Smith, John'], year: '2020' };
    expect(getInlineCitationText(winMock, ref)).toBe('(John, 2020)');
  });

  it('visibleCitationText joins multiple references', () => {
    const refs = [
      { id: 'r1', authors: ['Smith, John'], year: '2020' },
      { id: 'r2', authors: ['Doe, Jane'], year: '2021' }
    ];
    expect(visibleCitationText(winMock, refs)).toBe('John, 2020; Jane, 2021');
  });

  it('narrativeCitationText matches legacy formatting', () => {
    const ref = { id: 'r1', authors: ['Smith, John'], year: '2020' };
    expect(narrativeCitationText(ref)).toBe('Smith (2020)');

    const ref2 = { id: 'r1', authors: ['Smith, John', 'Doe, Jane'], year: '2020' };
    expect(narrativeCitationText(ref2)).toBe('Smith & Doe (2020)');
  });

  it('buildCitationHTML builds spans', () => {
    const refs = [{ id: 'r1', authors: ['Smith, John'], year: '2020' }];
    const sortFn = (w: any, items: any[]) => items;
    expect(buildCitationHTML(winMock, refs, sortFn)).toBe('<span class="cit" data-ref="r1">John, 2020</span> ');
  });

  it('formatReference format fallback to apa7Reference', () => {
    const ref = { referenceType: 'book', authors: ['Kuhn, Thomas'], year: '1962', title: 'Structure' };
    expect(formatReference(winMock, ref)).toContain('Kuhn, T. (1962). <i>Structure</i>');
  });

  it('buildBibliographyHTML renders bibliography block', () => {
    const refs = [{ id: 'r1', authors: ['Smith, John'], year: '2020', title: 'A Book' }];
    const sortFn = (w: any, items: any[]) => items;
    expect(buildBibliographyHTML(winMock, refs, sortFn)).toContain('<h1>KAYNAKÇA</h1>');
    expect(buildBibliographyHTML(winMock, refs, sortFn)).toContain('Smith, J. (2020). A book.');
  });
});
