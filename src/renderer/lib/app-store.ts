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
