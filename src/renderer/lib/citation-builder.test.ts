import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCitationStyle,
  getCurrentDocument,
  setCitationStyle,
  getInlineCitationText,
  visibleCitationText,
  narrativeCitationText,
  buildCitationHTML,
  formatReference,
  buildBibliographyHTML
} from './citation-builder';
import { appStore } from './app-store';

describe('citation-builder', () => {
  const winMock: any = {
  };

  beforeEach(() => {
    appStore.setState({
      curDoc: 'doc-1',
      docs: [
        { id: 'doc-1', content: '', citationStyle: 'apa7' } as any
      ],
      cm: 'apa7'
    });
  });

  it('getCitationStyle falls back to apa7', () => {
    expect(getCitationStyle(winMock)).toBe('apa7');
    expect(getCitationStyle({})).toBe('apa7');
  });

  it('getCurrentDocument matches the legacy current-doc fallback order', () => {
    expect(getCurrentDocument(winMock)?.id).toBe('doc-1');
    appStore.setState({ curDoc: '', docs: [{ id: 'first', content: '' }, { id: 'second', content: '' }] });
    expect(getCurrentDocument({})?.id).toBe('first');
    const stateApi = {
      getCurrentDocumentFromState: vi.fn(() => ({ id: 'from-state' }))
    };
    appStore.setState({ curDoc: 'doc-x', docs: [] });
    expect(getCurrentDocument({ AQBibliographyState: stateApi })?.id).toBe('from-state');
    expect(stateApi.getCurrentDocumentFromState).toHaveBeenCalledWith(expect.objectContaining({ curDoc: 'doc-x', docs: [] }), 'doc-x');
  });

  it('setCitationStyle mutates only the current document and normalizes like legacy', () => {
    const win = {};
    expect(setCitationStyle(win, ' Chicago ')).toBe('chicago');
    expect((appStore.getState().docs[0] as any).citationStyle).toBe('chicago');
    expect((appStore.getState() as any).citationStyle).toBeUndefined();
    appStore.setState({ curDoc: '', docs: [] });
    expect(setCitationStyle({}, 'apa7')).toBeNull();
  });

  it('setCitationStyle delegates style normalization when the style engine exists', () => {
    appStore.setState({ curDoc: 'doc-1', docs: [{ id: 'doc-1', content: '' }] });
    const win = {
      AQCitationStyles: { normalizeStyleId: vi.fn(() => 'vancouver') }
    };
    expect(setCitationStyle(win, 'VAN')).toBe('vancouver');
    expect(win.AQCitationStyles.normalizeStyleId).toHaveBeenCalledWith('VAN');
  });

  it('getInlineCitationText fallback uses the author surname (legacy inText)', () => {
    const ref = { id: 'r1', authors: ['Smith, John'], year: '2020' };
    expect(getInlineCitationText(winMock, ref)).toBe('(Smith, 2020)');
    // Missing year and no authors fall back to legacy values.
    expect(getInlineCitationText(winMock, { id: 'r2' })).toBe('(Bilinmeyen, t.y.)');
  });

  it('visibleCitationText joins multiple references by surname', () => {
    const refs = [
      { id: 'r1', authors: ['Smith, John'], year: '2020' },
      { id: 'r2', authors: ['Doe, Jane'], year: '2021' }
    ];
    expect(visibleCitationText(winMock, refs)).toBe('Smith, 2020; Doe, 2021');
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
    expect(buildCitationHTML(winMock, refs, sortFn)).toBe('<span class="cit" data-ref="r1">Smith, 2020</span> ');
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
