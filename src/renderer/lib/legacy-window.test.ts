import { describe, it, expect, afterEach } from 'vitest';
import { legacyWin, legacyState } from './legacy-window';

afterEach(() => {
  delete (window as any).S;
});

describe('legacyWin', () => {
  it('returns the global window', () => {
    expect(legacyWin()).toBe(window);
  });

  it('typed access to legacy properties (no throw on missing)', () => {
    // These should all be safely-typed as optional; reading missing
    // values must not throw.
    expect(legacyWin().S).toBeUndefined();
    expect(legacyWin().editor).toBeUndefined();
    expect(legacyWin().save).toBeUndefined();
  });

  it('mutating via the typed view affects the real window', () => {
    legacyWin().S = { cur: 'test' } as any;
    expect((window as any).S).toEqual({ cur: 'test' });
  });
});

describe('legacyState', () => {
  it('returns null when window.S is missing', () => {
    expect(legacyState()).toBe(null);
  });

  it('returns null when window.S is not an object', () => {
    (window as any).S = 'not an object';
    expect(legacyState()).toBe(null);

    (window as any).S = 123;
    expect(legacyState()).toBe(null);
  });

  it('returns null when window.S is null', () => {
    (window as any).S = null;
    expect(legacyState()).toBe(null);
  });

  it('returns the state object when present', () => {
    (window as any).S = { cur: 'ws-1', wss: [] };
    expect(legacyState()).toEqual({ cur: 'ws-1', wss: [] });
  });
});
