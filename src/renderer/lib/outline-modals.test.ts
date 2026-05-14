import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openDocumentOutline, openCaptionManager } from './outline-modals';

function buildModalDom() {
  document.body.innerHTML = `
    <div id="docOutlineModal">
      <div id="docOutlineSummary"></div>
      <div id="docOutlineList"></div>
      <button id="docOutlineCloseBtn">Kapat</button>
    </div>
    <div id="captionManagerModal">
      <div id="captionManagerSummary"></div>
      <div id="captionManagerList"></div>
      <button id="captionManagerCloseBtn">Kapat</button>
    </div>
    <div id="apaed"></div>
  `;
}

beforeEach(() => {
  buildModalDom();
});

afterEach(() => {
  delete (window as any).editor;
  delete (window as any).AQDocumentOutline;
  delete (window as any).AQAcademicObjects;
  delete (window as any).openDocumentOutline;
  delete (window as any).openCaptionManager;
  document.body.innerHTML = '';
});

// ─── openDocumentOutline ─────────────────────────────────────────────────

describe('openDocumentOutline', () => {
  it('returns early when legacy openDocumentOutline returns truthy', () => {
    (window as any).openDocumentOutline = vi.fn(() => true);
    openDocumentOutline();
    // .show NOT added because the legacy handler took over
    expect(document.getElementById('docOutlineModal')!.classList.contains('show')).toBe(false);
  });

  it('does not crash when modal DOM is missing', () => {
    document.body.innerHTML = '';
    expect(() => openDocumentOutline()).not.toThrow();
  });

  it('adds .show class and renders entries when AQDocumentOutline available', () => {
    (window as any).AQDocumentOutline = {
      collectEntries: () => [
        { id: 'h1', label: 'Introduction' },
        { id: 'h2', label: 'Methods' }
      ],
      buildSummary: () => ({ headingCount: 2, tableCount: 0, figureCount: 0 })
    };
    openDocumentOutline();
    const modal = document.getElementById('docOutlineModal')!;
    expect(modal.classList.contains('show')).toBe(true);
    expect(document.getElementById('docOutlineSummary')!.textContent).toMatch(/2 başlık/);
    const buttons = document.querySelectorAll('[data-outline-id]');
    expect(buttons.length).toBe(2);
    expect((buttons[0] as HTMLElement).getAttribute('data-outline-id')).toBe('h1');
  });

  it('shows empty state when no entries collected', () => {
    (window as any).AQDocumentOutline = { collectEntries: () => [] };
    openDocumentOutline();
    expect(document.getElementById('docOutlineList')!.innerHTML).toMatch(/Belgede başlık yok/);
  });

  it('clicking an entry triggers scrollToEntry + closes modal', () => {
    const scrollToEntry = vi.fn();
    (window as any).AQDocumentOutline = {
      collectEntries: () => [{ id: 'h1', label: 'Intro' }],
      scrollToEntry
    };
    openDocumentOutline();
    const btn = document.querySelector('[data-outline-id]') as HTMLElement;
    btn.click();
    expect(scrollToEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1' }));
    expect(document.getElementById('docOutlineModal')!.classList.contains('show')).toBe(false);
  });

  it('does nothing without AQDocumentOutline.collectEntries', () => {
    openDocumentOutline();
    // Modal opens but list stays empty + no crash
    expect(document.getElementById('docOutlineList')!.innerHTML).toBe('');
  });
});

// ─── openCaptionManager ──────────────────────────────────────────────────

describe('openCaptionManager', () => {
  it('returns early when legacy openCaptionManager returns truthy', () => {
    (window as any).openCaptionManager = vi.fn(() => true);
    openCaptionManager();
    expect(document.getElementById('captionManagerModal')!.classList.contains('show')).toBe(false);
  });

  it('does not crash when modal DOM is missing', () => {
    document.body.innerHTML = '';
    expect(() => openCaptionManager()).not.toThrow();
  });

  it('renders caption entries from AQAcademicObjects', () => {
    (window as any).AQAcademicObjects = {
      getCaptionManagerEntries: () => [
        { id: 'tbl1', label: 'Tablo 1' },
        { id: 'fig1', label: 'Şekil 1' }
      ]
    };
    openCaptionManager();
    const list = document.getElementById('captionManagerList')!;
    expect(list.querySelectorAll('[data-caption-target]').length).toBe(2);
    expect(document.getElementById('captionManagerSummary')!.textContent).toMatch(/2 başlık bulundu/);
  });

  it('shows empty-state message when no entries', () => {
    (window as any).AQAcademicObjects = { getCaptionManagerEntries: () => [] };
    openCaptionManager();
    expect(document.getElementById('captionManagerList')!.innerHTML).toMatch(/Başlık yok/);
    expect(document.getElementById('captionManagerSummary')!.textContent).toMatch(/Tablo veya Şekil/);
  });

  it('shows empty-state when AQAcademicObjects API absent', () => {
    openCaptionManager();
    expect(document.getElementById('captionManagerList')!.innerHTML).toMatch(/Başlık yok/);
  });
});
