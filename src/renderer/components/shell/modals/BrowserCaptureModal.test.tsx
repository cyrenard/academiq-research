import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserCaptureModal } from './BrowserCaptureModal';

const ipcCalls: { fn: string; args: any[] }[] = [];
let originalElectronAPI: any;

beforeEach(() => {
  ipcCalls.length = 0;
  originalElectronAPI = (window as any).electronAPI;
  // Override the test-setup stub with vi-trackable mocks
  (window as any).electronAPI = {
    getBrowserCaptureStatus: vi.fn(async () => {
      ipcCalls.push({ fn: 'getBrowserCaptureStatus', args: [] });
      return { ok: true, lifecycleState: 'ready' };
    }),
    prepareBrowserCaptureSetup: vi.fn(async () => { ipcCalls.push({ fn: 'prepare', args: [] }); return { ok: true }; }),
    openBrowserCaptureInstallDir: vi.fn(async () => { ipcCalls.push({ fn: 'openInstallDir', args: [] }); return { ok: true }; }),
    openBrowserCaptureGuide: vi.fn(async () => { ipcCalls.push({ fn: 'openGuide', args: [] }); return { ok: true }; }),
    testBrowserCaptureConnection: vi.fn(async () => { ipcCalls.push({ fn: 'test', args: [] }); return { ok: true, lifecycleState: 'ready', port: 27183 }; }),
    updateBrowserCapturePrefs: vi.fn(async (prefs) => { ipcCalls.push({ fn: 'updatePrefs', args: [prefs] }); return { ok: true, ...prefs }; }),
    clearInstitutionalAccessSession: vi.fn(async () => { ipcCalls.push({ fn: 'clearInst', args: [] }); return { ok: true }; })
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
      expect(onStatus).toHaveBeenCalledWith('Capture durumu alınamadı');
    });
  });

  it('renders all 6 action buttons', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    expect(screen.getByRole('button', { name: 'Kurulumu hazırla' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kurulum klasörünü aç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rehberi aç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bağlantıyı test et' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Capture aktif et' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kurumsal oturumu temizle' })).toBeInTheDocument();
  });

  it('"Kurulumu hazırla" calls prepareBrowserCaptureSetup + reports success', async () => {
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kurulumu hazırla' }));
    await waitFor(() => {
      expect((window as any).electronAPI.prepareBrowserCaptureSetup).toHaveBeenCalled();
      expect(onStatus).toHaveBeenCalledWith('Capture kurulumu hazırlandı');
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
    // The pre block JSON includes the new test result
    await waitFor(() => {
      const pre = document.querySelector('pre');
      expect(pre?.textContent).toContain('27183');
    });
  });

  it('"Capture aktif et" sends prefs patch with enabled:true', async () => {
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Capture aktif et' }));
    await waitFor(() => {
      const call = ((window as any).electronAPI.updateBrowserCapturePrefs as any).mock.calls[0];
      expect(call[0]).toEqual({ enabled: true });
    });
  });

  it('"Kurumsal oturumu temizle" status differs by ok flag', async () => {
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kurumsal oturumu temizle' }));
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Kurumsal oturum temizlendi');
    });
  });

  it('reports failure status when clearInstitutionalAccessSession returns ok=false', async () => {
    (window as any).electronAPI.clearInstitutionalAccessSession = vi.fn(async () => ({ ok: false }));
    const onStatus = vi.fn();
    render(<BrowserCaptureModal open onClose={() => {}} onStatus={onStatus} />);
    await userEvent.click(screen.getByRole('button', { name: 'Kurumsal oturumu temizle' }));
    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith('Kurumsal oturum temizlenemedi');
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
