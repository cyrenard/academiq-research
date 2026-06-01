import { describe, it, expect, afterEach } from 'vitest';
import { legacyWin, legacyState } from './legacy-window';
import { appStore } from './app-store';

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
  it('returns the state object from appStore when present', () => {
    appStore.setState({ cur: 'ws-1', wss: [] } as any);
    expect(legacyState()).toEqual(expect.objectContaining({ cur: 'ws-1', wss: [] }));
  });
});
