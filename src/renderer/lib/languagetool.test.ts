import { describe, it, expect, vi } from 'vitest';
import {
  checkText,
  normalizeEndpoint,
  parseMatches,
  LT_DEFAULT_ENDPOINT,
  LT_DEFAULT_LANGUAGE
} from './languagetool';

// ─── normalizeEndpoint ─────────────────────────────────────────────────────

describe('normalizeEndpoint', () => {
  it('falls back to the public endpoint for empty / nullish input', () => {
    expect(normalizeEndpoint(undefined)).toBe(LT_DEFAULT_ENDPOINT);
    expect(normalizeEndpoint(null)).toBe(LT_DEFAULT_ENDPOINT);
    expect(normalizeEndpoint('')).toBe(LT_DEFAULT_ENDPOINT);
    expect(normalizeEndpoint('   ')).toBe(LT_DEFAULT_ENDPOINT);
  });

  it('falls back when the URL is malformed', () => {
    expect(normalizeEndpoint('not-a-url')).toBe(LT_DEFAULT_ENDPOINT);
    expect(normalizeEndpoint('ftp://x.com/check')).toBe(LT_DEFAULT_ENDPOINT);
  });

  it('appends /v2/check to host-only URLs', () => {
    expect(normalizeEndpoint('http://localhost:8081')).toBe('http://localhost:8081/v2/check');
    expect(normalizeEndpoint('http://localhost:8081/')).toBe('http://localhost:8081/v2/check');
  });

  it('preserves URLs that already end with /check', () => {
    expect(normalizeEndpoint('http://example.com/v2/check')).toBe('http://example.com/v2/check');
    expect(normalizeEndpoint('http://example.com/api/check')).toBe('http://example.com/api/check');
  });
});

// ─── parseMatches ──────────────────────────────────────────────────────────

const sourceText = 'Bu cumlede iki yanlis var.';

describe('parseMatches', () => {
  it('returns [] for nullish / non-object input', () => {
    expect(parseMatches(null, '')).toEqual([]);
    expect(parseMatches(undefined, '')).toEqual([]);
    expect(parseMatches('garbage', '')).toEqual([]);
  });

  it('returns [] when .matches is missing or not an array', () => {
    expect(parseMatches({}, '')).toEqual([]);
    expect(parseMatches({ matches: 'oops' }, '')).toEqual([]);
  });

  it('parses a well-formed match into the normalized shape', () => {
    const out = parseMatches({
      matches: [{
        offset: 3,
        length: 7,
        message: 'Olası yazım hatası',
        replacements: [{ value: 'cümlede' }, { value: 'cumlede' }],
        rule: { id: 'MORFOLOGIK_RULE_TR_TR', category: { id: 'TYPOS' } }
      }]
    }, sourceText);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      offset: 3,
      length: 7,
      message: 'Olası yazım hatası',
      ruleId: 'MORFOLOGIK_RULE_TR_TR',
      category: 'TYPOS',
      text: 'cumlede'
    });
    expect(out[0]!.replacements).toEqual([{ value: 'cümlede' }, { value: 'cumlede' }]);
  });

  it('caps replacements to maxSuggestions', () => {
    const out = parseMatches({
      matches: [{
        offset: 0, length: 2, message: 'x',
        replacements: [{ value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' }],
        rule: { id: 'R', category: { id: 'C' } }
      }]
    }, 'ab', 2);
    expect(out[0]!.replacements).toHaveLength(2);
  });

  it('drops matches with invalid or out-of-range offsets', () => {
    const out = parseMatches({
      matches: [
        { offset: -1, length: 3, message: 'a' },        // bad offset
        { offset: 0, length: 0, message: 'b' },         // zero length
        { offset: 100, length: 5, message: 'c' },       // beyond source
        { offset: 'x', length: 5, message: 'd' },       // non-numeric
        { offset: 0, length: 2, message: 'ok', rule: { id: 'R', category: { id: 'C' } } }
      ]
    }, 'ab');
    expect(out).toHaveLength(1);
    expect(out[0]!.message).toBe('ok');
  });

  it('coerces missing replacements/rule fields to safe defaults', () => {
    const out = parseMatches({
      matches: [{ offset: 0, length: 2, message: '' }]
    }, 'ab');
    expect(out[0]).toMatchObject({
      replacements: [],
      ruleId: '',
      category: ''
    });
  });
});

// ─── checkText ─────────────────────────────────────────────────────────────

function mockFetch(jsonBody: any, opts: { ok?: boolean; status?: number } = {}) {
  const ok = opts.ok !== false;
  return vi.fn(async () =>
    ({
      ok,
      status: opts.status ?? (ok ? 200 : 500),
      json: async () => jsonBody
    }) as unknown as Response
  );
}

describe('checkText', () => {
  it('short-circuits on empty/whitespace text without firing fetch', async () => {
    const fetchSpy = vi.fn();
    const out = await checkText('   \n  ', { fetchImpl: fetchSpy as any });
    expect(out).toEqual({ ok: true, matches: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts text + language as urlencoded body to the resolved endpoint', async () => {
    const fetchImpl = mockFetch({ matches: [] });
    await checkText('hello', { endpoint: 'http://localhost:8081', fetchImpl: fetchImpl as any });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as any).mock.calls[0];
    expect(url).toBe('http://localhost:8081/v2/check');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(String(init.body)).toContain('text=hello');
    expect(String(init.body)).toContain(`language=${LT_DEFAULT_LANGUAGE}`);
  });

  it('returns parsed matches on a successful response', async () => {
    const fetchImpl = mockFetch({
      matches: [{
        offset: 0, length: 5, message: 'oops',
        replacements: [{ value: 'hello' }],
        rule: { id: 'X', category: { id: 'TYPOS' } }
      }]
    });
    const out = await checkText('hellp', { fetchImpl: fetchImpl as any });
    expect(out.ok).toBe(true);
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]!.message).toBe('oops');
  });

  it('soft-fails with {ok:false} on non-2xx', async () => {
    const fetchImpl = mockFetch({}, { ok: false, status: 503 });
    const out = await checkText('hello', { fetchImpl: fetchImpl as any });
    expect(out).toMatchObject({ ok: false, error: 'HTTP 503' });
    expect(out.matches).toEqual([]);
  });

  it('soft-fails on network errors', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const out = await checkText('hello', { fetchImpl: fetchImpl as any });
    expect(out.ok).toBe(false);
    expect(out.error).toContain('ECONNREFUSED');
  });

  it('reports cancellation distinctly from generic errors', async () => {
    const fetchImpl = vi.fn(async () => {
      const e: any = new Error('aborted'); e.name = 'AbortError'; throw e;
    });
    const out = await checkText('hello', { fetchImpl: fetchImpl as any });
    expect(out).toEqual({ ok: false, matches: [], error: 'cancelled' });
  });

  it('reports malformed JSON responses', async () => {
    const fetchImpl = vi.fn(async () =>
      ({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }) as unknown as Response
    );
    const out = await checkText('hello', { fetchImpl: fetchImpl as any });
    expect(out).toMatchObject({ ok: false, error: 'malformed response' });
  });
});
