import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hydrateAppState } from './app-state';
import {
  appStore,
  selectCurrentWorkspace,
  selectCurrentWorkspaceId,
  selectNotes,
  selectReferenceById,
  selectWorkspace,
  selectWorkspaceLibrary,
  selectNotebooks,
  selectCurrentNotebookId,
  ensureNotebooks,
  addNote
} from './app-store';

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

  it('selects current workspace metadata and notes without reading window.S', () => {
    appStore.setState({
      cur: 'ws-2',
      wss: [
        { id: 'ws-1', name: 'Workspace 1', lib: [] },
        { id: 'ws-2', name: 'Workspace 2', lib: [{ id: 'ref-2' }] }
      ],
      notes: [{ id: 'note-1', rid: 'ref-2' }]
    });
    const state = appStore.getState();
    expect(selectCurrentWorkspaceId(state)).toBe('ws-2');
    expect(selectCurrentWorkspace(state)?.name).toBe('Workspace 2');
    expect(selectWorkspace(state, 'ws-1')?.name).toBe('Workspace 1');
    expect(selectWorkspaceLibrary(state)).toEqual([{ id: 'ref-2' }]);
    expect(selectNotes(state)).toEqual([{ id: 'note-1', rid: 'ref-2' }]);
  });

  describe('notebooks and notes helpers', () => {
    it('returns empty list of notebooks if missing', () => {
      appStore.setState({ notebooks: undefined });
      expect(selectNotebooks(appStore.getState())).toEqual([]);
    });

    it('selects notebooks and current notebook id', () => {
      appStore.setState({
        notebooks: [{ id: 'ws1:nb1', name: 'Notebook 1', wsId: 'ws1' }],
        curNb: 'ws1:nb1'
      });
      const state = appStore.getState();
      expect(selectNotebooks(state)).toEqual([{ id: 'ws1:nb1', name: 'Notebook 1', wsId: 'ws1' }]);
      expect(selectCurrentNotebookId(state)).toBe('ws1:nb1');
    });

    it('ensureNotebooks appends workspace-scoped notebook if missing', () => {
      appStore.setState({
        cur: 'ws-new',
        notebooks: [{ id: 'ws1:nb1', name: 'Notebook 1', wsId: 'ws1' }],
        curNb: undefined
      });

      const patch = ensureNotebooks(appStore.getState());
      expect(patch).toEqual({
        notebooks: [
          { id: 'ws1:nb1', name: 'Notebook 1', wsId: 'ws1' },
          { id: 'ws-new:nb1', wsId: 'ws-new', name: 'Genel Notlar' }
        ],
        curNb: 'ws-new:nb1'
      });

      // Apply changes
      appStore.setState(patch);
      // It should return empty if already present
      const emptyPatch = ensureNotebooks(appStore.getState());
      expect(emptyPatch).toEqual({});
    });

    it('addNote prepends note to notes immutably', () => {
      appStore.setState({
        notes: [{ id: 'note-1', txt: 'First' }]
      });

      const nextNote = { id: 'note-2', txt: 'Second' };
      const patch = addNote(appStore.getState(), nextNote);

      expect(patch).toEqual({
        notes: [
          { id: 'note-2', txt: 'Second' },
          { id: 'note-1', txt: 'First' }
        ]
      });

      appStore.setState(patch);
      // Check write-through to window.S
      const win = window as any;
      expect(win.S.notes).toEqual([
        { id: 'note-2', txt: 'Second' },
        { id: 'note-1', txt: 'First' }
      ]);
    });

    it('syncs literatureMatrix through hydrateAppState and appStore', () => {
      const legacyState = {
        cur: 'ws-1',
        wss: [{ id: 'ws-1', name: 'Workspace 1', lib: [] }],
        docs: [],
        curDoc: '',
        literatureMatrix: {
          'ws-1': {
            rows: [{ id: 'row-1', referenceId: 'ref-1', cells: {} }]
          }
        }
      };

      const hydrated = hydrateAppState(legacyState);
      appStore.setState(hydrated);

      expect(appStore.getState().literatureMatrix).toBeDefined();
      expect((appStore.getState().literatureMatrix as any)['ws-1'].rows[0].id).toBe('row-1');
    });
  });
});
