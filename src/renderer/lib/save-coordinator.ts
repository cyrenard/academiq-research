export type SaveWriterResult = { ok?: boolean; error?: string } | undefined;

export type SaveReceipt = {
  sequence: number;
  source: string;
  requestedAt: number;
  savedAt: number;
  result: SaveWriterResult;
};

export class SaveBeforeHydrationError extends Error {
  constructor(source: string) {
    super(`save_before_hydration:${source}`);
    this.name = 'SaveBeforeHydrationError';
  }
}

type SaveWriter = (payload: string, source: string) => Promise<SaveWriterResult>;

/**
 * Serializes every full-state write made by the renderer.
 *
 * A Tauri invoke is asynchronous, so two callers can otherwise commit in the
 * opposite order. The coordinator also starts behind a hydration barrier: a
 * blank startup state can never reach disk before data_load has succeeded.
 */
export class SaveCoordinator {
  private hydrated = false;
  private sequence = 0;
  private committedSequence = 0;
  private pendingError: unknown = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly writer: SaveWriter) {}

  markHydrated() {
    this.hydrated = true;
  }

  suspend() {
    this.hydrated = false;
  }

  isHydrated() {
    return this.hydrated;
  }

  getCommittedSequence() {
    return this.committedSequence;
  }

  async flush() {
    await this.tail;
    if (this.pendingError) throw this.pendingError;
  }

  save(payload: string, source = 'save'): Promise<SaveReceipt> {
    if (!this.hydrated) {
      return Promise.reject(new SaveBeforeHydrationError(source));
    }

    const sequence = ++this.sequence;
    const requestedAt = Date.now();
    const run = this.tail.then(async () => {
      const result = await this.writer(payload, source);
      if (!result || result.ok !== true) {
        throw new Error(result?.error || `${source}_failed`);
      }
      this.committedSequence = sequence;
      this.pendingError = null;
      return {
        sequence,
        source,
        requestedAt,
        savedAt: Date.now(),
        result
      } satisfies SaveReceipt;
    });

    // A failed write must reject its own caller but must not poison later
    // writes. Keeping a settled void tail gives the next request a clean turn.
    this.tail = run.then(
      () => undefined,
      (error) => {
        this.pendingError = error;
      }
    );
    return run;
  }
}

function recordSaveResult(kind: 'aq.lastSaveOk' | 'aq.lastSaveError', value: Record<string, unknown>) {
  try {
    localStorage.setItem(kind, JSON.stringify(value));
  } catch (_error) {}
}

export const appSaveCoordinator = new SaveCoordinator(async (payload, source) => {
  const result = await window.electronAPI?.saveData?.(payload, source) as SaveWriterResult;
  return result;
});

export const editorDraftCoordinator = new SaveCoordinator(async (payload) => {
  const result = await window.electronAPI?.saveEditorDraft?.(payload) as SaveWriterResult;
  return result;
});

export function markAppStateHydrated() {
  appSaveCoordinator.markHydrated();
  editorDraftCoordinator.markHydrated();
}

export function suspendAppStateWrites() {
  appSaveCoordinator.suspend();
  editorDraftCoordinator.suspend();
}

export async function flushAppStateWrites() {
  await Promise.all([
    appSaveCoordinator.flush(),
    editorDraftCoordinator.flush()
  ]);
}

export async function queueEditorDraftSave(state: unknown) {
  const payload = typeof state === 'string' ? state : JSON.stringify(state);
  return (await editorDraftCoordinator.save(payload, 'editor-draft')).result;
}

export async function queueAppStateSave(state: unknown, source = 'save') {
  const payload = typeof state === 'string' ? state : JSON.stringify(state);
  try {
    const receipt = await appSaveCoordinator.save(payload, source);
    recordSaveResult('aq.lastSaveOk', {
      at: new Date(receipt.savedAt).toISOString(),
      source,
      sequence: receipt.sequence,
      queuedMs: Math.max(0, receipt.savedAt - receipt.requestedAt),
      bytes: payload.length
    });
    return receipt.result;
  } catch (error) {
    recordSaveResult('aq.lastSaveError', {
      at: new Date().toISOString(),
      source,
      error: error instanceof Error ? error.message : String(error),
      bytes: payload.length
    });
    throw error;
  }
}
