import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatAge, asRecord, statusText } from './modal-helpers';

// ─── formatDate ─────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns "-" for falsy', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate(0)).toBe('-');
    expect(formatDate('')).toBe('-');
  });

  it('formats valid timestamp as Turkish locale string', () => {
    const stamp = Date.UTC(2024, 0, 15, 12, 30, 0);
    const result = formatDate(stamp);
    expect(result).not.toBe('-');
    // Should contain digits (year + day + time)
    expect(result).toMatch(/\d/);
  });
});

// ─── formatAge ──────────────────────────────────────────────────────────

describe('formatAge', () => {
  beforeEach(() => {
    // Pin "now" so the tests are deterministic
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "-" for falsy', () => {
    expect(formatAge(null)).toBe('-');
    expect(formatAge(0)).toBe('-');
  });

  it('< 1 minute → "az önce"', () => {
    expect(formatAge(Date.now() - 30 * 1000)).toBe('az önce');
  });

  it('< 1 hour → "X dk önce"', () => {
    expect(formatAge(Date.now() - 5 * 60 * 1000)).toBe('5 dk önce');
    expect(formatAge(Date.now() - 30 * 60 * 1000)).toBe('30 dk önce');
  });

  it('< 1 day → "X sa önce"', () => {
    expect(formatAge(Date.now() - 3 * 60 * 60 * 1000)).toBe('3 sa önce');
  });

  it('>= 1 day → "X gün önce"', () => {
    expect(formatAge(Date.now() - 5 * 24 * 60 * 60 * 1000)).toBe('5 gün önce');
  });
});

// ─── asRecord ───────────────────────────────────────────────────────────

describe('asRecord', () => {
  it('returns the object when value is a non-null object', () => {
    const obj = { a: 1 };
    expect(asRecord(obj)).toBe(obj);
  });

  it('returns empty object for null/undefined', () => {
    expect(asRecord(null)).toEqual({});
    expect(asRecord(undefined)).toEqual({});
  });

  it('returns empty object for primitives', () => {
    expect(asRecord('string')).toEqual({});
    expect(asRecord(123)).toEqual({});
    expect(asRecord(true)).toEqual({});
  });

  it('returns the array (arrays are objects)', () => {
    const arr = [1, 2, 3];
    expect(asRecord(arr)).toBe(arr);
  });
});

// ─── statusText ─────────────────────────────────────────────────────────

describe('statusText', () => {
  it('prefers lifecycle field', () => {
    expect(statusText({ lifecycle: 'ready', lifecycleState: 'x', state: 'y' })).toBe('ready');
  });

  it('falls back to lifecycleState', () => {
    expect(statusText({ lifecycleState: 'pending', state: 'x' })).toBe('pending');
  });

  it('falls back to state', () => {
    expect(statusText({ state: 'running' })).toBe('running');
  });

  it('falls back to status', () => {
    expect(statusText({ status: 'done' })).toBe('done');
  });

  it('returns "ok" for {ok: true}', () => {
    expect(statusText({ ok: true })).toBe('ok');
  });

  it('returns "hata" for {ok: false}', () => {
    expect(statusText({ ok: false })).toBe('hata');
  });

  it('returns "-" for empty/null', () => {
    expect(statusText(null)).toBe('-');
    expect(statusText({})).toBe('-');
  });
});
