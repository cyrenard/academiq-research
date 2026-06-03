import { useSyncExternalStore } from 'react';
import { AcademiqAppState, AcademiqNote, createBlankState } from './app-state';
import { publishStateToLegacyWindow } from './legacy-state-bridge';

let currentState: AcademiqAppState = createBlankState();
const listeners = new Set<(state: AcademiqAppState) => void>();

export const appStore = {
  getState() {
    return currentState;
  },
  setState(
    next:
      | AcademiqAppState
      | Partial<AcademiqAppState>
      | ((state: AcademiqAppState) => AcademiqAppState | Partial<AcademiqAppState>)
  ) {
    const nextState = typeof next === 'function' ? next(currentState) : next;
    currentState = { ...currentState, ...nextState };

    // Write-through to legacy window.S so legacy runtime can still read it.
    publishStateToLegacyWindow(currentState);

    listeners.forEach((listener) => listener(currentState));
  },
  subscribe(listener: (state: AcademiqAppState) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};

export function useAppStore<T>(selector: (state: AcademiqAppState) => T): T {
  return useSyncExternalStore(
    appStore.subscribe,
    () => selector(appStore.getState()),
    () => selector(appStore.getState())
  );
}

export function selectWorkspaceLibrary(state: AcademiqAppState, workspaceId?: string): any[] {
  const wsId = workspaceId || state.cur;
  const workspace = (state.wss || []).find((ws) => ws && ws.id === wsId) || state.wss[0];
  return Array.isArray(workspace?.lib) ? workspace.lib : [];
}

export function selectCurrentWorkspaceId(state: AcademiqAppState): string {
  return String(state.cur || '');
}

export function selectWorkspace(state: AcademiqAppState, workspaceId?: string): any | null {
  const wsId = workspaceId || state.cur;
  return (state.wss || []).find((ws) => ws && ws.id === wsId) || null;
}

export function selectCurrentWorkspace(state: AcademiqAppState): any | null {
  return selectWorkspace(state, state.cur);
}

/** Active document record, or null. Mirrors the legacy `S.docs.find(id===S.curDoc)`. */
export function selectCurrentDocument(state: AcademiqAppState): any | null {
  const docs = Array.isArray(state.docs) ? state.docs : [];
  const docId = state.curDoc || (state as any).doc || '';
  return docs.find((doc) => doc && doc.id === docId) || docs[0] || null;
}

export function selectReferenceById(state: AcademiqAppState, id: string, workspaceId?: string): any | null {
  const refId = String(id || '');
  return selectWorkspaceLibrary(state, workspaceId).find((ref) => ref && String(ref.id) === refId) || null;
}

export function selectNotes(state: AcademiqAppState): any[] {
  return Array.isArray(state.notes) ? state.notes : [];
}

export function selectNotebooks(state: AcademiqAppState): Array<{ id: string; name: string; wsId?: string }> {
  return Array.isArray(state.notebooks) ? state.notebooks : [];
}

export function selectCurrentNotebookId(state: AcademiqAppState): string {
  return String(state.curNb || '');
}

export function ensureNotebooks(state: AcademiqAppState): Partial<AcademiqAppState> {
  const curWs = state.cur || 'ws1';
  const notebooks = Array.isArray(state.notebooks) ? state.notebooks : [];
  const hasNotebookForCur = notebooks.some(nb => nb.wsId === curWs);
  const hasCurNb = !!state.curNb;

  if (hasNotebookForCur && hasCurNb) {
    return {};
  }

  const nextNotebooks = [...notebooks];
  let newNbId = '';
  if (!hasNotebookForCur) {
    newNbId = `${curWs}:nb1`;
    nextNotebooks.push({
      id: newNbId,
      wsId: curWs,
      name: 'Genel Notlar'
    });
  }

  const defaultCurNb = newNbId || notebooks.find(nb => nb.wsId === curWs)?.id || `${curWs}:nb1`;
  const nextCurNb = state.curNb || defaultCurNb;

  return {
    notebooks: nextNotebooks,
    curNb: nextCurNb
  };
}

export function addNote(state: AcademiqAppState, note: AcademiqNote): Partial<AcademiqAppState> {
  const notes = Array.isArray(state.notes) ? state.notes : [];
  return {
    notes: [note, ...notes]
  };
}

