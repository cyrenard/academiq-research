import { useSyncExternalStore } from 'react';
import { AcademiqAppState, createBlankState } from './app-state';
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

export function selectReferenceById(state: AcademiqAppState, id: string, workspaceId?: string): any | null {
  const refId = String(id || '');
  return selectWorkspaceLibrary(state, workspaceId).find((ref) => ref && String(ref.id) === refId) || null;
}

export function selectNotes(state: AcademiqAppState): any[] {
  return Array.isArray(state.notes) ? state.notes : [];
}
