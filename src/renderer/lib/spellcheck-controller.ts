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
  disposeSpell,
  type SpellMatch
} from './spellcheck';
import { checkLanguageRules } from './language-rules';
import { appStore, selectWorkspaceLibrary } from './app-store';

export type SpellcheckListener = (state: SpellcheckState) => void;

export interface SpellcheckState {
  enabled: boolean;
  ready: boolean;
  loading: boolean;
  error: string | null;
  matches: SpellMatch[];
  workspaceId: string | null;
  docId: string | null;
  scopeKey: string;
}

let enabled = false;
let loading = false;
let lastError: string | null = null;
let lastMatches: SpellMatch[] = [];
let debounceHandle: ReturnType<typeof setTimeout> | null = null;
let runToken = 0;
const listeners = new Set<SpellcheckListener>();

let currentWorkspaceId: string | null = null;
let currentDocId: string | null = null;

const DEBOUNCE_MS = 700;
const SPELL_CLASS = 'aq-spell-error';
const NATIVE_CHUNK_CHARS = 9000;
const MAX_AUTO_CHECK_CHARS = 60000;
const MAX_DEEP_CHECK_CHARS = 220000;
const VISIBLE_CONTEXT_BEFORE = 4000;
const VISIBLE_CONTEXT_AFTER = 18000;
const MAX_MARKED_MATCHES = 700;

