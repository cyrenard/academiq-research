/**
 * Outline + Caption-Manager Modal Renderers
 *
 * Two thin renderers that populate the legacy "Belge Anahatı" and
 * "Başlık Yöneticisi" modals when the React toolbar opens them.
 * Extracted from TopToolbar.tsx to keep toolbar focused on UI state.
 *
 * Both modals try a legacy `callLegacy('open...')` first; if that
 * returns false (no legacy handler), they populate the modal HTML
 * themselves using window.AQDocumentOutline / window.AQAcademicObjects.
 */
import { callLegacy } from './legacy-feature-adapter';
import { legacyWin } from './legacy-window';

/**
 * Add .show + backdrop-click handler to the modal. Returns false if
 * the modal element doesn't exist.
 */
function showModalWithBackdrop(id: string, onBackdropClose: (e: MouseEvent) => void) {
  const modal = document.getElementById(id);
  if (!modal) return false;
  modal.classList.add('show');
  modal.addEventListener('mousedown', onBackdropClose);
  return true;
}

function closeModalWithBackdrop(id: string, onBackdropClose: (e: MouseEvent) => void) {
  const modal = document.getElementById(id);
  if (!modal) return false;
  modal.classList.remove('show');
  modal.removeEventListener('mousedown', onBackdropClose);
  return true;
}

function makeBackdropClose() {
  const handler = (event: MouseEvent) => {
    if (event.target !== event.currentTarget) return;
    const modal = event.currentTarget as HTMLElement;
    modal.classList.remove('show');
    modal.removeEventListener('mousedown', handler);
  };
  return handler;
}

/**
 * Open the document outline modal. Tries the legacy
 * `openDocumentOutline` first; falls back to rendering the entry list
 * via window.AQDocumentOutline.collectEntries / buildSummary.
 */
export function openDocumentOutline() {
  if (callLegacy('openDocumentOutline')) return;
  const backdropClose = makeBackdropClose();
  if (!showModalWithBackdrop('docOutlineModal', backdropClose)) return;
  const summary = document.getElementById('docOutlineSummary');
  const list = document.getElementById('docOutlineList');
  const win = legacyWin() as any;
  const api = win.AQDocumentOutline;
  const editor = win.editor || null;
  const root = document.getElementById('apaed');
  if (!summary || !list || !api || typeof api.collectEntries !== 'function') return;
  const entries = api.collectEntries({ root, editor }) || [];
  const built = typeof api.buildSummary === 'function' ? api.buildSummary(entries) : {};
  summary.textContent = entries.length
    ? `${built.headingCount || 0} başlık, ${built.tableCount || 0} tablo, ${built.figureCount || 0} Şekil`
    : 'Anahat için başlık bulunamadı.';
  list.innerHTML = entries.length
    ? entries.map((entry: any) => `<button class="doc-outline-item" type="button" data-outline-id="${String(entry.id || '')}"><span>${String(entry.label || entry.text || 'Başlık')}</span></button>`).join('')
    : '<div class="empty">Belgede başlık yok.</div>';
  list.onclick = (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('[data-outline-id]') as HTMLElement | null;
    if (!button || typeof api.scrollToEntry !== 'function') return;
    api.scrollToEntry({ root, editor, id: button.getAttribute('data-outline-id') || '' });
    closeModalWithBackdrop('docOutlineModal', backdropClose);
  };
  document.getElementById('docOutlineCloseBtn')?.addEventListener(
    'click',
    () => closeModalWithBackdrop('docOutlineModal', backdropClose),
    { once: true }
  );
}

/**
 * Open the caption manager modal (Table/Figure headings). Tries legacy
 * `openCaptionManager` first; falls back to
 * window.AQAcademicObjects.getCaptionManagerEntries.
 */
export function openCaptionManager() {
  if (callLegacy('openCaptionManager')) return;
  const backdropClose = makeBackdropClose();
  if (!showModalWithBackdrop('captionManagerModal', backdropClose)) return;
  const summary = document.getElementById('captionManagerSummary');
  const list = document.getElementById('captionManagerList');
  const win = legacyWin() as any;
  const api = win.AQAcademicObjects;
  const editor = win.editor || null;
  const root = document.getElementById('apaed');
  if (!summary || !list) return;
  const entries = api && typeof api.getCaptionManagerEntries === 'function'
    ? api.getCaptionManagerEntries({ root, editor }) || []
    : [];
  summary.textContent = entries.length ? `${entries.length} başlık bulundu.` : 'Tablo veya Şekil başlığı bulunamadı.';
  list.innerHTML = entries.length
    ? entries.map((entry: any) => `<button class="doc-outline-item" type="button" data-caption-target="${String(entry.id || '')}">${String(entry.label || entry.title || entry.text || 'Başlık')}</button>`).join('')
    : '<div class="empty">Başlık yok.</div>';
  document.getElementById('captionManagerCloseBtn')?.addEventListener(
    'click',
    () => closeModalWithBackdrop('captionManagerModal', backdropClose),
    { once: true }
  );
}
