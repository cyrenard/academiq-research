/**
 * Publish a React-side app state snapshot onto the global `window.S` slot
 * that legacy-runtime.js reads through 177+ field accesses (S.wss, S.cur,
 * S.docs, …). The existing `window.S` is kept as the prototype copy so
 * legacy-owned keys not present in `nextState` (e.g. transient editor
 * flags that legacy sets on itself) survive a React re-publish.
 *
 * `extra` is an optional shallow override that lands on top of
 * `nextState`. It's used by code paths that publish "this state, except
 * with a different active workspace" — see App.tsx::handleReferenceAction
 * for the open action.
 *
 * # Why a fresh spread instead of in-place mutation
 *
 * Mutation would be a memory win, but legacy hydrate paths in
 * `legacy-runtime.js` (lines 446, 448, 582, 596 at the time of writing)
 * reassign `S` wholesale, e.g. `S = window.AQStateSchema.hydrate(...)`.
 * An in-place mutation on a React tick that races against such a swap
 * would silently drop the React update onto the wrong object. The
 * fresh-spread approach is what the codebase has shipped with through
 * the beta train; this helper just hoists it to one place so future
 * tuning (debounce, batched copy, structural sharing) is a one-file
 * change rather than five.
 */
export function publishStateToLegacyWindow<S extends object>(
  nextState: S,
  extra?: Partial<S>
): void {
  const win = window as unknown as { S?: Record<string, unknown> };
  const base = (win.S && typeof win.S === 'object' && !Array.isArray(win.S))
    ? win.S
    : {};
  win.S = extra
    ? { ...base, ...nextState, ...extra }
    : { ...base, ...nextState };
}
