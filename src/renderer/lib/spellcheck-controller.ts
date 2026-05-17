/**
 * Renderer-wide spell-check coordinator.
 *
 * Sits between the spellcheck.ts engine (pure function: text → matches)
 * and the rest of the renderer (AQ Engine document, StatusBar chip,
 * right-click menu). Responsibilities:
 *
 *   - own the enabled/disabled toggle and persist nothing — that's the
 *     Settings layer's job;
 *   - lazy-load the dictionary on first enable;
 *   - debounce re-checks when the editor changes;
 *   - run the check against the current AQ Engine document text and
 *     tag the matching token spans with `.aq-spell-error` so the CSS
 *     wavy underline shows up;
 *   - publish the match list so the StatusBar can show a count and
 *     the right-click menu can pull suggestions for a given offset.
 *
 * Lives in a singleton because we want exactly one debounce timer and
 * one match list per renderer.
 */

import {
  ensureSpellLoaded,
  checkLoaded,
  checkText,
  isSpellReady,
  isNativeSpellReady,
  disposeSpell,
  type SpellMatch
} from './spellcheck';

export type SpellcheckListener = (state: SpellcheckState) => void;

export interface SpellcheckState {
  enabled: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
  matches: SpellMatch[];
}

let enabled = false;
let loading = false;
let lastError: string | null = null;
let lastMatches: SpellMatch[] = [];
let debounceHandle: ReturnType<typeof setTimeout> | null = null;
let runToken = 0;
const listeners = new Set<SpellcheckListener>();

const DEBOUNCE_MS = 700;
const SPELL_CLASS = 'aq-spell-error';

function snapshot(): SpellcheckState {
  return {
    enabled,
    ready: isSpellReady(),
    loading,
    error: lastError,
    matches: lastMatches
  };
}

function emit(): void {
  const s = snapshot();
  listeners.forEach((fn) => { try { fn(s); } catch (_e) {} });
}

/**
 * Subscribe to state changes (enable toggle, dictionary load, new
 * matches). Returns an unsubscribe.
 */
export function subscribeSpellcheck(fn: SpellcheckListener): () => void {
  listeners.add(fn);
  // Synchronous initial push so React hooks see the current value.
  try { fn(snapshot()); } catch (_e) {}
  return () => { listeners.delete(fn); };
}

export function getSpellcheckState(): SpellcheckState {
  return snapshot();
}

/**
 * Master toggle. Loading is async (~9 MB fetch the first time);
 * subscribers see `loading: true` during the fetch and `ready: true`
 * once it completes.
 */
export function setSpellcheckEnabled(value: boolean): void {
  if (enabled === value) return;
  enabled = value;
  if (!enabled) {
    clearMarkers();
    lastMatches = [];
    emit();
    return;
  }
  emit();
  if (isSpellReady()) {
    runCheckNow();
    return;
  }
  loading = true;
  lastError = null;
  emit();
  ensureSpellLoaded()
    .then(() => {
      loading = false;
      emit();
      runCheckNow();
    })
    .catch((err) => {
      loading = false;
      lastError = err && err.message ? String(err.message) : 'load failed';
      emit();
    });
}

/**
 * Debounced re-check. Cheap to call on every editor keystroke — the
 * heavy `checkLoaded()` only fires after DEBOUNCE_MS of quiet.
 */
export function scheduleRecheck(): void {
  if (!enabled || !isSpellReady()) return;
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    runCheckNow();
  }, DEBOUNCE_MS);
}

/** Run an immediate check, bypassing the debounce. */
export function runCheckNow(): void {
  if (!enabled || !isSpellReady()) return;
  const text = getActiveDocumentText();
  if (text === lastDocumentText && lastMatches.length === 0) {
    // No change since last run AND nothing flagged — nothing to do.
    return;
  }
  lastDocumentText = text;
  if (!isNativeSpellReady()) {
    lastMatches = checkLoaded(text);
    applyMarkers(lastMatches);
    emit();
    return;
  }
  const token = ++runToken;
  checkText(text)
    .then((matches) => {
      if (!enabled || token !== runToken) return;
      lastMatches = matches;
      applyMarkers(lastMatches);
      emit();
    })
    .catch((err) => {
      if (!enabled || token !== runToken) return;
      lastError = err && err.message ? String(err.message) : 'spellcheck failed';
      emit();
    });
}

/** Free the in-memory dictionary. Calling enable again re-loads it. */
export function shutdownSpellcheck(): void {
  enabled = false;
  loading = false;
  lastMatches = [];
  lastError = null;
  lastDocumentText = '';
  runToken += 1;
  clearMarkers();
  disposeSpell();
  emit();
}

// ─── Internals ──────────────────────────────────────────────────────────────

let lastDocumentText = '';

function getActiveDocumentText(): string {
  const win = window as any;
  try {
    if (typeof win.getActiveEditorInstance === 'function') {
      const editor = win.getActiveEditorInstance();
      if (editor && typeof editor.getText === 'function') {
        return String(editor.getText() || '');
      }
    }
  } catch (_e) {}
  // Fallback: stitch text from every rendered token span. Slower but
  // works even if the editor instance isn't reachable from window.
  const out: string[] = [];
  document.querySelectorAll<HTMLElement>('span[data-offset-start]').forEach((el) => {
    out.push(el.textContent || '');
  });
  return out.join(' ');
}

function clearMarkers(): void {
  document.querySelectorAll<HTMLElement>('.' + SPELL_CLASS).forEach((el) => {
    el.classList.remove(SPELL_CLASS);
    el.removeAttribute('data-spell-offset');
  });
}

function applyMarkers(matches: SpellMatch[]): void {
  clearMarkers();
  if (matches.length === 0) return;
  const spans = document.querySelectorAll<HTMLElement>('span[data-offset-start]');
  // Build a lightweight index so we don't N×M scan when there are many
  // matches. Spans are usually already in document order, but we don't
  // rely on it.
  const sortedSpans: Array<{ el: HTMLElement; start: number; end: number }> = [];
  spans.forEach((el) => {
    const start = Number(el.dataset.offsetStart);
    const end = Number(el.dataset.offsetEnd);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      sortedSpans.push({ el, start, end });
    }
  });
  sortedSpans.sort((a, b) => a.start - b.start);

  // For each match, mark every span whose [start,end) intersects it.
  for (const m of matches) {
    const mStart = m.offset;
    const mEnd = m.offset + m.length;
    // Binary search for the first span that ends after mStart.
    let lo = 0;
    let hi = sortedSpans.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedSpans[mid]!.end <= mStart) lo = mid + 1;
      else hi = mid;
    }
    for (let i = lo; i < sortedSpans.length; i++) {
      const s = sortedSpans[i]!;
      if (s.start >= mEnd) break;
      s.el.classList.add(SPELL_CLASS);
      // Record the match offset so the right-click menu can map a
      // clicked span back to its suggestions later.
      s.el.dataset.spellOffset = String(mStart);
    }
  }
}
