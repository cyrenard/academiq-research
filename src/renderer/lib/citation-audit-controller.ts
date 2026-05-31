/**
 * Renderer-wide citation audit coordinator.
 *
 * Scans `span.cit` elements in the editor, checks them against the active
 * reference database, and applies styling classes.
 *
 * - `.aq-citation-error`: if one or more reference IDs do not exist in the database.
 * - `.aq-citation-mismatch`: if the visible text of the span does not match the generated citation text.
 */
import { appStore, selectCurrentWorkspaceId } from './app-store';

let debounceHandle: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 600;

/**
 * Debounced citation audit trigger.
 */
export function scheduleCitationAudit(): void {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    runCitationAuditNow();
  }, DEBOUNCE_MS);
}

/**
 * Run citation audit immediately.
 */
export function runCitationAuditNow(): void {
  if (typeof document === 'undefined') return;

  const win = window as any;
  const root = document.querySelector('[data-aq-engine-editor]') || document;
  const domCitations = root.querySelectorAll('span.cit');

  if (domCitations.length === 0) return;

  const references = win.AQReferenceManager?.getLibrary?.() || [];
  const getRef = (id: string) => {
    if (win.AQReferenceManager?.findReference) {
      return win.AQReferenceManager.findReference(id);
    }
    if (typeof win.findRef === 'function') {
      return win.findRef(id, selectCurrentWorkspaceId(appStore.getState()));
    }
    return null;
  };

  const normalize = (t: string) => t.replace(/[()]/g, '').trim().toLowerCase();

  domCitations.forEach((el) => {
    const refAttr = el.getAttribute('data-ref') || '';
    const ids = refAttr.split(',').map((id) => id.trim()).filter(Boolean);

    if (ids.length === 0) {
      el.classList.remove('aq-citation-error', 'aq-citation-mismatch');
      return;
    }

    const missingIds = ids.filter((id) => {
      const found = references.some((r: any) => r && r.id === id);
      if (found) return false;
      const foundBackup = getRef(id);
      return !foundBackup;
    });

    if (missingIds.length > 0) {
      el.classList.add('aq-citation-error');
      el.classList.remove('aq-citation-mismatch');
    } else {
      const refs = ids.map((id) => references.find((r: any) => r && r.id === id) || getRef(id)).filter(Boolean);
      const mode = el.getAttribute('data-mode') || 'inline';
      let expectedText = '';

      if (win.AQCitationStyles && typeof win.AQCitationStyles.visibleCitationText === 'function') {
        try {
          expectedText = win.AQCitationStyles.visibleCitationText(refs, { mode });
        } catch (_) {}
      } else if (typeof win.visibleCitationText === 'function') {
        try {
          expectedText = win.visibleCitationText(refs);
        } catch (_) {}
      }

      if (expectedText) {
        const text = el.textContent || '';
        if (normalize(text) !== normalize(expectedText)) {
          el.classList.add('aq-citation-mismatch');
          el.classList.remove('aq-citation-error');
        } else {
          el.classList.remove('aq-citation-error', 'aq-citation-mismatch');
        }
      } else {
        el.classList.remove('aq-citation-error', 'aq-citation-mismatch');
      }
    }
  });
}
