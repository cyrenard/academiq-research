import { useEffect } from 'react';

export type KeyCombo = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

export type ShortcutHandler = {
  id: string;
  combo: KeyCombo | KeyCombo[];
  handler: (event: KeyboardEvent) => void | boolean;
  priority?: number;
  description?: string;
  allowExtraModifiers?: boolean;
  stopPropagation?: boolean;
};

class KeyboardRouter {
  private handlers: ShortcutHandler[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown.bind(this), true);
    }
  }

  register(handler: ShortcutHandler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return () => {
      this.handlers = this.handlers.filter((h) => h.id !== handler.id);
    };
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.isComposing || event.key === 'Process') return;
    const key = event.key.toLowerCase();
    for (const h of this.handlers) {
      const combos = Array.isArray(h.combo) ? h.combo : [h.combo];
      for (const combo of combos) {
        const comboKey = combo.key.toLowerCase();
        const matchesKey = event.key === combo.key || key === comboKey;
        const primaryPressed = event.ctrlKey || event.metaKey;
        const expectsPrimary = combo.ctrlKey === true || combo.metaKey === true;
        const matchesCtrl = expectsPrimary
          ? primaryPressed
          : (h.allowExtraModifiers ? true : !primaryPressed);
        const matchesShift = combo.shiftKey === true
          ? event.shiftKey
          : (h.allowExtraModifiers ? true : !event.shiftKey);
        const matchesAlt = combo.altKey === true
          ? event.altKey
          : (h.allowExtraModifiers ? true : !event.altKey);

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          const result = h.handler(event);
          if (result !== false) {
            if (h.stopPropagation !== false) {
              event.stopPropagation();
              event.stopImmediatePropagation();
            }
            return;
          }
        }
      }
    }
  }
}

export const keyboardRouter = new KeyboardRouter();

export function useKeyboardShortcut(
  id: string,
  combo: KeyCombo | KeyCombo[],
  handler: (event: KeyboardEvent) => void | boolean,
  dependencies: any[] = [],
  options?: { priority?: number; description?: string; allowExtraModifiers?: boolean; stopPropagation?: boolean }
) {
  useEffect(() => {
    const cleanup = keyboardRouter.register({
      id,
      combo,
      handler,
      priority: options?.priority,
      description: options?.description,
      allowExtraModifiers: options?.allowExtraModifiers,
      stopPropagation: options?.stopPropagation
    });
    return cleanup;
  }, [id, ...dependencies]);
}
