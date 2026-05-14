import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';

type BrowserCaptureModalProps = {
  open: boolean;
  onClose: () => void;
  onStatus: (message: string) => void;
};

/**
 * Browser Capture configuration + diagnostic modal.
 *
 * Owns its own browserStatus state and IPC fetch lifecycle. Loads
 * fresh status when opened. Each setup/preferences/institutional
 * action wires through window.electronAPI and updates the displayed
 * status JSON.
 *
 * Extracted from FeatureModals.tsx so the parent stays focused on
 * its other modals.
 */
export function BrowserCaptureModal({ open, onClose, onStatus }: BrowserCaptureModalProps) {
  const [browserStatus, setBrowserStatus] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    window.electronAPI.getBrowserCaptureStatus()
      .then(setBrowserStatus)
      .catch(() => onStatus('Capture durumu alınamadı'));
  }, [open, onStatus]);

  const prepareSetup = () =>
    window.electronAPI.prepareBrowserCaptureSetup()
      .then(() => onStatus('Capture kurulumu hazırlandı'))
      .catch(() => onStatus('Capture kurulumu hazırlanamadı'));

  const openInstallDir = () =>
    window.electronAPI.openBrowserCaptureInstallDir()
      .then(() => onStatus('Kurulum klasörü açıldı'))
      .catch(() => onStatus('Kurulum klasörü açılamadı'));

  const openGuide = () =>
    window.electronAPI.openBrowserCaptureGuide()
      .then(() => onStatus('Kurulum rehberi açıldı'))
      .catch(() => onStatus('Kurulum rehberi açılamadı'));

  const testConnection = () =>
    window.electronAPI.testBrowserCaptureConnection()
      .then((result) => {
        setBrowserStatus(result);
        onStatus('Capture test edildi');
      })
      .catch(() => onStatus('Capture test edilemedi'));

  const enableCapture = () =>
    window.electronAPI.updateBrowserCapturePrefs({ enabled: true })
      .then((result) => {
        setBrowserStatus(result);
        onStatus('Capture tercihleri güncellendi');
      })
      .catch(() => onStatus('Capture tercihleri güncellenemedi'));

  const clearInstitutionalSession = () =>
    window.electronAPI.clearInstitutionalAccessSession()
      .then((result: any) => onStatus(result?.ok ? 'Kurumsal oturum temizlendi' : 'Kurumsal oturum temizlenemedi'))
      .catch(() => onStatus('Kurumsal oturum temizlenemedi'));

  return (
    <Modal title="Browser Capture" open={open} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Setup</div>
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={prepareSetup}>
              Kurulumu hazırla
            </button>
            <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={openInstallDir}>
              Kurulum klasörünü aç
            </button>
            <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={openGuide}>
              Rehberi aç
            </button>
            <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={testConnection}>
              Bağlantıyı test et
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Preferences</div>
          <button className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={enableCapture}>
            Capture aktif et
          </button>
        </section>

        <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Kurumsal Erişim</div>
          <p className="mb-2 text-xs text-aq-muted">
            Kaynak menüsünden kurumsal pencerede aç. O pencerede PDF indirildiğinde dosya otomatik olarak seçili kaynağa bağlanır.
          </p>
          <button
            className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left"
            onClick={clearInstitutionalSession}
          >
            Kurumsal oturumu temizle
          </button>
        </section>

        <pre className="max-h-60 overflow-auto rounded-md bg-white p-3 text-xs">
          {JSON.stringify(browserStatus, null, 2)}
        </pre>
      </div>
    </Modal>
  );
}
