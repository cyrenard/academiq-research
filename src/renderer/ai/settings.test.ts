import { describe, it, expect } from 'vitest';
import {
  AI_MODEL_CATALOG,
  DEFAULT_MODEL_ID,
  defaultAISettings,
  sanitizeAISettings,
  getModelDescriptor,
  formatBytes
} from './settings';

// ─── AI_MODEL_CATALOG ────────────────────────────────────────────────────

describe('AI_MODEL_CATALOG', () => {
  it('has at least the small/medium/large sizes', () => {
    const sizes = AI_MODEL_CATALOG.map((m) => m.size);
    expect(sizes).toContain('small');
    expect(sizes).toContain('medium');
    expect(sizes).toContain('large');
  });

  it('all entries are Apache 2.0 or MIT (telifsiz)', () => {
    AI_MODEL_CATALOG.forEach((m) => {
      expect(['Apache 2.0', 'MIT']).toContain(m.license);
    });
  });

  it('default model id exists in catalog', () => {
    expect(AI_MODEL_CATALOG.some((m) => m.id === DEFAULT_MODEL_ID)).toBe(true);
  });

  it('default is the medium-sized Qwen 2.5 3B', () => {
    const def = AI_MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(def?.size).toBe('medium');
    expect(def?.displayName).toMatch(/3B/);
  });
});

// ─── defaultAISettings ───────────────────────────────────────────────────

describe('defaultAISettings', () => {
  it('starts disabled', () => {
    expect(defaultAISettings().enabled).toBe(false);
  });

  it('uses the default model id', () => {
    expect(defaultAISettings().modelId).toBe(DEFAULT_MODEL_ID);
  });

  it('all 5 columns enabled by default', () => {
    const s = defaultAISettings();
    expect(s.columns.purpose).toBe(true);
    expect(s.columns.method).toBe(true);
    expect(s.columns.sample).toBe(true);
    expect(s.columns.findings).toBe(true);
    expect(s.columns.limitations).toBe(true);
  });

  it('safety guards on by default', () => {
    const s = defaultAISettings();
    expect(s.idleOnly).toBe(true);
    expect(s.pauseOnBattery).toBe(true);
    expect(s.pauseOnHighCpu).toBe(true);
    expect(s.highConfidenceOnly).toBe(true);
  });
});

// ─── sanitizeAISettings ──────────────────────────────────────────────────

describe('sanitizeAISettings', () => {
  it('returns defaults for null/undefined/non-object', () => {
    expect(sanitizeAISettings(null)).toEqual(defaultAISettings());
    expect(sanitizeAISettings(undefined)).toEqual(defaultAISettings());
    expect(sanitizeAISettings(42)).toEqual(defaultAISettings());
    expect(sanitizeAISettings('x')).toEqual(defaultAISettings());
  });

  it('keeps a known model id', () => {
    const s = sanitizeAISettings({ modelId: 'onnx-community/Qwen2.5-1.5B-Instruct' });
    expect(s.modelId).toBe('onnx-community/Qwen2.5-1.5B-Instruct');
  });

  it('falls back to default for unknown model id', () => {
    const s = sanitizeAISettings({ modelId: 'evil/SomeUnknownModel' });
    expect(s.modelId).toBe(DEFAULT_MODEL_ID);
  });

  it('preserves valid column toggles', () => {
    const s = sanitizeAISettings({ columns: { purpose: false, findings: true } });
    expect(s.columns.purpose).toBe(false);
    expect(s.columns.findings).toBe(true);
    // Unset columns inherit defaults (true)
    expect(s.columns.method).toBe(true);
  });

  it('drops non-boolean column values', () => {
    const s = sanitizeAISettings({ columns: { purpose: 'yes', method: 1 } });
    expect(s.columns.purpose).toBe(true);   // default fallback
    expect(s.columns.method).toBe(true);    // default fallback
  });

  it('safety toggles default to ON when not specified', () => {
    const s = sanitizeAISettings({});
    expect(s.idleOnly).toBe(true);
    expect(s.pauseOnBattery).toBe(true);
    expect(s.highConfidenceOnly).toBe(true);
  });

  it('respects explicit false on safety toggles', () => {
    const s = sanitizeAISettings({
      idleOnly: false,
      pauseOnBattery: false,
      pauseOnHighCpu: false,
      highConfidenceOnly: false
    });
    expect(s.idleOnly).toBe(false);
    expect(s.pauseOnBattery).toBe(false);
    expect(s.pauseOnHighCpu).toBe(false);
    expect(s.highConfidenceOnly).toBe(false);
  });

  it('only treats enabled=true (boolean) as enabled', () => {
    expect(sanitizeAISettings({ enabled: true }).enabled).toBe(true);
    expect(sanitizeAISettings({ enabled: 1 }).enabled).toBe(false);
    expect(sanitizeAISettings({ enabled: 'yes' }).enabled).toBe(false);
  });

  it('keeps positive installedAt timestamp; zeroes invalid', () => {
    expect(sanitizeAISettings({ installedAt: 12345 }).installedAt).toBe(12345);
    expect(sanitizeAISettings({ installedAt: -5 }).installedAt).toBe(0);
    expect(sanitizeAISettings({ installedAt: '12345' }).installedAt).toBe(0);
  });
});

// ─── getModelDescriptor ──────────────────────────────────────────────────

describe('getModelDescriptor', () => {
  it('returns descriptor for catalog id', () => {
    const d = getModelDescriptor(DEFAULT_MODEL_ID);
    expect(d).not.toBeNull();
    expect(d!.id).toBe(DEFAULT_MODEL_ID);
  });
  it('returns null for unknown id', () => {
    expect(getModelDescriptor('evil/X')).toBeNull();
  });
});

// ─── formatBytes ─────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes / KB / MB / GB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});
