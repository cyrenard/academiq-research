/**
 * Turkish spell-checker — nspell + dictionary-tr (Harun Reşit Zafer's
 * dictionary, MIT) running entirely inside the renderer.
 *
 * No Java, no server, no Maven, no JRE, no electron-builder gymnastics.
 * The aff/dic files live under public/dictionary/tr/ and are streamed in
 * the first time `ensureSpellLoaded()` is called (~9 MB lazy fetch).
 * After that, `check()` is synchronous and cheap.
 *
 * Match shape stays compatible with the existing renderer "spell-check
 * surface" expectations: offset/length/message/replacements/ruleId/
 * category — same vocabulary as the LanguageTool client we briefly
 * tried, so any UI plumbing already wired for that JSON works here too.
 */
import nspell from 'nspell';

/** Single misspelling found in the submitted text. */
export interface SpellMatch {
  /** 0-based offset into the submitted text where the misspelling starts. */
  offset: number;
  /** Length in chars of the offending span. */
  length: number;
  /** The misspelled token as it appears in the source. */
  text: string;
  /** Human-readable explanation (Turkish, UI-ready). */
  message: string;
  /** Up to N replacement suggestions, best-first. */
  replacements: Array<{ value: string }>;
  /** Rule id — single value for now, makes "ignore this rule" work later. */
  ruleId: string;
  /** Rule category — kept compatible with the LT JSON shape. */
  category: string;
}

export interface CheckOptions {
  /** Max suggestions returned per misspelled word. Default 5. */
  maxSuggestions?: number;
  /** Override word-token regex (very rare; for tests). */
  wordRegex?: RegExp;
}

export interface SpellLoaderOptions {
  /** Override the aff file URL (or contents) — used by tests + the
   *  install controller. Defaults to `./dictionary/tr/index.aff`. */
  affUrl?: string;
  /** Override the dic file URL. Defaults to `./dictionary/tr/index.dic`. */
  dicUrl?: string;
  /** Injectable fetch for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

// nspell exposes `correct(word) → boolean` and `suggest(word) → string[]`.
type NSpellInstance = ReturnType<typeof nspell>;

// ─── Lifecycle ─────────────────────────────────────────────────────────────

let instance: NSpellInstance | null = null;
let loadPromise: Promise<NSpellInstance> | null = null;

/**
 * Force-set the loaded spell instance. Used by tests so they don't have
 * to round-trip the real 9 MB dictionary. Also reachable from
 * spellcheck-controller.ts when we wire up a web-worker variant.
 */
export function _setSpellInstanceForTests(spell: NSpellInstance | null): void {
  instance = spell;
  loadPromise = spell ? Promise.resolve(spell) : null;
}

const DEFAULT_AFF_URL = './dictionary/tr/index.aff';
const DEFAULT_DIC_URL = './dictionary/tr/index.dic';

/**
 * Lazy-load the Turkish dictionary and build an nspell instance. Safe
 * to call concurrently — subsequent callers share the in-flight promise.
 */
export async function ensureSpellLoaded(options: SpellLoaderOptions = {}): Promise<NSpellInstance> {
  if (instance) return instance;
  if (loadPromise) return loadPromise;
  const affUrl = options.affUrl || DEFAULT_AFF_URL;
  const dicUrl = options.dicUrl || DEFAULT_DIC_URL;
  const fetchImpl = options.fetchImpl
    || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  if (!fetchImpl) {
    throw new Error('spellcheck: fetch unavailable in this environment');
  }
  loadPromise = (async () => {
    const [affRes, dicRes] = await Promise.all([
      fetchImpl(affUrl),
      fetchImpl(dicUrl)
    ]);
    if (!affRes.ok) throw new Error(`spellcheck: aff fetch failed (HTTP ${affRes.status})`);
    if (!dicRes.ok) throw new Error(`spellcheck: dic fetch failed (HTTP ${dicRes.status})`);
    const [affText, dicText] = await Promise.all([
      affRes.text(),
      dicRes.text()
    ]);
    const spell = nspell(affText, dicText);
    instance = spell;
    return spell;
  })().catch((err) => {
    // Reset so a later retry can try again.
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/** Whether the dictionary has already finished loading. Cheap sync check. */
export function isSpellReady(): boolean {
  return instance !== null;
}

/** Drop the loaded instance — frees ~30 MB of in-memory dictionary state. */
export function disposeSpell(): void {
  instance = null;
  loadPromise = null;
}

// ─── Word tokenizer ────────────────────────────────────────────────────────

/**
 * Default word-token regex. Matches runs of letters (ASCII + Turkish
 * diacritics) and apostrophes (so "kitap'ı" stays one token).
 *
 * Numbers, punctuation, whitespace and emoji are skipped — the goal is
 * to send things that LOOK like Turkish words to nspell, not the entire
 * stream of glyphs.
 */
const DEFAULT_WORD_RE = /[A-Za-zçğıöşüÇĞİÖŞÜ][A-Za-zçğıöşüÇĞİÖŞÜ'’]*/g;

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Spell-check a string. Returns an array of misspellings in source order.
 * The dictionary must already be loaded (`ensureSpellLoaded()`); if not,
 * this throws so callers don't accidentally race the async load.
 *
 * `correct` and `suggest` are synchronous, so a full body of academic
 * prose checks in milliseconds; if you need to keep the UI thread fully
 * unblocked, run this inside a web worker.
 */
export function checkLoaded(text: string, options: CheckOptions = {}): SpellMatch[] {
  if (!instance) {
    throw new Error('spellcheck: dictionary not loaded — call ensureSpellLoaded() first');
  }
  return runCheck(instance, text, options);
}

/**
 * Convenience: load on demand + check. Use when you don't already know
 * whether the dictionary is loaded. If you call this in a hot path,
 * prefer ensureSpellLoaded() up-front + checkLoaded() in the loop.
 */
export async function checkText(text: string, options: CheckOptions & SpellLoaderOptions = {}): Promise<SpellMatch[]> {
  const spell = await ensureSpellLoaded(options);
  return runCheck(spell, text, options);
}

function runCheck(spell: NSpellInstance, text: string, options: CheckOptions): SpellMatch[] {
  if (!text) return [];
  const maxSug = Math.max(0, options.maxSuggestions ?? 5);
  const re = options.wordRegex
    ? new RegExp(options.wordRegex.source, options.wordRegex.flags.includes('g') ? options.wordRegex.flags : options.wordRegex.flags + 'g')
    : new RegExp(DEFAULT_WORD_RE.source, DEFAULT_WORD_RE.flags);
  const matches: SpellMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const word = m[0];
    // Skip 1-letter tokens (mostly noise: "a", "I", initials) — they
    // generate too many false positives against academic prose.
    if (word.length < 2) continue;
    // Skip ALL-CAPS tokens — usually acronyms (APA, DOI, ISBN) that
    // aren't in a generic dictionary. We'd rather not flag them.
    if (word === word.toUpperCase() && /[A-ZÇĞİÖŞÜ]/.test(word)) continue;
    if (spell.correct(word)) continue;
    const suggestions = maxSug > 0 ? spell.suggest(word).slice(0, maxSug) : [];
    matches.push({
      offset: m.index,
      length: word.length,
      text: word,
      message: 'Olası yazım hatası',
      replacements: suggestions.map((value) => ({ value })),
      ruleId: 'NSPELL_TR',
      category: 'TYPOS'
    });
  }
  return matches;
}
