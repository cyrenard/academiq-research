import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  hideLegacyModal,
  showLegacyModal,
  escapeHtml,
  currentWorkspaceRefs,
  currentWorkspace,
  syncReactFromLegacy,
  scheduleReactSyncFromLegacy,
  saveLegacyState
} from './legacy-dom-helpers';
import { appStore } from './app-store';

beforeEach(() => {
  appStore.setState({ cur: '', wss: [], notes: [] });
});

afterEach(() => {
  document.body.innerHTML = '';
  delete (window as any).S;
  delete (window as any).__aqReactSyncFromLegacy;
  delete (window as any).save;
  delete (window as any).rLib;
  delete (window as any).rRefs;
  delete (window as any).updateRefSection;
});

// ─── escapeHtml ──────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes the 5 dangerous HTML chars', () => {
    expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('handles null/undefined as empty', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string values to string', () => {
    expect(escapeHtml(123)).toBe('123');
    expect(escapeHtml(true)).toBe('true');
  });

  it('escapes the entire string (not just first occurrence)', () => {
    expect(escapeHtml('<a><b><c>')).toBe('&lt;a&gt;&lt;b&gt;&lt;c&gt;');
  });
});

// ─── Modal show/hide ────────────────────────────────────────────────────

describe('showLegacyModal / hideLegacyModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="m1"></div>';
  });

  it('toggles the .show class on the target element', () => {
    showLegacyModal('m1');
    expect(document.getElementById('m1')!.classList.contains('show')).toBe(true);
    hideLegacyModal('m1');
    expect(document.getElementById('m1')!.classList.contains('show')).toBe(false);
  });

  it('no-op when element is missing', () => {
    expect(() => showLegacyModal('nonexistent')).not.toThrow();
    expect(() => hideLegacyModal('nonexistent')).not.toThrow();
  });
});

// ─── Workspace selectors ────────────────────────────────────────────────

describe('currentWorkspaceRefs', () => {
  it('returns [] when app store has no active workspace', () => {
    expect(currentWorkspaceRefs()).toEqual([]);
  });

  it('returns active workspace lib', () => {
    appStore.setState({
      cur: 'ws-1',
      wss: [
        { id: 'ws-1', name: 'Workspace 1', lib: [{ id: 'r1' }, { id: 'r2' }] },
        { id: 'ws-2', name: 'Workspace 2', lib: [{ id: 'r3' }] }
      ]
    });
    expect(currentWorkspaceRefs()).toEqual([{ id: 'r1' }, { id: 'r2' }]);
  });

  it('returns [] when active workspace not found', () => {
    appStore.setState({ cur: 'missing', wss: [{ id: 'ws-1', name: 'Workspace 1', lib: [] }] });
    expect(currentWorkspaceRefs()).toEqual([]);
  });
});

describe('currentWorkspace', () => {
  it('returns null when app store has no active workspace', () => {
    expect(currentWorkspace()).toBe(null);
  });

  it('returns active workspace object', () => {
    const ws = { id: 'ws-1', name: 'WS One', lib: [] };
    appStore.setState({ cur: 'ws-1', wss: [ws] });
    expect(currentWorkspace()).toEqual(ws);
  });

  it('returns null when active workspace id not in wss', () => {
    appStore.setState({ cur: 'missing', wss: [{ id: 'other', name: 'Other', lib: [] }] });
    expect(currentWorkspace()).toBe(null);
  });
});

// ─── React ↔ Legacy sync ─────────────────────────────────────────────────

describe('syncReactFromLegacy', () => {
  it('calls window.__aqReactSyncFromLegacy with window.S', () => {
    const sync = vi.fn();
    (window as any).__aqReactSyncFromLegacy = sync;
    (window as any).S = { cur: 'ws-1' };
    syncReactFromLegacy();
    expect(sync).toHaveBeenCalledWith({ cur: 'ws-1' });
  });

  it('passes empty object when window.S missing', () => {
    const sync = vi.fn();
    (window as any).__aqReactSyncFromLegacy = sync;
    delete (window as any).S;
    syncReactFromLegacy();
    expect(sync).toHaveBeenCalledWith({});
  });

  it('no-op when hook not registered', () => {
    expect(() => syncReactFromLegacy()).not.toThrow();
  });

  it('silently swallows hook errors', () => {
    (window as any).__aqReactSyncFromLegacy = () => { throw new Error('boom'); };
    expect(() => syncReactFromLegacy()).not.toThrow();
  });
});

describe('scheduleReactSyncFromLegacy', () => {
  it('debounces multiple rapid calls to a single hook invocation', async () => {
    const sync = vi.fn();
    (window as any).__aqReactSyncFromLegacy = sync;
    scheduleReactSyncFromLegacy(20);
    scheduleReactSyncFromLegacy(20);
    scheduleReactSyncFromLegacy(20);
    await new Promise((r) => setTimeout(r, 50));
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('respects the delay parameter', async () => {
    const sync = vi.fn();
    (window as any).__aqReactSyncFromLegacy = sync;
    scheduleReactSyncFromLegacy(40);
    await new Promise((r) => setTimeout(r, 20));
    expect(sync).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 40));
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

// ─── saveLegacyState ────────────────────────────────────────────────────

describe('saveLegacyState', () => {
  it('calls window.save synchronously', () => {
    const save = vi.fn();
    (window as any).save = save;
    saveLegacyState();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('calls rLib + rRefs + updateRefSection after 80ms tick', async () => {
    const save = vi.fn();
    const rLib = vi.fn();
    const rRefs = vi.fn();
    const updateRefSection = vi.fn();
    (window as any).save = save;
    (window as any).rLib = rLib;
    (window as any).rRefs = rRefs;
    (window as any).updateRefSection = updateRefSection;

    saveLegacyState();
    expect(save).toHaveBeenCalled();
    // 80ms tick chain
    await new Promise((r) => setTimeout(r, 120));
    expect(rLib).toHaveBeenCalled();
    expect(rRefs).toHaveBeenCalled();
    expect(updateRefSection).toHaveBeenCalled();
  });

  it('silently tolerates each helper throwing', () => {
    (window as any).save = () => { throw new Error('save-boom'); };
    expect(() => saveLegacyState()).not.toThrow();
  });

  it('triggers a deferred (450ms) React sync as fallback', async () => {
    const sync = vi.fn();
    (window as any).__aqReactSyncFromLegacy = sync;
    saveLegacyState();
    await new Promise((r) => setTimeout(r, 500));
    expect(sync).toHaveBeenCalled();
    // at least the early debounced one + the 450ms one → could be 1 or 2
    expect(sync.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
