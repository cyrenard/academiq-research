import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  scheduleCitationAudit,
  runCitationAuditNow
} from './citation-audit-controller';
import { appStore } from './app-store';

function paintDocumentWithCitations(citations: Array<{ ref: string; text: string; mode?: string }>) {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.setAttribute('data-aq-engine-editor', 'true');
  document.body.appendChild(container);

  citations.forEach((c) => {
    const span = document.createElement('span');
    span.className = 'cit';
    span.textContent = c.text;
    span.setAttribute('data-ref', c.ref);
    if (c.mode) {
      span.setAttribute('data-mode', c.mode);
    }
    container.appendChild(span);
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
  appStore.setState({ cur: 'ws-1', wss: [{ id: 'ws-1', name: 'Workspace 1', lib: [] }] });
  delete (window as any).AQReferenceManager;
  delete (window as any).AQCitationStyles;
  delete (window as any).visibleCitationText;
  delete (window as any).findRef;
});

describe('Citation Audit Controller', () => {
  it('does nothing if no citations are in document', () => {
    paintDocumentWithCitations([]);
    runCitationAuditNow();
    expect(document.body.querySelectorAll('.aq-citation-error').length).toBe(0);
    expect(document.body.querySelectorAll('.aq-citation-mismatch').length).toBe(0);
  });

  it('marks citation as error if ID is not in library', () => {
    paintDocumentWithCitations([{ ref: 'ref-1', text: '(Doe, 2020)' }]);
    (window as any).AQReferenceManager = {
      getLibrary: () => []
    };
    runCitationAuditNow();
    expect(document.body.querySelectorAll('.aq-citation-error').length).toBe(1);
    expect(document.body.querySelectorAll('.aq-citation-mismatch').length).toBe(0);
  });

  it('marks citation as mismatch if visible text differs from expected citation text', () => {
    paintDocumentWithCitations([{ ref: 'ref-1', text: '(Wrong, 2021)' }]);
    (window as any).AQReferenceManager = {
      getLibrary: () => [{ id: 'ref-1', title: 'Test Title' }]
    };
    (window as any).AQCitationStyles = {
      visibleCitationText: (refs: any[]) => '(Doe, 2020)'
    };
    runCitationAuditNow();
    expect(document.body.querySelectorAll('.aq-citation-error').length).toBe(0);
    expect(document.body.querySelectorAll('.aq-citation-mismatch').length).toBe(1);
  });

  it('clears error/mismatch classes if citation is valid and matches', () => {
    paintDocumentWithCitations([{ ref: 'ref-1', text: '(Doe, 2020)' }]);
    const el = document.body.querySelector('.cit') as HTMLElement;
    el.classList.add('aq-citation-error', 'aq-citation-mismatch');

    (window as any).AQReferenceManager = {
      getLibrary: () => [{ id: 'ref-1', title: 'Test Title' }]
    };
    (window as any).AQCitationStyles = {
      visibleCitationText: (refs: any[]) => '(Doe, 2020)'
    };

    runCitationAuditNow();
    expect(el.classList.contains('aq-citation-error')).toBe(false);
    expect(el.classList.contains('aq-citation-mismatch')).toBe(false);
  });

  it('falls back to legacy findRef with active app-store workspace id', () => {
    paintDocumentWithCitations([{ ref: 'ref-1', text: '(Doe, 2020)' }]);
    (window as any).AQReferenceManager = {
      getLibrary: () => []
    };
    (window as any).findRef = vi.fn(() => ({ id: 'ref-1', title: 'Test Title' }));
    (window as any).AQCitationStyles = {
      visibleCitationText: () => '(Doe, 2020)'
    };

    runCitationAuditNow();

    expect((window as any).findRef).toHaveBeenCalledWith('ref-1', 'ws-1');
    expect(document.body.querySelectorAll('.aq-citation-error').length).toBe(0);
  });
});

describe('scheduleCitationAudit (debounce)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('coalesces rapid calls and runs audit', () => {
    paintDocumentWithCitations([{ ref: 'ref-1', text: '(Doe, 2020)' }]);
    const el = document.body.querySelector('.cit') as HTMLElement;
    el.classList.add('aq-citation-error');

    (window as any).AQReferenceManager = {
      getLibrary: () => [{ id: 'ref-1', title: 'Test Title' }]
    };
    (window as any).AQCitationStyles = {
      visibleCitationText: (refs: any[]) => '(Doe, 2020)'
    };

    scheduleCitationAudit();
    scheduleCitationAudit();
    scheduleCitationAudit();

    expect(el.classList.contains('aq-citation-error')).toBe(true);
    vi.advanceTimersByTime(700);
    expect(el.classList.contains('aq-citation-error')).toBe(false);
  });
});
