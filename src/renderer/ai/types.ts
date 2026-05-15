/**
 * AI Matrix Worker — shared types
 *
 * The model worker (separate Web Worker thread) runs transformers.js
 * with a small instruct LLM (Qwen 2.5 3B by default) + an embedding
 * model for RAG retrieval. It produces candidate cell values for the
 * literature matrix from PDF text.
 *
 * Strict isolation contract:
 *   - Worker has NO access to window.S, document, electronAPI, editor.
 *   - Worker reads PDF text + reference metadata as inputs only.
 *   - Worker writes output ONLY through the message protocol below.
 *   - The renderer-side bridge translates worker output into entries
 *     for the existing local-matrix-assistant rank/compose pipeline.
 *
 * Hallucination defenses (enforced in worker):
 *   1. RAG: top-K relevant PDF chunks via embedding similarity
 *   2. Grounded prompt with strict "extract from source only" rule
 *   3. Quote-then-answer pattern (model emits evidence quote first)
 *   4. Quote validation: if quote not in source text → discard
 *   5. Schema validation per cell type
 *   6. Self-verify pass (only on low-confidence outputs)
 *   7. Confidence threshold: only `high` shown to user (low logged + dropped)
 */

/** Matrix columns the assistant supports. */
export type MatrixColumnKey =
  | 'purpose'
  | 'method'
  | 'sample'
  | 'findings'
  | 'limitations';

/** WebGPU detection result, surfaced to Settings. */
export type AIBackendType = 'webgpu' | 'wasm' | 'unsupported';

/** Available model sizes. Default is 'medium' (Qwen 2.5 3B). */
export type AIModelSize = 'small' | 'medium' | 'large';

export interface AIModelInfo {
  id: string;                     // e.g. 'onnx-community/Qwen2.5-3B-Instruct-q4f16'
  size: AIModelSize;
  displayName: string;             // e.g. 'Qwen 2.5 3B (Dengeli)'
  bytes: number;                   // approximate download size
  ramRequiredBytes: number;        // approximate runtime RAM footprint
  license: string;                 // 'Apache 2.0' / 'MIT' / etc.
  /** True when ANY part of this model is missing from local cache. */
  needsDownload: boolean;
}

export type AIInstallStatus =
  | { kind: 'idle' }
  | { kind: 'downloading'; receivedBytes: number; totalBytes: number; modelId: string }
  | { kind: 'verifying'; modelId: string }
  | { kind: 'warming-up'; modelId: string }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

export interface AICandidate {
  /** Always set to 'model' for worker outputs (vs 'rule-guard'). */
  source: 'model' | 'rule-guard';
  column: MatrixColumnKey;
  value: string;
  /** Model's own confidence score in [0, 1]. */
  confidence: number;
  /** Required: literal source quote (for hallucination guard 3+4). */
  evidenceQuote: string;
  /** Optional: page number when chunk is page-tagged. */
  page?: string;
  /** Generation metadata. */
  modelId: string;
  generatedAt: number;
}

/**
 * The cancellation token signals the worker to abort the current
 * inference. Workers check this between tokens; abort time ≤ 100ms.
 */
export interface AICancelToken {
  cancelled: boolean;
}

// ─── Worker message protocol ────────────────────────────────────────────────

export type AIWorkerRequest =
  | { id: string; kind: 'detect-backend' }
  | { id: string; kind: 'load-model'; modelId: string }
  | { id: string; kind: 'unload-model' }
  | {
      id: string;
      kind: 'extract';
      modelId: string;
      pdfText: string;
      reference: { id: string; title: string; year?: string; doi?: string };
      columns: MatrixColumnKey[];
    }
  | { id: string; kind: 'cancel'; targetId: string }
  | { id: string; kind: 'ping' };

export type AIWorkerResponse =
  | { id: string; kind: 'backend'; backend: AIBackendType }
  | { id: string; kind: 'model-loaded'; modelId: string; backend: AIBackendType }
  | {
      id: string;
      kind: 'download-progress';
      modelId: string;
      receivedBytes: number;
      totalBytes: number;
    }
  | { id: string; kind: 'extract-result'; candidates: AICandidate[] }
  | { id: string; kind: 'cancelled' }
  | { id: string; kind: 'pong' }
  | { id: string; kind: 'error'; message: string; code?: string };
