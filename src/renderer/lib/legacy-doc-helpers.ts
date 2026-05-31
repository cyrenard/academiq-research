/**
 * Legacy Document / Auxiliary-Page Helpers
 *
 * Small utilities for reading from / writing to the legacy `window.S`
 * document state and the auxiliary DOM pages (#coverpage, #tocpage,
 * #abstractpage, #appendixpage, #bibpage). Extracted from TopToolbar.tsx
 * to keep the toolbar focused on UI wiring.
 *
 * These helpers don't own any React state. They mutate `window.S.docs`
 * (the legacy state mirror) and the legacy auxiliary-page DOM elements
 * directly. Callers usually pair them with `saveLegacyState()` from
 * legacy-dom-helpers to persist + sync back to React.
 */
import { legacyWin } from './legacy-window';
import { appStore } from './app-store';

/**
 * Return the active document record from app state, or the first doc when
 * `curDoc` doesn't match. Returns null when docs are missing.
 */
export function getActiveDocRecord(): any | null {
  const state = appStore.getState();
  const docs = Array.isArray(state.docs) ? state.docs : [];
  return docs.find((item: any) => item && item.id === state.curDoc) || docs[0] || null;
}

/**
 * Push the current editor HTML into app state + legacy mirror (`state.doc`
 * + `docs[active].content`). Returns the HTML that was written so the
 * caller can use it for further work.
 */
export function commitEditorHTMLToLegacyState(html: string): string {
  const state = appStore.getState();
  if (!state || typeof state !== 'object') return html;
  state.doc = html;
  const docs = Array.isArray(state.docs) ? state.docs : [];
  const docId = state.curDoc;
  const doc = docs.find((item: any) => item && item.id === docId) || docs[0];
  if (doc) doc.content = html;
  appStore.setState({ doc: html, docs });
  return html;
}

/**
 * Pass auxiliary-page HTML through the legacy `sanitizeAuxPageHTML`
 * sanitizer when present; otherwise returns input unchanged. Used
 * before storing TOC/cover/abstract/appendix HTML in doc records.
 */
export function sanitizeAuxiliaryHTML(html: string): string {
  const sanitizer = (legacyWin() as any).sanitizeAuxPageHTML;
  return typeof sanitizer === 'function' ? sanitizer(html) : html;
}

/**
 * Persist auxiliary-page changes through the legacy save chain.
 * - Calls `syncAuxiliaryPages` if registered (re-renders auxiliary DOM)
 * - Then calls `save` to flush state to disk
 * - When no save helper exists, calls the supplied `fallbackNotify`
 *
 * The fallback notify is used to give the editor a chance to emit an
 * update event so React picks up the change.
 */
export function saveAuxiliaryChange(fallbackNotify?: () => void) {
  const win = legacyWin();
  const w = win as any;
  try {
    if (typeof w.syncAuxiliaryPages === 'function') w.syncAuxiliaryPages();
  } catch (error) {
    console.warn('[auxiliary-pages] sync failed', error);
  }
  if (typeof win.save === 'function') {
    win.save();
  } else if (typeof fallbackNotify === 'function') {
    fallbackNotify();
  }
}

/**
 * Show a tone-coloured status text via legacy `window.setDst`.
 * No-op when the helper isn't registered.
 */
export function setStatusText(message: string, tone: 'ok' | 'er' = 'ok') {
  const setter = (legacyWin() as any).setDst;
  if (typeof setter === 'function') setter(message, tone);
}

/**
 * Apply the rendered HTML to an auxiliary-page DOM block (e.g.
 * #tocbody inside #tocpage). Toggles the parent page's display
 * between 'block' and 'none' based on whether the content has any
 * non-whitespace.
 *
 * `onShown` runs after a non-empty render so callers can decorate
 * the body (e.g. inject the "Özü Sil" button on abstract pages).
 */
export function setAuxiliaryPageHTML(
  pageId: string,
  bodyId: string,
  html: string,
  onShown?: (body: HTMLElement) => void
) {
  const page = document.getElementById(pageId);
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = html;
  if (page) page.style.display = html.trim() ? 'block' : 'none';
  if (html.trim() && body instanceof HTMLElement && typeof onShown === 'function') {
    onShown(body);
  }
}
