/**
 * LanguageTool API client.
 *
 * LanguageTool is an open-source grammar/style/spell checker (LGPL 2.1+).
 * We talk to it via its HTTP API, which can be either:
 *   - the public endpoint at api.languagetool.org (anonymous + rate-limited)
 *   - a local server the user runs themselves (java -jar languagetool-server.jar)
 *
 * Settings layer decides which URL to use; this module just takes an
 * endpoint + text and returns normalized matches.
 *
 * API surface kept minimal so it's easy to mock in tests and easy to swap
 * if we ever embed a JS-side checker in the future.
 */

export const LT_DEFAULT_ENDPOINT = 'https://api.languagetool.org/v2/check';
export const LT_DEFAULT_LANGUAGE = 'tr-TR';

/** Replacement candidate for a match — what to replace the bad span with. */
export interface LTReplacement {
  value: string;
}

/** Single grammar / spelling / style issue found in the submitted text. */
export interface LTMatch {
  /** 0-based offset into the submitted text where the issue starts. */
  offset: number;
  /** Character length of the offending span. */
  length: number;
  /** Short human-readable explanation (e.g. "Olası yazım hatası"). */
  message: string;
  /** Up to N replacement suggestions, ordered best-first. */
  replacements: LTReplacement[];
  /** Rule id, e.g. "MORFOLOGIK_RULE_TR_TR". Useful for ignore-rules. */
  ruleId: string;
  /** Rule category, e.g. "TYPOS", "GRAMMAR", "STYLE". */
  category: string;
  /** What the user actually typed at this span (for UI display). */
  text: string;
}

/** Top-level result of a `check()` call. */
export interface LTCheckResult {
  ok: boolean;
  matches: LTMatch[];
  /** When ok=false, a human-readable error string. */
  error?: string;
}

export interface LTCheckOptions {
  /** Override endpoint URL. Default: public api.languagetool.org. */
  endpoint?: string;
  /** Override language code. Default: tr-TR. */
  language?: string;
  /** Maximum number of replacement suggestions to keep per match. Default 5. */
  maxSuggestions?: number;
  /** AbortSignal so the caller can cancel pending requests on text change. */
  signal?: AbortSignal;
  /**
   * Optional fetch implementation override. Defaults to `globalThis.fetch`,
   * which Electron's renderer provides. Tests inject a stub.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Sanity-check an endpoint string. Returns the URL unchanged if it looks
 * valid, otherwise the public default. We accept any http(s) URL with a
 * path that ends in `/v2/check` or just `/check` (LT's standard route).
 */
export function normalizeEndpoint(url: string | undefined | null): string {
  const raw = String(url || '').trim();
  if (!raw) return LT_DEFAULT_ENDPOINT;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return LT_DEFAULT_ENDPOINT;
    }
    // If the user gave just the host (e.g. http://localhost:8081), append
    // the standard check path so callers don't have to know it.
    if (!/\/check\/?$/i.test(parsed.pathname)) {
      const trimmed = parsed.pathname.replace(/\/+$/, '');
      parsed.pathname = `${trimmed}/v2/check`;
    }
    return parsed.toString();
  } catch {
    return LT_DEFAULT_ENDPOINT;
  }
}

/**
 * Submit text for checking. Never throws — returns `{ok:false, matches:[], error}`
 * on any failure so callers can render a non-blocking status.
 */
export async function checkText(text: string, options: LTCheckOptions = {}): Promise<LTCheckResult> {
  const cleaned = String(text || '');
  if (!cleaned.trim()) {
    return { ok: true, matches: [] };
  }
  const endpoint = normalizeEndpoint(options.endpoint);
  const language = options.language || LT_DEFAULT_LANGUAGE;
  const maxSuggestions = Math.max(1, options.maxSuggestions ?? 5);
  const fetchImpl = options.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!fetchImpl) {
    return { ok: false, matches: [], error: 'fetch unavailable in this environment' };
  }

  const body = new URLSearchParams();
  body.set('text', cleaned);
  body.set('language', language);
  body.set('enabledOnly', 'false');

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString(),
      signal: options.signal
    });
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      return { ok: false, matches: [], error: 'cancelled' };
    }
    return { ok: false, matches: [], error: err?.message || 'network error' };
  }

  if (!response.ok) {
    return { ok: false, matches: [], error: `HTTP ${response.status}` };
  }

  let raw: any;
  try {
    raw = await response.json();
  } catch (err: any) {
    return { ok: false, matches: [], error: 'malformed response' };
  }

  const matches = parseMatches(raw, cleaned, maxSuggestions);
  return { ok: true, matches };
}

/**
 * Pure parse step — exported separately so tests can hit it without an
 * HTTP layer. Tolerant of missing fields; out-of-range offsets dropped.
 */
export function parseMatches(raw: unknown, sourceText: string, maxSuggestions = 5): LTMatch[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as any).matches;
  if (!Array.isArray(list)) return [];
  const sourceLen = String(sourceText || '').length;
  const out: LTMatch[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const offset = Number(entry.offset);
    const length = Number(entry.length);
    if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length <= 0) continue;
    if (offset + length > sourceLen) continue;
    const replacements = Array.isArray(entry.replacements)
      ? entry.replacements
          .filter((r: any) => r && typeof r.value === 'string')
          .slice(0, maxSuggestions)
          .map((r: any) => ({ value: String(r.value) }))
      : [];
    const rule = entry.rule && typeof entry.rule === 'object' ? entry.rule : {};
    out.push({
      offset,
      length,
      message: String(entry.message || ''),
      replacements,
      ruleId: String(rule.id || ''),
      category: String((rule.category && rule.category.id) || ''),
      text: sourceText.slice(offset, offset + length)
    });
  }
  return out;
}
