import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';

type BrowserCaptureModalProps = {
  open: boolean;
  onClose: () => void;
  onStatus: (message: string) => void;
};

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Bilinmeyen hata');
}

function getElectronAPI(): any {
  return window.electronAPI || {};
}

export function BrowserCaptureModal({ open, onClose, onStatus }: BrowserCaptureModalProps) {
  const [browserStatus, setBrowserStatus] = useState<unknown>(null);
  const [loadingAction, setLoadingAction] = useState('');
  const current = browserStatus && typeof browserStatus === 'object' ? browserStatus as Record<string, unknown> : {};
  const settings = current.settings && typeof current.settings === 'object' ? current.settings as Record<string, unknown> : {};
  const browserFamily = String(current.browserFamily || settings.browserFamily || 'chromium') === 'firefox' ? 'firefox' : 'chromium';

  useEffect(() => {
    if (!open) return;
    getElectronAPI().getBrowserCaptureStatus()
      .then(setBrowserStatus)
      .catch((error: unknown) => onStatus(`Capture durumu alınamadı: ${describeError(error)}`));
  }, [open, onStatus]);

  const runAction = (action: string, success: string, failure: string) => {
    setLoadingAction(action);
    const api = getElectronAPI();
    const runner = typeof api.runBrowserCaptureAction === 'function'
      ? () => api.runBrowserCaptureAction(action, browserFamily)
      : action === 'install' && typeof api.prepareBrowserCaptureSetup === 'function'
        ? () => api.prepareBrowserCaptureSetup(browserFamily)
        : null;
    if (!runner) {
      onStatus(`${failure}: Browser Capture komutu bulunamadı`);
      setLoadingAction('');
      return;
    }
    runner()
      .then((result: unknown) => {
        setBrowserStatus(result);
        const message = result && typeof result === 'object' && 'message' in result
          ? String((result as { message?: unknown }).message || '')
          : '';
        onStatus(message || success);
      })
      .catch((error: unknown) => onStatus(`${failure}: ${describeError(error)}`))
      .finally(() => setLoadingAction(''));
  };

  const prepareSetupAndOpenFiles = () => {
    const api = getElectronAPI();
    if (typeof api.prepareBrowserCaptureSetup !== 'function') {
      onStatus('Capture kurulumu hazirlanamadi: Browser Capture komutu bulunamadi');
      return;
    }
    setLoadingAction('install');
    api.prepareBrowserCaptureSetup(browserFamily)
      .then((result: unknown) => {
        setBrowserStatus(result);
        return Promise.allSettled([
          typeof api.openBrowserCaptureInstallDir === 'function' ? api.openBrowserCaptureInstallDir(browserFamily) : Promise.reject(new Error('Kurulum klasoru komutu yok')),
          typeof api.openBrowserCaptureGuide === 'function' ? api.openBrowserCaptureGuide(browserFamily) : Promise.reject(new Error('Rehber komutu yok'))
        ]).then((openResults) => ({ result, openResults }));
      })
      .then(({ result, openResults }: { result: unknown; openResults: PromiseSettledResult<unknown>[] }) => {
        const record = result && typeof result === 'object' ? result as Record<string, unknown> : {};
        const detail = [record.installDir, record.guidePath].map((item) => String(item || '')).filter(Boolean).join(' | ');
        const failed = openResults.filter((item) => item.status === 'rejected').length;
        onStatus(`${failed ? `Capture kurulumu hazirlandi; ${failed} dosya acilamadi` : 'Capture kurulumu hazirlandi'}${detail ? `: ${detail}` : ''}`);
      })
      .catch((error: unknown) => onStatus(`Capture kurulumu hazirlanamadi: ${describeError(error)}`))
      .finally(() => setLoadingAction(''));
  };

  const openInstallDir = () =>
    getElectronAPI().openBrowserCaptureInstallDir(browserFamily)
      .then((result: unknown) => {
        setBrowserStatus(result);
        onStatus('Kurulum klasörü açıldı');
      })
      .catch((error: unknown) => onStatus(`Kurulum klasörü açılamadı: ${describeError(error)}`));

  const openGuide = () =>
    getElectronAPI().openBrowserCaptureGuide(browserFamily)
      .then((result: unknown) => {
        setBrowserStatus(result);
        onStatus('Kurulum rehberi açıldı');
      })
      .catch((error: unknown) => onStatus(`Kurulum rehberi açılamadı: ${describeError(error)}`));

  const testConnection = () =>
    getElectronAPI().testBrowserCaptureConnection()
      .then((result: unknown) => {
        setBrowserStatus(result);
        onStatus('Capture test edildi');
      })
      .catch((error: unknown) => onStatus(`Capture test edilemedi: ${describeError(error)}`));

  const enableCapture = () => {
    setLoadingAction('enable');
    const api = getElectronAPI();
    api.updateBrowserCapturePrefs({ enabled: true, setupPromptSeen: true, browserFamily })
      .then((result: unknown) => {
        setBrowserStatus(result);
        onStatus('Capture açılıyor...');
        if (typeof api.runBrowserCaptureAction === 'function') {
          return api.runBrowserCaptureAction('install', browserFamily);
        }
        if (typeof api.prepareBrowserCaptureSetup === 'function') {
          return api.prepareBrowserCaptureSetup(browserFamily);
        }
        return result;
      })
      .then((result: unknown) => {
        setBrowserStatus(result);
        onStatus('Capture aktif edildi');
      })
      .catch((error: unknown) => onStatus(`Yakalama tercihleri güncellenemedi: ${describeError(error)}`))
      .finally(() => setLoadingAction(''));
  };

  return (
    <Modal title="Tarayıcıdan Yakala" open={open} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Kurulum</div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              ['chromium', 'Chromium / Chrome / Edge'],
              ['firefox', 'Firefox / Mozilla']
            ].map(([family, label]) => (
              <button
                type="button"
                key={family}
                className={[
                  'rounded-md border px-3 py-2 text-left text-xs font-semibold',
                  browserFamily === family ? 'border-aq-navy bg-aq-navy text-white' : 'border-aq-line bg-white text-aq-ink'
                ].join(' ')}
                onClick={() => getElectronAPI().updateBrowserCapturePrefs({ browserFamily: family })
                  .then(setBrowserStatus)
                  .catch((error: unknown) => onStatus(`Tarayıcı tipi güncellenemedi: ${describeError(error)}`))}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={prepareSetupAndOpenFiles}>
              {loadingAction === 'install' ? 'Hazırlanıyor...' : 'Kurulumu hazırla'}
            </button>
            <button type="button" className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={openInstallDir}>
              Kurulum klasörünü aç
            </button>
            <button type="button" className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={openGuide}>
              Rehberi aç
            </button>
            <button type="button" className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={testConnection}>
              Bağlantıyı test et
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Tercihler</div>
          <button type="button" className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={enableCapture}>
            {loadingAction === 'enable' ? 'Aktifleştiriliyor...' : 'Capture aktif et'}
          </button>
        </section>

        <pre className="max-h-60 overflow-auto rounded-md bg-white p-3 text-xs">
          {JSON.stringify(browserStatus, null, 2)}
        </pre>
      </div>
    </Modal>
  );
}
