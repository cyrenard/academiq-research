export type EditorCommandPayload = Record<string, unknown> | undefined;
export type EditorCommandResult = unknown | Promise<unknown>;
export type EditorCommandHandler = (payload: EditorCommandPayload) => EditorCommandResult;

type RegisteredHandler = {
  handler: EditorCommandHandler;
  priority: number;
};

/**
 * One semantic command boundary for editor input coming from React, AQ Engine
 * and the temporary legacy runtime. DOM listeners may remain platform-specific,
 * but they no longer decide which product action owns the event.
 */
export class EditorCommandRouter {
  private handlers = new Map<string, RegisteredHandler[]>();

  register(command: string, handler: EditorCommandHandler, priority = 0) {
    const entry = { handler, priority };
    const next = [...(this.handlers.get(command) || []), entry]
      .sort((left, right) => right.priority - left.priority);
    this.handlers.set(command, next);

    return () => {
      const current = this.handlers.get(command) || [];
      const remaining = current.filter((candidate) => candidate !== entry);
      if (remaining.length) this.handlers.set(command, remaining);
      else this.handlers.delete(command);
    };
  }

  dispatch(command: string, payload?: EditorCommandPayload): EditorCommandResult | false {
    const entries = this.handlers.get(command) || [];
    for (const entry of entries) {
      const result = entry.handler(payload);
      if (result !== false) return result;
    }
    return false;
  }

  has(command: string) {
    return (this.handlers.get(command)?.length || 0) > 0;
  }
}

export const editorCommandRouter = new EditorCommandRouter();
