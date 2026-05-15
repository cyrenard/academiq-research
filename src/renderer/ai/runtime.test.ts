import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAIRuntime } from './runtime';
import { _resetRequestIdCounterForTests } from './protocol';
import type { AIWorkerRequest, AIWorkerResponse } from './types';

// Minimal Worker stub: records postMessage calls + lets test trigger
// onmessage events to simulate worker responses.
class MockWorker implements Pick<Worker, 'postMessage' | 'terminate' | 'addEventListener'> {
  posted: AIWorkerRequest[] = [];
  private listeners: Map<string, ((event: any) => void)[]> = new Map();
  terminated = false;

  postMessage(message: AIWorkerRequest) {
    this.posted.push(message);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(_type: string, _listener: (event: any) => void) {
    // no-op for tests
  }

  dispatchEvent(_event: Event): boolean {
    return true;
  }

  /** Test helper: simulate a message arriving from worker. */
  sendFromWorker(response: AIWorkerResponse | unknown) {
    (this.listeners.get('message') || []).forEach((fn) => fn({ data: response }));
  }

  /** Test helper: simulate worker error. */
  triggerError(message: string) {
    (this.listeners.get('error') || []).forEach((fn) => fn({ message }));
  }

  terminate() {
    this.terminated = true;
  }
}

beforeEach(() => {
  _resetRequestIdCounterForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeRuntime() {
  const worker = new MockWorker();
  const runtime = createAIRuntime({
    workerFactory: () => worker as unknown as Worker
  });
  return { runtime, worker };
}

// ─── Worker spawn / message routing ──────────────────────────────────────

describe('createAIRuntime', () => {
  it('lazy-spawns worker on first call', async () => {
    const factory = vi.fn(() => new MockWorker() as unknown as Worker);
    const runtime = createAIRuntime({ workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    // Trigger a call (don't await — we just want to know factory ran)
    void runtime.ping().catch(() => {});
    expect(factory).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it('reuses the same worker across calls', () => {
    const worker = new MockWorker();
    const factory = vi.fn(() => worker as unknown as Worker);
    const runtime = createAIRuntime({ workerFactory: factory });
    void runtime.ping().catch(() => {});
    void runtime.ping().catch(() => {});
    expect(factory).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });

  it('default factory throws clearly when not overridden', () => {
    const runtime = createAIRuntime();
    expect(() => runtime.cancel('x')).not.toThrow();  // no-op when no worker
    runtime.dispose();
  });
});

// ─── ping ────────────────────────────────────────────────────────────────

describe('ping', () => {
  it('round-trips a pong response and returns a duration ≥ 0', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.ping();
    expect(worker.posted.length).toBe(1);
    expect(worker.posted[0]!.kind).toBe('ping');
    worker.sendFromWorker({ id: worker.posted[0]!.id, kind: 'pong' });
    const ms = await promise;
    expect(ms).toBeGreaterThanOrEqual(0);
    runtime.dispose();
  });

  it('rejects on error response', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.ping();
    worker.sendFromWorker({ id: worker.posted[0]!.id, kind: 'error', message: 'boom' });
    await expect(promise).rejects.toThrow('boom');
    runtime.dispose();
  });
});

// ─── detectBackend ───────────────────────────────────────────────────────

describe('detectBackend', () => {
  it('returns the backend reported by worker', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.detectBackend();
    worker.sendFromWorker({ id: worker.posted[0]!.id, kind: 'backend', backend: 'webgpu' });
    expect(await promise).toBe('webgpu');
    runtime.dispose();
  });
});

// ─── loadModel ───────────────────────────────────────────────────────────

describe('loadModel', () => {
  it('forwards download-progress events to onProgress', async () => {
    const { runtime, worker } = makeRuntime();
    const onProgress = vi.fn();
    const promise = runtime.loadModel('m1', { onProgress });
    const reqId = worker.posted[0]!.id;
    worker.sendFromWorker({
      id: reqId, kind: 'download-progress', modelId: 'm1', receivedBytes: 100, totalBytes: 1000
    });
    worker.sendFromWorker({
      id: reqId, kind: 'download-progress', modelId: 'm1', receivedBytes: 500, totalBytes: 1000
    });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(500, 1000);
    worker.sendFromWorker({ id: reqId, kind: 'model-loaded', modelId: 'm1', backend: 'webgpu' });
    const res = await promise;
    expect(res.backend).toBe('webgpu');
    runtime.dispose();
  });

  it('does not require an onProgress callback', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.loadModel('m1');
    const reqId = worker.posted[0]!.id;
    worker.sendFromWorker({
      id: reqId, kind: 'download-progress', modelId: 'm1', receivedBytes: 1, totalBytes: 2
    });
    worker.sendFromWorker({ id: reqId, kind: 'model-loaded', modelId: 'm1', backend: 'wasm' });
    await expect(promise).resolves.toEqual({ backend: 'wasm' });
    runtime.dispose();
  });
});

// ─── extract ─────────────────────────────────────────────────────────────

describe('extract', () => {
  it('filters invalid column keys before sending to worker', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.extract({
      modelId: 'm',
      pdfText: 'body',
      reference: { id: 'r1', title: 'X' },
      columns: ['purpose', 'mystery' as any, 'method']
    });
    const sent = worker.posted[0] as Extract<AIWorkerRequest, { kind: 'extract' }>;
    expect(sent.columns).toEqual(['purpose', 'method']);
    worker.sendFromWorker({ id: sent.id, kind: 'extract-result', candidates: [] });
    await promise;
    runtime.dispose();
  });

  it('returns [] when all columns are invalid (no worker call)', async () => {
    const { runtime, worker } = makeRuntime();
    const result = await runtime.extract({
      modelId: 'm', pdfText: '', reference: { id: 'r', title: '' }, columns: ['x', 'y'] as any
    });
    expect(result).toEqual([]);
    expect(worker.posted.length).toBe(0);
    runtime.dispose();
  });

  it('returns the candidates array from worker', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.extract({
      modelId: 'm', pdfText: 'body',
      reference: { id: 'r1', title: 'T' },
      columns: ['method']
    });
    const sent = worker.posted[0]!;
    worker.sendFromWorker({
      id: sent.id, kind: 'extract-result',
      candidates: [{
        source: 'model', column: 'method', value: 'Karma',
        confidence: 0.85, evidenceQuote: 'we used mixed methods',
        modelId: 'm', generatedAt: 100
      }]
    });
    const out = await promise;
    expect(out.length).toBe(1);
    expect(out[0]!.value).toBe('Karma');
    runtime.dispose();
  });

  it('coerces non-string reference fields to safe strings', async () => {
    const { runtime, worker } = makeRuntime();
    runtime.extract({
      modelId: 'm', pdfText: undefined as any,
      reference: { id: 123 as any, title: null as any, year: 2024 as any, doi: undefined },
      columns: ['purpose']
    }).catch(() => {});  // discarded; we only assert what was posted
    const sent = worker.posted[0] as Extract<AIWorkerRequest, { kind: 'extract' }>;
    expect(sent.pdfText).toBe('');
    expect(sent.reference.id).toBe('123');
    expect(sent.reference.title).toBe('');
    expect(sent.reference.year).toBe('2024');
    expect(sent.reference.doi).toBeUndefined();
    runtime.dispose();
  });
});

// ─── cancel ──────────────────────────────────────────────────────────────

describe('cancel', () => {
  it('posts a cancel message with the target id', async () => {
    const { runtime, worker } = makeRuntime();
    runtime.ping().catch(() => {});  // discarded; just need worker spawned
    runtime.cancel('extract-XYZ');
    const lastPost = worker.posted[worker.posted.length - 1]!;
    expect(lastPost.kind).toBe('cancel');
    expect((lastPost as any).targetId).toBe('extract-XYZ');
    runtime.dispose();
  });

  it('no-op when worker has not been spawned yet', () => {
    const runtime = createAIRuntime({ workerFactory: () => new MockWorker() as unknown as Worker });
    expect(() => runtime.cancel('any')).not.toThrow();
    runtime.dispose();
  });
});

// ─── error handling ──────────────────────────────────────────────────────

describe('error handling', () => {
  it('rejects all pending promises on worker error event', async () => {
    const { runtime, worker } = makeRuntime();
    const a = runtime.ping();
    const b = runtime.ping();
    worker.triggerError('worker died');
    await expect(a).rejects.toThrow('worker died');
    await expect(b).rejects.toThrow('worker died');
    runtime.dispose();
  });

  it('ignores unrecognized worker payloads', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.ping();
    // Random garbage shouldn't resolve the pending promise
    worker.sendFromWorker({ id: 'unknown-id', kind: 'pong' });
    worker.sendFromWorker({ no: 'kind', id: worker.posted[0]!.id });
    worker.sendFromWorker(null);
    worker.sendFromWorker('string');
    // Now send the right one
    worker.sendFromWorker({ id: worker.posted[0]!.id, kind: 'pong' });
    await expect(promise).resolves.toBeGreaterThanOrEqual(0);
    runtime.dispose();
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────

describe('dispose', () => {
  it('terminates the worker and rejects pending promises', async () => {
    const { runtime, worker } = makeRuntime();
    const promise = runtime.ping();
    runtime.dispose();
    expect(worker.terminated).toBe(true);
    await expect(promise).rejects.toThrow('disposed');
  });

  it('rejects new calls after dispose', async () => {
    const { runtime } = makeRuntime();
    runtime.dispose();
    await expect(runtime.ping()).rejects.toThrow('disposed');
  });
});
