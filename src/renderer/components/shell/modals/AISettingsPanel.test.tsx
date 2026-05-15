import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AISettingsPanel } from './AISettingsPanel';
import { defaultAISettings, AI_MODEL_CATALOG, type AISettings } from '../../../ai/settings';

function renderPanel(overrides: Partial<AISettings> = {}, onChange = vi.fn()) {
  const value: AISettings = { ...defaultAISettings(), ...overrides };
  const utils = render(<AISettingsPanel value={value} onChange={onChange} />);
  return { ...utils, onChange };
}

// ─── Initial render ──────────────────────────────────────────────────────

describe('AISettingsPanel — initial render', () => {
  it('shows "Devre dışı" when disabled', () => {
    renderPanel({ enabled: false });
    expect(screen.getByText('Devre dışı')).toBeInTheDocument();
  });

  it('shows "Etkin" when enabled', () => {
    renderPanel({ enabled: true });
    expect(screen.getByText('Etkin')).toBeInTheDocument();
  });

  it('renders all 3 model options', () => {
    renderPanel();
    expect(screen.getByTestId('ai-model-small')).toBeInTheDocument();
    expect(screen.getByTestId('ai-model-medium')).toBeInTheDocument();
    expect(screen.getByTestId('ai-model-large')).toBeInTheDocument();
  });

  it('renders all 5 column toggles', () => {
    renderPanel();
    expect(screen.getByLabelText('Amaç')).toBeInTheDocument();
    expect(screen.getByLabelText('Yöntem')).toBeInTheDocument();
    expect(screen.getByLabelText('Örneklem')).toBeInTheDocument();
    expect(screen.getByLabelText('Bulgular')).toBeInTheDocument();
    expect(screen.getByLabelText('Sınırlılıklar')).toBeInTheDocument();
  });

  it('renders all 4 safety toggles', () => {
    renderPanel();
    expect(screen.getByTestId('ai-idle-only')).toBeInTheDocument();
    expect(screen.getByTestId('ai-pause-battery')).toBeInTheDocument();
    expect(screen.getByTestId('ai-pause-cpu')).toBeInTheDocument();
    expect(screen.getByTestId('ai-high-confidence')).toBeInTheDocument();
  });

  it('disables fieldsets when AI is off', () => {
    renderPanel({ enabled: false });
    const mediumRadio = screen.getByTestId('ai-model-medium') as HTMLInputElement;
    // jsdom doesn't propagate <fieldset disabled> to descendants, so check the parent
    const fieldset = mediumRadio.closest('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(true);
  });

  it('enables fieldsets when AI is on', () => {
    renderPanel({ enabled: true });
    const mediumRadio = screen.getByTestId('ai-model-medium') as HTMLInputElement;
    const fieldset = mediumRadio.closest('fieldset') as HTMLFieldSetElement;
    expect(fieldset.disabled).toBe(false);
  });

  it('falls back to defaults when value is undefined', () => {
    render(<AISettingsPanel value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText('Devre dışı')).toBeInTheDocument();
    const defaultRadio = screen.getByTestId('ai-model-medium') as HTMLInputElement;
    expect(defaultRadio.checked).toBe(true);
  });
});

// ─── Master toggle ───────────────────────────────────────────────────────

describe('AISettingsPanel — master toggle', () => {
  it('emits enabled patch when toggled', async () => {
    const { onChange } = renderPanel({ enabled: false });
    await userEvent.click(screen.getByTestId('ai-master-toggle'));
    expect(onChange).toHaveBeenCalledWith({ enabled: true });
  });

  it('emits enabled:false when turning off', async () => {
    const { onChange } = renderPanel({ enabled: true });
    await userEvent.click(screen.getByTestId('ai-master-toggle'));
    expect(onChange).toHaveBeenCalledWith({ enabled: false });
  });
});

// ─── Model selection ─────────────────────────────────────────────────────

describe('AISettingsPanel — model selection', () => {
  it('emits modelId patch when a different model is picked', async () => {
    const { onChange } = renderPanel({ enabled: true, modelId: 'onnx-community/Qwen2.5-3B-Instruct' });
    await userEvent.click(screen.getByTestId('ai-model-small'));
    expect(onChange).toHaveBeenCalledWith({
      modelId: 'onnx-community/Qwen2.5-1.5B-Instruct'
    });
  });

  it('shows the active model in the footer hint', () => {
    renderPanel({ enabled: true, modelId: 'onnx-community/Qwen2.5-3B-Instruct' });
    // "Aktif: Qwen 2.5 3B (Dengeli)" appears below the radios
    expect(screen.getByText(/^Aktif:/)).toBeInTheDocument();
  });
});

// ─── Per-column toggles ──────────────────────────────────────────────────

describe('AISettingsPanel — per-column toggles', () => {
  it('emits column patch with single key change', async () => {
    const { onChange } = renderPanel({ enabled: true });
    await userEvent.click(screen.getByTestId('ai-column-purpose'));
    const call = (onChange.mock.calls[0]?.[0] as Partial<AISettings>) || {};
    expect(call.columns?.purpose).toBe(false);
    expect(call.columns?.method).toBe(true);
  });

  it('reflects current column toggle state', () => {
    renderPanel({
      enabled: true,
      columns: { purpose: false, method: true, sample: true, findings: false, limitations: true }
    });
    expect((screen.getByTestId('ai-column-purpose') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('ai-column-findings') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId('ai-column-method') as HTMLInputElement).checked).toBe(true);
  });
});

// ─── Safety toggles ──────────────────────────────────────────────────────

describe('AISettingsPanel — safety toggles', () => {
  it('emits idleOnly patch', async () => {
    const { onChange } = renderPanel({ enabled: true, idleOnly: true });
    await userEvent.click(screen.getByTestId('ai-idle-only'));
    expect(onChange).toHaveBeenCalledWith({ idleOnly: false });
  });

  it('emits pauseOnBattery patch', async () => {
    const { onChange } = renderPanel({ enabled: true, pauseOnBattery: true });
    await userEvent.click(screen.getByTestId('ai-pause-battery'));
    expect(onChange).toHaveBeenCalledWith({ pauseOnBattery: false });
  });

  it('emits pauseOnHighCpu patch', async () => {
    const { onChange } = renderPanel({ enabled: true, pauseOnHighCpu: true });
    await userEvent.click(screen.getByTestId('ai-pause-cpu'));
    expect(onChange).toHaveBeenCalledWith({ pauseOnHighCpu: false });
  });

  it('emits highConfidenceOnly patch', async () => {
    const { onChange } = renderPanel({ enabled: true, highConfidenceOnly: true });
    await userEvent.click(screen.getByTestId('ai-high-confidence'));
    expect(onChange).toHaveBeenCalledWith({ highConfidenceOnly: false });
  });
});

// ─── Install status display ──────────────────────────────────────────────

describe('AISettingsPanel — install status', () => {
  it('renders progress bar when downloading', () => {
    render(
      <AISettingsPanel
        value={{ ...defaultAISettings(), enabled: true }}
        onChange={vi.fn()}
        installStatus={{
          kind: 'downloading',
          modelId: 'onnx-community/Qwen2.5-3B-Instruct',
          receivedBytes: 500_000_000,
          totalBytes: 2_000_000_000
        }}
      />
    );
    const bar = screen.getByTestId('ai-progress-bar') as HTMLElement;
    // 500/2000 = 25%
    expect(bar.style.width).toBe('25%');
    // formatBytes uses GiB-style divisor; 2_000_000_000 = 1.9 GB.
    // (Multiple matches OK — appears in both the catalog row and progress text.)
    expect(screen.getAllByText(/1\.9 GB/).length).toBeGreaterThan(0);
  });

  it('renders error banner when install failed', () => {
    render(
      <AISettingsPanel
        value={{ ...defaultAISettings(), enabled: true }}
        onChange={vi.fn()}
        installStatus={{ kind: 'error', message: 'Disk full' }}
      />
    );
    const banner = screen.getByTestId('ai-error-banner');
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain('Disk full');
  });

  it('shows installedAt when set', () => {
    const installedAt = new Date(2024, 5, 15, 10, 30).getTime();
    render(
      <AISettingsPanel
        value={{ ...defaultAISettings(), enabled: true, installedAt }}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('ai-installed-at')).toBeInTheDocument();
  });

  it('hides installedAt when zero', () => {
    render(
      <AISettingsPanel
        value={{ ...defaultAISettings(), enabled: true, installedAt: 0 }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByTestId('ai-installed-at')).not.toBeInTheDocument();
  });

  it('does not render progress bar when idle', () => {
    render(
      <AISettingsPanel
        value={{ ...defaultAISettings(), enabled: true }}
        onChange={vi.fn()}
        installStatus={{ kind: 'idle' }}
      />
    );
    expect(screen.queryByTestId('ai-progress-bar')).not.toBeInTheDocument();
  });
});
