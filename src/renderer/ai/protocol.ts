/**
 * Worker protocol helpers — request id generation + type guards.
 *
 * Kept separate from `types.ts` so the runtime tree doesn't drag the
 * worker bundle's transformers.js dependency. Both renderer and worker
 * import this file safely.
 */
import type { AIWorkerRequest, AIWorkerResponse, MatrixColumnKey } from './types';

let nextRequestId = 0;

/**
 * Mints a unique request id. Used so the bridge can correlate
 * responses to in-flight calls.
 */
export function createRequestId(prefix = 'aireq'): string {
  nextRequestId = (nextRequestId + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${nextRequestId.toString(36)}`;
}

/** Test-only: resets the id counter for deterministic assertions. */
export function _resetRequestIdCounterForTests() {
  nextRequestId = 0;
}

// ─── Type guards ────────────────────────────────────────────────────────────

export function isAIWorkerRequest(value: unknown): value is AIWorkerRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AIWorkerRequest>;
  if (typeof v.id !== 'string' || typeof v.kind !== 'string') return false;
  switch (v.kind) {
    case 'detect-backend':
    case 'unload-model':
    case 'ping':
      return true;
    case 'load-model':
      return typeof (v as any).modelId === 'string';
    case 'extract':
      return (
        typeof (v as any).modelId === 'string'
        && typeof (v as any).pdfText === 'string'
        && (v as any).reference != null
        && Array.isArray((v as any).columns)
      );
    case 'cancel':
      return typeof (v as any).targetId === 'string';
    default:
      return false;
  }
}

export function isAIWorkerResponse(value: unknown): value is AIWorkerResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<AIWorkerResponse>;
  if (typeof v.id !== 'string' || typeof v.kind !== 'string') return false;
  switch (v.kind) {
    case 'pong':
    case 'cancelled':
      return true;
    case 'backend':
      return typeof (v as any).backend === 'string';
    case 'model-loaded':
      return typeof (v as any).modelId === 'string';
    case 'download-progress':
      return (
        typeof (v as any).modelId === 'string'
        && typeof (v as any).receivedBytes === 'number'
        && typeof (v as any).totalBytes === 'number'
      );
    case 'extract-result':
      return Array.isArray((v as any).candidates);
    case 'error':
      return typeof (v as any).message === 'string';
    default:
      return false;
  }
}

// ─── Allow-list of column keys (used for input validation) ──────────────────

const COLUMN_ALLOWLIST: ReadonlySet<MatrixColumnKey> = new Set<MatrixColumnKey>([
  'purpose',
  'method',
  'sample',
  'findings',
  'limitations'
]);

export function isMatrixColumnKey(value: unknown): value is MatrixColumnKey {
  return typeof value === 'string' && COLUMN_ALLOWLIST.has(value as MatrixColumnKey);
}

export function filterColumnKeys(values: readonly unknown[]): MatrixColumnKey[] {
  return values.filter(isMatrixColumnKey) as MatrixColumnKey[];
}
