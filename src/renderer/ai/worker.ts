/// <reference lib="webworker" />
/**
 * AI Web Worker — runs in its own thread.
 *
 * Responsibilities (Day 3a — bare scaffold):
 *   - Detect available backend (webgpu / wasm / unsupported).
 *   - Respond to ping / cancel / unload-model fast.
 *   - Reject load-model + extract with a clear "model loading not yet
 *     bundled" error so the bridge can surface it cleanly. Real model
 *     loading lands in Day 3b.
 *
 * Strict isolation: this file MUST NOT import anything from outside
 * src/renderer/ai/. No app state, no DOM, no electronAPI. It is built
 * as a separate Vite worker bundle.
 */
import { isAIWorkerRequest } from './protocol';
import { detectAIBackend } from './backend-detect';
import type {
  AIWorkerRequest,
  AIWorkerResponse
} from './types';

// Worker globalThis is `DedicatedWorkerGlobalScope`; we narrow it.
declare const self: DedicatedWorkerGlobalScope;

// Soft cancellation registry: { [requestId]: cancelled flag }.
// Day 3b inference loops will check these between tokens.
const cancelled = new Set<string>();

function send(response: AIWorkerResponse) {
  self.postMessage(response);
}

function sendError(id: string, message: string, code?: string) {
  send({ id, kind: 'error', message, ...(code ? { code } : {}) });
}

self.addEventListener('message', async (event: MessageEvent<unknown>) => {
  const message = event.data;
  if (!isAIWorkerRequest(message)) {
    // Silently ignore unknown payloads — the bridge already validates,
    // so anything getting here is suspicious.
    return;
  }
  const request: AIWorkerRequest = message;

  switch (request.kind) {
    case 'ping': {
      send({ id: request.id, kind: 'pong' });
      return;
    }

    case 'detect-backend': {
      const backend = await detectAIBackend();
      send({ id: request.id, kind: 'backend', backend });
      return;
    }

    case 'cancel': {
      cancelled.add(request.targetId);
      send({ id: request.id, kind: 'cancelled' });
      return;
    }

    case 'unload-model': {
      // No model loaded yet (Day 3a scaffold). Acknowledge for forward
      // compatibility with the bridge.
      send({ id: request.id, kind: 'model-loaded', modelId: '', backend: await detectAIBackend() });
      return;
    }

    case 'load-model': {
      // Model loading lands in Day 3b. Surface a recognizable error so
      // the Settings UI can show it cleanly instead of a generic timeout.
      sendError(
        request.id,
        'AI model loading not yet bundled (Phase 1 Day 3a scaffold). Coming in next commit.',
        'model_not_implemented'
      );
      return;
    }

    case 'extract': {
      sendError(
        request.id,
        'AI extraction not yet bundled (Phase 1 Day 3a scaffold). Coming in next commit.',
        'extract_not_implemented'
      );
      return;
    }

    default: {
      // Exhaustiveness check — TS will flag if a new request kind is added
      // but no case here.
      const _exhaustive: never = request;
      void _exhaustive;
      sendError((request as AIWorkerRequest).id, 'Unknown request kind');
    }
  }
});

// Optional: signal "alive" on boot so a future install probe can know
// the worker bundle loaded successfully.
send({ id: 'worker-boot', kind: 'pong' });
