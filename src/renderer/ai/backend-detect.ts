/**
 * Backend detection helper — extracted out of worker.ts so it can be
 * unit-tested in Node/jsdom without spawning a real Worker.
 *
 * Returns 'webgpu' when navigator.gpu.requestAdapter resolves with an
 * adapter, 'wasm' when WebAssembly is present, otherwise 'unsupported'.
 */
import type { AIBackendType } from './types';

type GPULike = { requestAdapter: () => Promise<unknown> };
type NavigatorWithGPU = { gpu?: GPULike };

export async function detectAIBackend(
  // Injectable for tests; default reads from globalThis.
  // Distinguishes between "key absent" (use globalThis) and "key present
  // but undefined" (treat as missing) via `in` checks.
  source: { navigator?: NavigatorWithGPU; webAssembly?: typeof WebAssembly } = {}
): Promise<AIBackendType> {
  const nav = 'navigator' in source
    ? source.navigator
    : (typeof navigator !== 'undefined' ? navigator as NavigatorWithGPU : undefined);
  const wasm = 'webAssembly' in source
    ? source.webAssembly
    : (typeof WebAssembly !== 'undefined' ? WebAssembly : undefined);
  try {
    const gpu = nav?.gpu;
    if (gpu && typeof gpu.requestAdapter === 'function') {
      const adapter = await gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch (_e) {
    // fall through
  }
  if (wasm) return 'wasm';
  return 'unsupported';
}
