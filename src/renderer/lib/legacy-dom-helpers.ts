/**
 * Legacy DOM / state bridge helpers.
 *
 * Small utilities for talking to the legacy JS modules that mutate
 * `window.S` and `document.getElementById('...legacy-modal-id')`. Kept
 * separate from `legacy-window.ts` (which only typifies access) so React
 * components can import the behavior without dragging in the type wall.
 */

import { legacyWin } from './legacy-window';

/** Toggle a legacy modal element's `.show` class off. No-op if missing. */
export function hideLegacyModal(id: string) {
  document.getElementById(id)?.classList.remove('show');
}

/** Toggle a legacy modal element's `.show` class on. No-op if missing. */
export function showLegacyModal(id: string) {
  document.getElementById(id)?.classList.add('show');
}

/** HTML-escape a value for safe insertion into innerHTML. */
export function escapeHtml(value: unknown) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Return references for the active legacy workspace, or [] if missing. */
export function currentWorkspaceRefs(): any[] {
  const state = legacyWin().S || ({} as any);
  const workspace = Array.isArray(state.wss)
    ? state.wss.find((item: any) => item && item.id === state.cur)
    : null;
  return Array.isArray(workspace?.lib) ? (workspace as any).lib : [];
}

/** Return the active legacy workspace object, or null. */
export function currentWorkspace(): any | null {
  const state = legacyWin().S || ({} as any);
  return Array.isArray(state.wss)
    ? state.wss.find((item: any) => item && item.id === state.cur) || null
    : null;
}

/**
 * Push the current `window.S` snapshot into React via the legacy → React
 * sync hook. Debounced through `scheduleReactSyncFromLegacy`.
 */
export function syncReactFromLegacy() {
  const win = legacyWin();
  if (typeof win.__aqReactSyncFromLegacy === 'function') {
    try { win.__aqReactSyncFromLegacy(win.S || {}); } catch (_error) {}
  }
}

let reactSyncTimer: number | null = null;
export function scheduleReactSyncFromLegacy(delay = 120) {
  if (reactSyncTimer != null) window.clearTimeout(reactSyncTimer);
  reactSyncTimer = window.setTimeout(() => {
    reactSyncTimer = null;
    syncReactFromLegacy();
  }, delay);
}

/**
 * Tell the legacy runtime to persist state + recompute references + sync
 * React. The 80ms + 450ms delays preserve the empirical sequencing the
 * legacy runtime relies on (rRefs after save, then a deferred catch-up sync).
 */
export function saveLegacyState() {
  const win = legacyWin();
  try { if (typeof win.save === 'function') win.save(); } catch (_error) {}
  window.setTimeout(() => {
    try { if (typeof (win as any).rLib === 'function') (win as any).rLib(); } catch (_error) {}
    try { if (typeof win.rRefs === 'function') win.rRefs(); } catch (_error) {}
    try { if (typeof win.updateRefSection === 'function') win.updateRefSection(); } catch (_error) {}
  }, 80);
  scheduleReactSyncFromLegacy();
  window.setTimeout(() => scheduleReactSyncFromLegacy(0), 450);
}
