/**
 * Outline + Caption-Manager Modal Renderers
 *
 * Two thin renderers that populate the legacy "Belge Anahatı" and
 * "Başlık Yöneticisi" modals when the React toolbar opens them.
 * Extracted from TopToolbar.tsx to keep toolbar focused on UI state.
 *
 * The document outline is rendered here directly so React/AQ Engine imports
 * do not fall back to a stale legacy modal. Caption-manager still delegates
 * to the legacy handler first, then falls back to local rendering.
 */
import { callLegacy } from './legacy-feature-adapter';
import { legacyWin } from './legacy-window';

function escapeHTML(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function countSummaryValue(summary: Record<string, unknown>, singular: string, plural: string) {
  return Number(summary[singular] || summary[plural] || 0);
}

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
 * Open the document outline modal and render the entry list via
 * window.AQDocumentOutline.collectEntries / buildSummary.
 */
export function openDocumentOutline() {
  const backdropClose = makeBackdropClose();
  if (!showModalWithBackdrop('docOutlineModal', backdropClose)) return;
  const summary = document.getElementById('docOutlineSummary');
  const list = document.getElementById('docOutlineList');
  const win = legacyWin() as any;
  const api = win.AQDocumentOutline;
  const editor = win.editor || null;
  const root = document.getElementById('apaed');
  const scrollEl = document.getElementById('escroll');
  const searchEl = document.getElementById('docOutlineSearch') as HTMLInputElement | null;
  const filterEl = document.getElementById('docOutlineFilter') as HTMLSelectElement | null;
  if (!summary || !list || !api || typeof api.collectEntries !== 'function') return;

  let entries: any[] = api.collectEntries({ root, editor, document }) || [];
  let query = (searchEl?.value || '').trim();
  let filter = filterEl?.value || 'all';

  const render = () => {
    const filtered = typeof api.filterEntries === 'function'
      ? (api.filterEntries(entries, { type: filter, query }) || [])
      : entries;
    const built = typeof api.buildSummary === 'function' ? api.buildSummary(entries) : {};
    const headingCount = countSummaryValue(built, 'headingCount', 'headings');
    const tableCount = countSummaryValue(built, 'tableCount', 'tables');
    const figureCount = countSummaryValue(built, 'figureCount', 'figures');
    summary.textContent = entries.length
      ? `${headingCount} başlık, ${tableCount} tablo, ${figureCount} şekil${query ? ` • filtre: ${query}` : ''}`
      : 'Anahat için başlık, tablo veya şekil bulunamadı.';
    list.innerHTML = filtered.length
      ? filtered.map((entry: any) => {
        const type = String(entry.type || 'heading');
        const label = String(entry.label || entry.text || (type === 'table' ? 'Tablo' : type === 'figure' ? 'Şekil' : 'Başlık'));
        const title = String(entry.title && entry.title !== label ? entry.title : '');
        const level = Number(entry.level || 0);
        return `<button class="doc-outline-item" type="button" data-outline-id="${escapeHTML(entry.id || '')}" data-outline-type="${escapeHTML(type)}" data-level="${level || ''}"><span>${escapeHTML(label)}</span>${title ? `<span class="doc-outline-meta">${escapeHTML(title)}</span>` : ''}</button>`;
      }).join('')
      : (entries.length
        ? '<div class="empty">Bu filtreyle görünür başlık, tablo veya şekil yok.</div>'
        : '<div class="empty">Belgede başlık, tablo veya şekil yok.</div>');
  };
  render();

  list.onclick = (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('[data-outline-id]') as HTMLElement | null;
    if (!button || typeof api.scrollToEntry !== 'function') return;
    api.scrollToEntry({ root, editor, id: button.getAttribute('data-outline-id') || '' });
    closeModalWithBackdrop('docOutlineModal', backdropClose);
  };
  // Search / filter / refresh / current — on* handlers are idempotent, so the
  // legacy addEventListener bindings (__aqBound) are no longer needed.
  if (searchEl) searchEl.oninput = () => { query = (searchEl.value || '').trim(); render(); };
  if (filterEl) filterEl.onchange = () => { filter = filterEl.value || 'all'; render(); };
  const refreshBtn = document.getElementById('docOutlineRefreshBtn') as HTMLElement | null;
  if (refreshBtn) refreshBtn.onclick = () => { entries = api.collectEntries({ root, editor, document }) || []; render(); };
  const currentBtn = document.getElementById('docOutlineCurrentBtn') as HTMLElement | null;
  if (currentBtn) currentBtn.onclick = () => {
    if (typeof api.findActiveEntry !== 'function' || typeof api.scrollToEntry !== 'function') return;
    const active = api.findActiveEntry(entries, { root, editor, document, scrollEl });
    if (active && active.id) {
      api.scrollToEntry({ root, editor, id: active.id });
      closeModalWithBackdrop('docOutlineModal', backdropClose);
    }
  };
  const closeBtn = document.getElementById('docOutlineCloseBtn') as HTMLElement | null;
  if (closeBtn) closeBtn.onclick = () => closeModalWithBackdrop('docOutlineModal', backdropClose);
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
