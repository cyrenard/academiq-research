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
    const key = event.key.toLowerCase();
    for (const h of this.handlers) {
      const combos = Array.isArray(h.combo) ? h.combo : [h.combo];
      for (const combo of combos) {
        const comboKey = combo.key.toLowerCase();
        const matchesKey = event.key === combo.key || key === comboKey;
        const matchesCtrl = !combo.ctrlKey || (event.ctrlKey || event.metaKey);
        const matchesShift = !combo.shiftKey || event.shiftKey;
        const matchesAlt = !combo.altKey || event.altKey;

        if (matchesKey && matchesCtrl && matchesShift && matchesAlt) {
          const result = h.handler(event);
          if (result !== false) {
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
  options?: { priority?: number; description?: string }
) {
  useEffect(() => {
    const cleanup = keyboardRouter.register({
      id,
      combo,
      handler,
      priority: options?.priority,
      description: options?.description
    });
    return cleanup;
  }, [id, ...dependencies]);
}