function snapshot(): SpellcheckState {
  return {
    enabled,
    ready: isSpellReady(),
    loading,
    error: lastError,
    matches: lastMatches,
    workspaceId: currentWorkspaceId,
    docId: currentDocId,
    scopeKey: `${currentWorkspaceId || ''}:${currentDocId || ''}`
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
  ensureSpellLoaded({ preferNative: preferNativeSpell() })
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
export function runCheckNow(options: { deep?: boolean } = {}): void {
  if (!enabled || !isSpellReady()) return;
  if (checkInFlight) {
    pendingCheck = true;
    return;
  }
  const fullText = getActiveDocumentText();
  const selection = selectDocumentTextForCheck(fullText, options);
  const text = selection.text;
  if (text === lastDocumentText && lastMatches.length === 0) {
    // No change since last run AND nothing flagged — nothing to do.
    return;
  }
  lastDocumentText = text;
  if (!preferNativeSpell()) {
    const rawMatches = checkLoaded(text).map((match) => ({ ...match, offset: match.offset + selection.baseOffset }));
    lastMatches = processAndCombineMatches(rawMatches, text, selection.baseOffset);
    applyMarkers(lastMatches);
    emit();
    return;
  }
  const token = ++runToken;
  checkInFlight = true;
  pendingCheck = false;
  checkTextCooperatively(text, token, selection.baseOffset, options.deep ? MAX_DEEP_CHECK_CHARS : MAX_AUTO_CHECK_CHARS)
    .then((matches) => {
      if (!enabled || token !== runToken || !matches) return;
      lastMatches = processAndCombineMatches(matches, text, selection.baseOffset);
      applyMarkers(lastMatches);
      emit();
    })
    .catch((err) => {
      if (!enabled || token !== runToken) return;
      lastError = err && err.message ? String(err.message) : 'spellcheck failed';
      emit();
    })
    .finally(() => {
      if (token !== runToken) return;
      checkInFlight = false;
      if (pendingCheck) {
        pendingCheck = false;
        if (options.deep) runCheckNow({ deep: true });
        else scheduleRecheck();
      }
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
  checkInFlight = false;
  pendingCheck = false;
  currentWorkspaceId = null;
  currentDocId = null;
  clearMarkers();
  disposeSpell();
  emit();
}

export function setSpellcheckScope(scope: { workspaceId: string | null; docId: string | null }): void {
  if (currentWorkspaceId === scope.workspaceId && currentDocId === scope.docId) {
    return;
  }
  currentWorkspaceId = scope.workspaceId;
  currentDocId = scope.docId;
  clearMarkers();
  lastMatches = [];
  lastDocumentText = '';
  emit();
}

// ─── Deduplication and Exclusions ───────────────────────────────────────────

function getActiveWorkspaceLibrary(): any[] {
  const state = appStore.getState();
  const activeWsId = currentWorkspaceId || state.cur;
  if (!activeWsId) return [];
  return selectWorkspaceLibrary(state, activeWsId);
}

function getAuthorTokens(): Set<string> {
  const tokens = new Set<string>();
  const lib = getActiveWorkspaceLibrary();
  for (const item of lib) {
    if (!item || !Array.isArray(item.authors)) continue;
    for (const author of item.authors) {
      if (typeof author !== 'string') continue;
      const parts = author.split(/[\s,.\-_]+/);
      for (const part of parts) {
        const clean = part.replace(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/g, '').toLocaleLowerCase('tr-TR');
        if (clean.length >= 2) {
          tokens.add(clean);
        }
      }
    }
  }
  return tokens;
}

function getCitationTokens(): Set<string> {
  const tokens = new Set<string>();
  if (typeof document === 'undefined') return tokens;
  const elements = document.querySelectorAll('.cit');
  elements.forEach((el) => {
    const text = el.textContent || '';
    const parts = text.split(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/u);
    for (const part of parts) {
      const clean = part.toLocaleLowerCase('tr-TR');
      if (clean && clean.length >= 2 && !/^\d+$/.test(clean)) {
        tokens.add(clean);
      }
    }
  });
  return tokens;
}

function getIgnoreTokens(): Set<string> {
  const ignore = getAuthorTokens();
  const citations = getCitationTokens();
  citations.forEach((c) => ignore.add(c));
  return ignore;
}

function overlaps(a: SpellMatch, b: SpellMatch): boolean {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

function processAndCombineMatches(spellMatches: SpellMatch[], windowText: string, baseOffset: number): SpellMatch[] {
  const ruleMatches = checkLanguageRules(windowText).map((match) => ({
    ...match,
    offset: match.offset + baseOffset
  }));
  
  const ignoreSet = getIgnoreTokens();
  
  const filteredSpell = spellMatches.filter(m => {
    const clean = m.text.replace(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/g, '').toLocaleLowerCase('tr-TR');
    return !ignoreSet.has(clean);
  });
  const filteredRules = ruleMatches.filter(m => {
    const clean = m.text.replace(/[^a-zçğıöşüA-ZÇĞİÖŞÜ]+/g, '').toLocaleLowerCase('tr-TR');
    return !ignoreSet.has(clean);
  });
  
  const combined = [...filteredRules, ...filteredSpell];
  combined.sort((a, b) => a.offset - b.offset || b.length - a.length || a.ruleId.localeCompare(b.ruleId));
  
  const result: SpellMatch[] = [];
  for (const m of combined) {
    if (result.some(existing => overlaps(existing, m))) continue;
    result.push(m);
  }
  return result;
}


// ─── Internals ──────────────────────────────────────────────────────────────

let lastDocumentText = '';
let checkInFlight = false;
let pendingCheck = false;

function preferNativeSpell(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).electronAPI?.spell?.check === 'function';
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function boundedTextForAutomaticCheck(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

function selectDocumentTextForCheck(fullText: string, options: { deep?: boolean } = {}): { text: string; baseOffset: number } {
  if (options.deep) return { text: fullText, baseOffset: 0 };
  const visible = visibleTextWindow(fullText);
  if (visible) return visible;
  return { text: fullText.slice(0, MAX_AUTO_CHECK_CHARS), baseOffset: 0 };
}

function visibleTextWindow(fullText: string): { text: string; baseOffset: number } | null {
  if (typeof document === 'undefined' || !fullText) return null;
  const spans = Array.from(document.querySelectorAll<HTMLElement>('span[data-offset-start][data-offset-end]'));
  if (!spans.length) return null;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 900;
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (const span of spans) {
    const rect = span.getBoundingClientRect();
    if (rect.bottom < -80 || rect.top > viewportHeight + 80) continue;
    const start = Number(span.dataset.offsetStart);
    const end = Number(span.dataset.offsetEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    first = Math.min(first, start);
    last = Math.max(last, end);
  }
  if (!Number.isFinite(first) || last <= first) return null;
  const baseOffset = Math.max(0, first - VISIBLE_CONTEXT_BEFORE);
  const end = Math.min(fullText.length, Math.max(last + VISIBLE_CONTEXT_AFTER, baseOffset + 12000));
  return { text: fullText.slice(baseOffset, end), baseOffset };
}

async function checkTextCooperatively(text: string, token: number, baseOffset = 0, maxChars = MAX_AUTO_CHECK_CHARS): Promise<SpellMatch[] | null> {
  const source = boundedTextForAutomaticCheck(text, maxChars);
  if (!source) return [];
  if (!preferNativeSpell()) {
    return checkLoaded(source).map((match) => ({ ...match, offset: match.offset + baseOffset }));
  }
  const all: SpellMatch[] = [];
  let offset = 0;
  while (offset < source.length) {
    if (!enabled || token !== runToken) return null;
    let end = Math.min(source.length, offset + NATIVE_CHUNK_CHARS);
    if (end < source.length) {
      const boundary = source.lastIndexOf(' ', end);
      if (boundary > offset + Math.floor(NATIVE_CHUNK_CHARS * 0.65)) end = boundary;
    }
    const chunk = source.slice(offset, end);
    const matches = await checkText(chunk, { preferNative: true, maxSuggestions: 3 });
    for (const match of matches) all.push({ ...match, offset: match.offset + offset + baseOffset });
    offset = end;
    await nextFrame();
  }
  return all;
}

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

function getEditorContainer(): HTMLElement | Document {
  if (typeof document === 'undefined') return document;
  return document.querySelector<HTMLElement>('[data-aq-engine-editor]') || document;
}

function clearMarkers(): void {
  const root = getEditorContainer();
  root.querySelectorAll<HTMLElement>('.' + SPELL_CLASS).forEach((el) => {
    el.classList.remove(SPELL_CLASS);
    el.removeAttribute('data-spell-offset');
  });
}

function applyMarkers(matches: SpellMatch[]): void {
  clearMarkers();
  if (matches.length === 0) return;
  const root = getEditorContainer();
  const spans = root.querySelectorAll<HTMLElement>('span[data-offset-start]');
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
  for (const m of matches.slice(0, MAX_MARKED_MATCHES)) {
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
