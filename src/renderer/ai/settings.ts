/**
 * AI Settings — model selection, install state, runtime preferences.
 *
 * This is the renderer-facing settings slice for the model worker.
 * Persistence layer is the same one used by other settings (electronAPI
 * via app-state); this module only handles the in-memory shape +
 * defaults + sanitization.
 *
 * Kept separate from `localMatrixAssistant` (the rule-guard layer's
 * settings) because the model worker has its own lifecycle, install
 * state, and bigger storage footprint.
 */
import type { AIModelSize, MatrixColumnKey } from './types';

export interface AIModelDescriptor {
  id: string;
  size: AIModelSize;
  displayName: string;
  approxDownloadBytes: number;
  approxRamBytes: number;
  license: 'Apache 2.0' | 'MIT';
}

/**
 * Curated allow-list of models the app can use. All Apache-2.0 / MIT.
 * Adding a new entry here is the single point to expose a new model
 * to users.
 */
export const AI_MODEL_CATALOG: ReadonlyArray<AIModelDescriptor> = [
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    size: 'small',
    displayName: 'Qwen 2.5 1.5B (Hızlı)',
    approxDownloadBytes: 1_000_000_000,
    approxRamBytes: 1_500_000_000,
    license: 'Apache 2.0'
  },
  {
    id: 'onnx-community/Qwen2.5-3B-Instruct',
    size: 'medium',
    displayName: 'Qwen 2.5 3B (Dengeli)',
    approxDownloadBytes: 2_000_000_000,
    approxRamBytes: 2_500_000_000,
    license: 'Apache 2.0'
  },
  {
    id: 'onnx-community/Qwen2.5-7B-Instruct',
    size: 'large',
    displayName: 'Qwen 2.5 7B (Yüksek)',
    approxDownloadBytes: 5_000_000_000,
    approxRamBytes: 6_000_000_000,
    license: 'Apache 2.0'
  }
];

export const DEFAULT_MODEL_ID = 'onnx-community/Qwen2.5-3B-Instruct';

export interface AISettings {
  /** Master toggle. When false, the worker is never spawned. */
  enabled: boolean;
  /** Selected model id; must be in AI_MODEL_CATALOG. */
  modelId: string;
  /** Per-column toggles — narrow which cells the AI fills. */
  columns: Record<MatrixColumnKey, boolean>;
  /** Idle scheduling preferences (suggestions; worker honors them). */
  idleOnly: boolean;
  /** Pause when laptop battery < 20% and not charging. */
  pauseOnBattery: boolean;
  /** Pause when host CPU > 50%. */
  pauseOnHighCpu: boolean;
  /** Show only suggestions with `confidence: 'high'`. Always on by default. */
  highConfidenceOnly: boolean;
  /** Last successful install timestamp (Date.now()). */
  installedAt: number;
}

export function defaultAISettings(): AISettings {
  return {
    enabled: false,
    modelId: DEFAULT_MODEL_ID,
    columns: {
      purpose: true,
      method: true,
      sample: true,
      findings: true,
      limitations: true
    },
    idleOnly: true,
    pauseOnBattery: true,
    pauseOnHighCpu: true,
    highConfidenceOnly: true,
    installedAt: 0
  };
}

/**
 * Sanitize a possibly-malformed settings object — used when hydrating
 * from disk. Always returns a complete, valid AISettings.
 */
export function sanitizeAISettings(raw: unknown): AISettings {
  const fallback = defaultAISettings();
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<AISettings> & { columns?: Partial<Record<MatrixColumnKey, unknown>> };
  const modelId = typeof r.modelId === 'string' && AI_MODEL_CATALOG.some((m) => m.id === r.modelId)
    ? r.modelId
    : fallback.modelId;
  const columns: Record<MatrixColumnKey, boolean> = { ...fallback.columns };
  if (r.columns && typeof r.columns === 'object') {
    (Object.keys(fallback.columns) as MatrixColumnKey[]).forEach((key) => {
      if (typeof r.columns![key] === 'boolean') columns[key] = r.columns![key] as boolean;
    });
  }
  return {
    enabled: r.enabled === true,
    modelId,
    columns,
    idleOnly: r.idleOnly !== false,
    pauseOnBattery: r.pauseOnBattery !== false,
    pauseOnHighCpu: r.pauseOnHighCpu !== false,
    highConfidenceOnly: r.highConfidenceOnly !== false,
    installedAt: typeof r.installedAt === 'number' && r.installedAt > 0 ? r.installedAt : 0
  };
}

/** Look up a model descriptor by id. Returns null if not in catalog. */
export function getModelDescriptor(id: string): AIModelDescriptor | null {
  return AI_MODEL_CATALOG.find((m) => m.id === id) || null;
}

/** Format a byte count as "1.2 GB" / "850 MB" / "12 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
