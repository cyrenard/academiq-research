/**
 * Typed accessor for the legacy `window` surface.
 *
 * Usage:
 *   import { legacyWin } from '../lib/legacy-window';
 *   legacyWin().S?.cur;
 *   legacyWin().AQCitationRuntime?.init?.();
 *
 * The cast lives in one place so a future cleanup pass can search
 * `legacyWin\\(` to find every legacy-coupled call site, or replace the
 * implementation entirely.
 */
export function legacyWin(): LegacyWindow {
  return window as LegacyWindow;
}

/**
 * Returns the legacy state object if present, or null. Safer than
 * `legacyWin().S` for read-only paths because callers must opt into the
 * null check.
 */
export function legacyState(): LegacyState | null {
  const s = legacyWin().S;
  return s && typeof s === 'object' ? s : null;
}
