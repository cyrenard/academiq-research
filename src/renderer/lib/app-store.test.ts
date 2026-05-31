import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appStore, selectWorkspaceLibrary, selectReferenceById } from './app-store';

describe('appStore', () => {
  beforeEach(() => {
    const win = window as any;
    delete win.S;
  });

  afterEach(() => {
    const win = window as any;
    delete win.S;
  });

  it('can set and get state', () => {
    appStore.setState({ cur: 'ws-test-1' });
    expect(appStore.getState().cur).toBe('ws-test-1');
  });

  it('performs write-through to window.S', () => {
    appStore.setState({ cur: 'ws-test-2' });
    const win = window as any;
    expect(win.S).toBeDefined();
    expect(win.S.cur).toBe('ws-test-2');
  });

  it('notifies subscribers on state change', () => {
    const callback = vi.fn();
    const unsubscribe = appStore.subscribe(callback);

    appStore.setState({ cur: 'ws-test-3' });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(appStore.getState());

    unsubscribe();
  });

  it('selects workspace library and reference by ID', () => {
    appStore.setState({
      wss: [
        {
          id: 'ws-1',
          name: 'Workspace 1',
          lib: [{ id: 'ref-1', title: 'Test 1' }]
        }
      ],
      cur: 'ws-1'
    });
    const state = appStore.getState();
    expect(selectWorkspaceLibrary(state, 'ws-1')).toEqual([{ id: 'ref-1', title: 'Test 1' }]);
    expect(selectReferenceById(state, 'ref-1', 'ws-1')).toEqual({ id: 'ref-1', title: 'Test 1' });
    expect(selectReferenceById(state, 'non-existent', 'ws-1')).toBeNull();
  });
});
