import { useMemo } from 'react';
import {
  AI_MODEL_CATALOG,
  defaultAISettings,
  formatBytes,
  type AISettings
} from '../../../ai/settings';
import type { MatrixColumnKey } from '../../../ai/types';

type AISettingsPanelProps = {
  /** Current settings (may be undefined if state hasn't been hydrated). */
  value: AISettings | undefined;
  /** Patch to apply to settings. Caller is responsible for persisting. */
  onChange: (patch: Partial<AISettings>) => void;
  /**
   * Optional install state — used to render progress / errors when the
   * model is being downloaded. The runtime emits these.
   */
  installStatus?:
    | { kind: 'idle' }
    | { kind: 'downloading'; receivedBytes: number; totalBytes: number; modelId: string }
    | { kind: 'verifying'; modelId: string }
    | { kind: 'warming-up'; modelId: string }
    | { kind: 'ready' }
    | { kind: 'error'; message: string };
};

const COLUMN_LABELS: Record<MatrixColumnKey, string> = {
  purpose: 'Amaç',
  method: 'Yöntem',
  sample: 'Örneklem',
  findings: 'Bulgular',
  limitations: 'Sınırlılıklar'
};

/**
 * AI matrix worker settings panel — model selection, master toggle,
 * per-column toggles, runtime safety guards, install progress.
 *
 * Pure component: no IPC, no electronAPI. Parent is responsible for
 * persisting `onChange` patches via saveData and for surfacing the
 * runtime install status.
 */
export function AISettingsPanel({ value, onChange, installStatus }: AISettingsPanelProps) {
  const settings: AISettings = useMemo(
    () => value || defaultAISettings(),
    [value]
  );

  const activeModel = AI_MODEL_CATALOG.find((m) => m.id === settings.modelId);
  const showProgress = installStatus && installStatus.kind === 'downloading';
  const progressPct = showProgress
    ? Math.min(100, Math.round((installStatus.receivedBytes / installStatus.totalBytes) * 100))
    : 0;

  return (
    <section className="space-y-4 text-sm" data-testid="ai-settings-panel">
      <header className="flex items-start justify-between gap-3 rounded-lg border border-aq-line bg-aq-paper p-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">
            🧠 AI Matrix Yardımcısı
          </div>
          <h3 className="mt-1 text-base font-semibold text-aq-ink">
            {settings.enabled ? 'Etkin' : 'Devre dışı'}
          </h3>
          <p className="mt-1 text-xs text-aq-muted">
            Tamamen yerel çalışır. İnternet, API key veya hesap gerekmez. Apache 2.0 lisanslı modeller.
          </p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-aq-navy"
            data-testid="ai-master-toggle"
          />
          {settings.enabled ? 'Açık' : 'Kapalı'}
        </label>
      </header>

      {showProgress ? (
        <div className="rounded-lg border border-aq-line bg-white p-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold">Model indiriliyor</span>
            <span className="text-aq-muted">
              {formatBytes(installStatus.receivedBytes)} / {formatBytes(installStatus.totalBytes)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-aq-panel">
            <div
              className="h-full rounded-full bg-aq-navy transition-[width]"
              style={{ width: `${progressPct}%` }}
              data-testid="ai-progress-bar"
            />
          </div>
        </div>
      ) : null}

      {installStatus?.kind === 'error' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800" data-testid="ai-error-banner">
          <b>AI kurulumu başarısız:</b> {installStatus.message}
        </div>
      ) : null}

      {/* Model selection */}
      <fieldset className="space-y-2 rounded-lg border border-aq-line bg-aq-paper p-3" disabled={!settings.enabled}>
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">
          Model
        </legend>
        {AI_MODEL_CATALOG.map((model) => (
          <label
            key={model.id}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-md border p-2 transition',
              settings.modelId === model.id
                ? 'border-aq-navy bg-white shadow-sm'
                : 'border-transparent hover:border-aq-line hover:bg-white'
            ].join(' ')}
          >
            <input
              type="radio"
              name="ai-model"
              value={model.id}
              checked={settings.modelId === model.id}
              onChange={() => onChange({ modelId: model.id })}
              className="mt-0.5 cursor-pointer accent-aq-navy"
              data-testid={`ai-model-${model.size}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-aq-ink">{model.displayName}</span>
              <span className="mt-0.5 block text-[11px] text-aq-muted">
                {formatBytes(model.approxDownloadBytes)} indirme · ~{formatBytes(model.approxRamBytes)} RAM · {model.license}
              </span>
            </span>
          </label>
        ))}
        {activeModel ? (
          <p className="pt-1 text-[11px] text-aq-muted">
            Aktif: <b>{activeModel.displayName}</b>
          </p>
        ) : null}
      </fieldset>

      {/* Per-column toggles */}
      <fieldset className="space-y-1.5 rounded-lg border border-aq-line bg-aq-paper p-3" disabled={!settings.enabled}>
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">
          Hangi sütunlar doldurulsun
        </legend>
        {(Object.keys(settings.columns) as MatrixColumnKey[]).map((key) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-white">
            <input
              type="checkbox"
              checked={settings.columns[key]}
              onChange={(e) =>
                onChange({
                  columns: { ...settings.columns, [key]: e.target.checked }
                })
              }
              className="h-4 w-4 cursor-pointer accent-aq-navy"
              data-testid={`ai-column-${key}`}
            />
            <span className="text-sm text-aq-ink">{COLUMN_LABELS[key]}</span>
          </label>
        ))}
      </fieldset>

      {/* Runtime safety guards */}
      <fieldset className="space-y-1.5 rounded-lg border border-aq-line bg-aq-paper p-3" disabled={!settings.enabled}>
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">
          Çalışma kuralları
        </legend>
        <SafetyToggle
          label="Sadece bilgisayar boştayken çalış"
          checked={settings.idleOnly}
          onChange={(checked) => onChange({ idleOnly: checked })}
          testId="ai-idle-only"
        />
        <SafetyToggle
          label="Pil < %20 + şarjda değilken durdur"
          checked={settings.pauseOnBattery}
          onChange={(checked) => onChange({ pauseOnBattery: checked })}
          testId="ai-pause-battery"
        />
        <SafetyToggle
          label="CPU > %50 olunca duraklat"
          checked={settings.pauseOnHighCpu}
          onChange={(checked) => onChange({ pauseOnHighCpu: checked })}
          testId="ai-pause-cpu"
        />
        <SafetyToggle
          label="Sadece yüksek güvenli önerileri göster"
          checked={settings.highConfidenceOnly}
          onChange={(checked) => onChange({ highConfidenceOnly: checked })}
          testId="ai-high-confidence"
        />
      </fieldset>

      {settings.enabled && settings.installedAt > 0 ? (
        <p className="text-[11px] text-aq-muted" data-testid="ai-installed-at">
          Kurulum tamam — {new Date(settings.installedAt).toLocaleString('tr-TR')}
        </p>
      ) : null}
    </section>
  );
}

function SafetyToggle({
  label,
  checked,
  onChange,
  testId
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md p-1.5 hover:bg-white">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-aq-navy"
        data-testid={testId}
      />
      <span className="text-sm text-aq-ink">{label}</span>
    </label>
  );
}
