/**
 * AI Runtime — renderer-side bridge to the AI Web Worker.
 *
 * Single instance per renderer. Lazily spawns the Worker on first use.
 * All worker calls return promises that resolve with typed responses
 * or reject on error / timeout / cancellation.
 *
 * Isolation contract (this module enforces):
 *   - Worker is created with type:'module' so its globalThis is a
 *     DedicatedWorkerGlobalScope (no `window`, no `document`).
 *   - This bridge accepts only the typed API surface defined in
 *     protocol.ts; nothing else can be sent to the worker.
 *   - Outputs flow back through the message router; the bridge never
 *     mutates state directly — callers receive promises.
 */
import {
  createRequestId,
  isAIWorkerResponse,
  filterColumnKeys
} from './protocol';
import type {
  AIBackendType,
  AICandidate,
  AIWorkerRequest,
  AIWorkerResponse,
  MatrixColumnKey
} from './types';

const REQUEST_TIMEOUT_MS = 60_000;            // single inference cap
const PROGRESS_TIMEOUT_MS = 600_000;          // model download cap (10 min)

type Pending = {
  resolve: (response: AIWorkerResponse) => void;
  reject: (error: Error) => void;
  /** When set, intermediate `download-progress` messages forward here. */
  onProgress?: (progress: { receivedBytes: number; totalBytes: number; modelId: string }) => void;
  timeoutHandle: number;
};

export interface AIRuntime {
  /**
   * Detect what backend the worker can use (webgpu / wasm / unsupported).
   * Cheap call, ~5ms.
   */
  detectBackend(): Promise<AIBackendType>;

  /**
   * Load a model. Resolves once the model is ready for inference.
   * Reports download progress if the model isn't cached yet.
   */
  loadModel(modelId: string, opts?: {
    onProgress?: (received: number, total: number) => void;
  }): Promise<{ backend: AIBackendType }>;

  /**
   * Free model memory. Subsequent `extract` calls require `loadModel`.
   */
  unloadModel(): Promise<void>;

  /**
   * Run extraction on PDF text. Returns candidate cell values (one
   * per column requested) with evidence quotes and confidence scores.
   */
  extract(input: {
    modelId: string;
    pdfText: string;
    reference: { id: string; title: string; year?: string; doi?: string };
    columns: MatrixColumnKey[];
  }): Promise<AICandidate[]>;

  /** Liveness probe. Resolves with the round-trip duration in ms. */
  ping(): Promise<number>;

  /** Cancel a single in-flight extract by its handle id. */
  cancel(targetId: string): void;

  /** Tear down the worker and reject every pending promise. */
  dispose(): void;
}

export interface AIRuntimeOptions {
  /**
   * Worker factory — exposed for testing. Production code uses the
   * default which spawns the bundled worker.
   */
  workerFactory?: () => Worker;
}

/**
 * Default factory — used in production. In tests, callers pass a
 * MockWorker instead.
 *
 * Vite's `new Worker(new URL(..., import.meta.url), { type: 'module' })`
 * pattern bundles the worker as a separate chunk and yields a Worker
 * URL the browser can spawn. The `type: 'module'` ensures the worker
 * scope is a DedicatedWorkerGlobalScope (no `window`/`document`).
 */
function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'aq-ai-worker'
  });
}

export function createAIRuntime(options: AIRuntimeOptions = {}): AIRuntime {
  const factory = options.workerFactory || defaultWorkerFactory;
  let worker: Worker | null = null;
  const pending = new Map<string, Pending>();
  let disposed = false;

  function spawn(): Worker {
    if (worker) return worker;
    worker = factory();
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    return worker;
  }

  function onMessage(event: MessageEvent) {
    if (!isAIWorkerResponse(event.data)) {
      // Unknown payload — ignore. Workers should only emit typed responses.
      return;
    }
    const response = event.data;
    const entry = pending.get(response.id);
    if (!entry) return;

    // Forward intermediate progress without resolving.
    if (response.kind === 'download-progress') {
      entry.onProgress?.({
        receivedBytes: response.receivedBytes,
        totalBytes: response.totalBytes,
        modelId: response.modelId
      });
      return;
    }

    pending.delete(response.id);
    window.clearTimeout(entry.timeoutHandle);

    if (response.kind === 'error') {
      entry.reject(new Error(response.message));
      return;
    }
    entry.resolve(response);
  }

  function onError(event: ErrorEvent) {
    const message = event.message || 'AI worker error';
    pending.forEach((entry) => {
      window.clearTimeout(entry.timeoutHandle);
      entry.reject(new Error(message));
    });
    pending.clear();
  }

  function send<T extends AIWorkerResponse>(
    request: AIWorkerRequest,
    opts: { timeoutMs?: number; onProgress?: Pending['onProgress'] } = {}
  ): Promise<T> {
    if (disposed) return Promise.reject(new Error('AI runtime disposed'));
    const w = spawn();
    return new Promise<T>((resolve, reject) => {
      const timeoutHandle = window.setTimeout(() => {
        if (pending.has(request.id)) {
          pending.delete(request.id);
          reject(new Error(`AI worker timeout (${request.kind})`));
        }
      }, opts.timeoutMs ?? REQUEST_TIMEOUT_MS);
      pending.set(request.id, {
        resolve: (response) => resolve(response as T),
        reject,
        onProgress: opts.onProgress,
        timeoutHandle: timeoutHandle as unknown as number
      });
      w.postMessage(request);
    });
  }

  return {
    async detectBackend() {
      const response = await send<Extract<AIWorkerResponse, { kind: 'backend' }>>({
        id: createRequestId('detect'),
        kind: 'detect-backend'
      });
      return response.backend;
    },

    async loadModel(modelId, opts = {}) {
      const response = await send<Extract<AIWorkerResponse, { kind: 'model-loaded' }>>(
        { id: createRequestId('load'), kind: 'load-model', modelId },
        {
          timeoutMs: PROGRESS_TIMEOUT_MS,
          onProgress: opts.onProgress
            ? ({ receivedBytes, totalBytes }) => opts.onProgress!(receivedBytes, totalBytes)
            : undefined
        }
      );
      return { backend: response.backend };
    },

    async unloadModel() {
      await send({ id: createRequestId('unload'), kind: 'unload-model' });
    },

    async extract(input) {
      // Defensive input validation — never trust caller fully
      const safeColumns = filterColumnKeys(input.columns);
      if (safeColumns.length === 0) return [];
      const response = await send<Extract<AIWorkerResponse, { kind: 'extract-result' }>>({
        id: createRequestId('extract'),
        kind: 'extract',
        modelId: input.modelId,
        pdfText: String(input.pdfText || ''),
        reference: {
          id: String(input.reference.id || ''),
          title: String(input.reference.title || ''),
          year: input.reference.year ? String(input.reference.year) : undefined,
          doi: input.reference.doi ? String(input.reference.doi) : undefined
        },
        columns: safeColumns
      });
      return response.candidates;
    },

    async ping() {
      const start = performance.now();
      await send({ id: createRequestId('ping'), kind: 'ping' });
      return performance.now() - start;
    },

    cancel(targetId) {
      if (!worker) return;
      try {
        worker.postMessage({ id: createRequestId('cancel'), kind: 'cancel', targetId });
      } catch (_e) {}
    },

    dispose() {
      disposed = true;
      pending.forEach((entry) => {
        window.clearTimeout(entry.timeoutHandle);
        entry.reject(new Error('AI runtime disposed'));
      });
      pending.clear();
      if (worker) {
        try { worker.terminate(); } catch (_e) {}
        worker = null;
      }
    }
  };
}
