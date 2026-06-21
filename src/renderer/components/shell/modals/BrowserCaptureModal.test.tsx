import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserCaptureModal } from './BrowserCaptureModal';

let originalElectronAPI: any;

beforeEach(() => {
  originalElectronAPI = (window as any).electronAPI;
  (window as any).electronAPI = {
    getBrowserCaptureStatus: vi.fn(async () => ({ ok: true, lifecycleState: 'ready' })),
    prepareBrowserCaptureSetup: vi.fn(async (_browserFamily?: string) => ({ ok: true, installDir: 'C:/capture', guidePath: 'C:/capture/README.md' })),
    runBrowserCaptureAction: vi.fn(async (_action: string, _browserFamily?: string) => ({ ok: true })),
    openBrowserCaptureInstallDir: vi.fn(async () => ({ ok: true })),
    openBrowserCaptureGuide: vi.fn(async () => ({ ok: true })),
    testBrowserCaptureConnection: vi.fn(async () => ({ ok: true, lifecycleState: 'ready', port: 27183 })),
    updateBrowserCapturePrefs: vi.fn(async (prefs) => ({ ok: true, ...prefs }))
  };
});

afterEach(() => {
  (window as any).electronAPI = originalElectronAPI;
});

describe('BrowserCaptureModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <BrowserCaptureModal open={false} onClose={() => {}} onStatus={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('fetches status on open', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    await waitFor(() => {
      expect((window as any).electronAPI.getBrowserCaptureStatus).toHaveBeenCalledTimes(1);
    });
  });

  it('reports IPC failure via onStatus on initial fetch', async () => {
    (window as any).electronAPI.getBrowserCaptureStatus = vi.fn(async () => { throw new Error('boom'); });
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Capture durumu alınamadı: boom');
    });
  });

  it('renders all capture action buttons', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    expect(screen.getByRole('button', { name: 'Kurulumu hazırla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kurulum klasörünü aç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rehberi aç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bağlantıyı test et' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture aktif et' })).toBeInTheDocument();
  });

  it('"Kurulumu hazırla" prepares setup and opens files', async () => {
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kurulumu hazırla' }));
    await waitFor(() => {
      expect((window as any).electronAPI.prepareBrowserCaptureSetup).toHaveBeenCalledWith('chromium');
      expect((window as any).electronAPI.openBrowserCaptureInstallDir).toHaveBeenCalledWith('chromium');
      expect((window as any).electronAPI.openBrowserCaptureGuide).toHaveBeenCalledWith('chromium');
      expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Capture kurulumu hazirlandi'));
    });
  });

  it('"Kurulumu hazırla" does not require runBrowserCaptureAction', async () => {
    delete (window as any).electronAPI.runBrowserCaptureAction;
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kurulumu hazırla' }));
    await waitFor(() => {
      expect((window as any).electronAPI.prepareBrowserCaptureSetup).toHaveBeenCalledWith('chromium');
      expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Capture kurulumu hazirlandi'));
    });
  });

  it('"Bağlantıyı test et" updates rendered status', async () => {
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Bağlantıyı test et' }));
    await waitFor(() => {
      expect((window as any).electronAPI.testBrowserCaptureConnection).toHaveBeenCalled();
      expect(onStatus).toHaveBeenCalledWith('Capture test edildi');
    });
    await waitFor(() => {
      const pre = document.querySelector('pre');
      expect(pre?.textContent).toContain('27183');
    });
  });

  it('"Capture aktif et" enables capture and remembers setup prompt state', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Capture aktif et' }));
    await waitFor(() => {
      expect((window as any).electronAPI.updateBrowserCapturePrefs).toHaveBeenCalledWith({
        enabled: true,
        setupPromptSeen: true,
        browserFamily: 'chromium'
      });
      expect((window as any).electronAPI.runBrowserCaptureAction).toHaveBeenCalledWith('install', 'chromium');
    });
  });

  it('renders status JSON in <pre>', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    await waitFor(() => {
      const pre = document.querySelector('pre');
      expect(pre).not.toBeNull();
      expect(pre?.textContent).toContain('lifecycleState');
    });
  });
});
