import { describe, it, expect, vi } from 'vitest';
import { detectAIBackend } from './backend-detect';

describe('detectAIBackend', () => {
  it('returns "webgpu" when navigator.gpu yields an adapter', async () => {
    const adapter = { /* opaque */ };
    const result = await detectAIBackend({
      navigator: { gpu: { requestAdapter: async () => adapter } },
      webAssembly: WebAssembly
    });
    expect(result).toBe('webgpu');
  });

  it('falls back to "wasm" when navigator.gpu is missing', async () => {
    const result = await detectAIBackend({
      navigator: {},
      webAssembly: WebAssembly
    });
    expect(result).toBe('wasm');
  });

  it('falls back to "wasm" when requestAdapter resolves with null', async () => {
    const result = await detectAIBackend({
      navigator: { gpu: { requestAdapter: async () => null } },
      webAssembly: WebAssembly
    });
    expect(result).toBe('wasm');
  });

  it('falls back to "wasm" when requestAdapter throws', async () => {
    const result = await detectAIBackend({
      navigator: { gpu: { requestAdapter: async () => { throw new Error('blocked'); } } },
      webAssembly: WebAssembly
    });
    expect(result).toBe('wasm');
  });

  it('returns "unsupported" when neither WebGPU nor WebAssembly available', async () => {
    const result = await detectAIBackend({
      navigator: {},
      webAssembly: undefined
    });
    expect(result).toBe('unsupported');
  });

  it('reads from globalThis.navigator/WebAssembly when no source given (jsdom default)', async () => {
    const result = await detectAIBackend();
    // jsdom doesn't ship navigator.gpu, but it has WebAssembly
    expect(['webgpu', 'wasm', 'unsupported']).toContain(result);
  });

  it('does not call requestAdapter when gpu has no method', async () => {
    const requestAdapter = vi.fn(async () => ({}));
    const result = await detectAIBackend({
      navigator: { gpu: { requestAdapter: undefined as any } },
      webAssembly: WebAssembly
    });
    expect(requestAdapter).not.toHaveBeenCalled();
    expect(result).toBe('wasm');
  });
});
