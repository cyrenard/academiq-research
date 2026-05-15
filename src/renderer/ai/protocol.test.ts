import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRequestId,
  isAIWorkerRequest,
  isAIWorkerResponse,
  isMatrixColumnKey,
  filterColumnKeys,
  _resetRequestIdCounterForTests
} from './protocol';

beforeEach(() => {
  _resetRequestIdCounterForTests();
});

// ─── createRequestId ──────────────────────────────────────────────────────

describe('createRequestId', () => {
  it('produces unique ids on repeated calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) ids.add(createRequestId());
    expect(ids.size).toBe(100);
  });

  it('respects custom prefix', () => {
    expect(createRequestId('foo')).toMatch(/^foo-/);
  });

  it('uses default prefix when none given', () => {
    expect(createRequestId()).toMatch(/^aireq-/);
  });
});

// ─── isMatrixColumnKey / filterColumnKeys ─────────────────────────────────

describe('isMatrixColumnKey', () => {
  it('accepts the 5 known column keys', () => {
    ['purpose', 'method', 'sample', 'findings', 'limitations'].forEach((key) => {
      expect(isMatrixColumnKey(key)).toBe(true);
    });
  });
  it('rejects unknown strings', () => {
    expect(isMatrixColumnKey('mystery')).toBe(false);
    expect(isMatrixColumnKey('PURPOSE')).toBe(false);  // case-sensitive
  });
  it('rejects non-strings', () => {
    expect(isMatrixColumnKey(null)).toBe(false);
    expect(isMatrixColumnKey(123)).toBe(false);
    expect(isMatrixColumnKey({})).toBe(false);
  });
});

describe('filterColumnKeys', () => {
  it('keeps valid columns and drops the rest', () => {
    const input = ['purpose', 'mystery', 'findings', null, 42, 'method'];
    expect(filterColumnKeys(input)).toEqual(['purpose', 'findings', 'method']);
  });
  it('returns [] for empty / all-invalid input', () => {
    expect(filterColumnKeys([])).toEqual([]);
    expect(filterColumnKeys(['x', 1, null])).toEqual([]);
  });
});

// ─── isAIWorkerRequest ────────────────────────────────────────────────────

describe('isAIWorkerRequest', () => {
  it('accepts simple kinds', () => {
    expect(isAIWorkerRequest({ id: 'a', kind: 'detect-backend' })).toBe(true);
    expect(isAIWorkerRequest({ id: 'a', kind: 'unload-model' })).toBe(true);
    expect(isAIWorkerRequest({ id: 'a', kind: 'ping' })).toBe(true);
  });
  it('requires id + kind to be strings', () => {
    expect(isAIWorkerRequest({ kind: 'ping' })).toBe(false);
    expect(isAIWorkerRequest({ id: 1, kind: 'ping' })).toBe(false);
    expect(isAIWorkerRequest({ id: 'a', kind: 42 })).toBe(false);
  });
  it('load-model requires modelId', () => {
    expect(isAIWorkerRequest({ id: 'a', kind: 'load-model' })).toBe(false);
    expect(isAIWorkerRequest({ id: 'a', kind: 'load-model', modelId: 'm1' })).toBe(true);
  });
  it('extract requires modelId + pdfText + reference + columns', () => {
    expect(isAIWorkerRequest({
      id: 'a', kind: 'extract', modelId: 'm', pdfText: '', reference: {}, columns: ['purpose']
    })).toBe(true);
    expect(isAIWorkerRequest({ id: 'a', kind: 'extract' })).toBe(false);
    expect(isAIWorkerRequest({
      id: 'a', kind: 'extract', modelId: 'm', pdfText: '', reference: {}
    })).toBe(false);  // missing columns
  });
  it('cancel requires targetId', () => {
    expect(isAIWorkerRequest({ id: 'a', kind: 'cancel' })).toBe(false);
    expect(isAIWorkerRequest({ id: 'a', kind: 'cancel', targetId: 't' })).toBe(true);
  });
  it('rejects unknown kinds', () => {
    expect(isAIWorkerRequest({ id: 'a', kind: 'mystery' })).toBe(false);
  });
  it('rejects non-objects', () => {
    expect(isAIWorkerRequest(null)).toBe(false);
    expect(isAIWorkerRequest('string')).toBe(false);
    expect(isAIWorkerRequest(42)).toBe(false);
  });
});

// ─── isAIWorkerResponse ───────────────────────────────────────────────────

describe('isAIWorkerResponse', () => {
  it('accepts simple kinds', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'pong' })).toBe(true);
    expect(isAIWorkerResponse({ id: 'a', kind: 'cancelled' })).toBe(true);
  });
  it('backend requires backend field', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'backend' })).toBe(false);
    expect(isAIWorkerResponse({ id: 'a', kind: 'backend', backend: 'webgpu' })).toBe(true);
  });
  it('model-loaded requires modelId', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'model-loaded' })).toBe(false);
    expect(isAIWorkerResponse({ id: 'a', kind: 'model-loaded', modelId: 'x' })).toBe(true);
  });
  it('download-progress requires modelId + numbers', () => {
    expect(isAIWorkerResponse({
      id: 'a', kind: 'download-progress', modelId: 'm', receivedBytes: 100, totalBytes: 200
    })).toBe(true);
    expect(isAIWorkerResponse({
      id: 'a', kind: 'download-progress', modelId: 'm', receivedBytes: '100', totalBytes: 200
    })).toBe(false);
  });
  it('extract-result requires candidates array', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'extract-result' })).toBe(false);
    expect(isAIWorkerResponse({ id: 'a', kind: 'extract-result', candidates: [] })).toBe(true);
  });
  it('error requires message string', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'error' })).toBe(false);
    expect(isAIWorkerResponse({ id: 'a', kind: 'error', message: 'boom' })).toBe(true);
  });
  it('rejects unknown kinds + non-objects', () => {
    expect(isAIWorkerResponse({ id: 'a', kind: 'mystery' })).toBe(false);
    expect(isAIWorkerResponse(null)).toBe(false);
    expect(isAIWorkerResponse('x')).toBe(false);
  });
});
