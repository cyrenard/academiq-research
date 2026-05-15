import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import type { AcademiqAppState, AcademiqReference } from '../../lib/app-state';
import { formatDate, formatAge, asRecord, statusText } from '../../lib/modal-helpers';
import { ReferenceEditModal } from './modals/ReferenceEditModal';
import { BrowserCaptureModal } from './modals/BrowserCaptureModal';
import { HistoryModal } from './modals/HistoryModal';

type FeatureModal = 'settings' | 'recovery' | 'history' | 'browserCapture' | 'referenceEdit' | null;

type FeatureModalsProps = {
  active: FeatureModal;
  state: AcademiqAppState;
  loadMeta?: Record<string, unknown> | null;
  selectedReference?: AcademiqReference | null;
  onClose: () => void;
  onStatus: (message: string) => void;
  onUpdateReference: (referenceId: string, patch: Record<string, unknown>) => void;
  onDeleteReference: (referenceId: string) => void;
  onRestoreState: () => void;
};

export function FeatureModals({
  active,
  state,
  loadMeta,
  selectedReference,
  onClose,
  onStatus,
  onUpdateReference,
  onDeleteReference,
  onRestoreState
}: FeatureModalsProps) {
  const [info, setInfo] = useState<unknown>(null);
  const [syncInfo, setSyncInfo] = useState<unknown>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [browserStatus, setBrowserStatus] = useState<unknown>(null);
  const [settingsTab, setSettingsTab] = useState<'recovery' | 'history' | 'capture' | 'matrixAssistant' | 'sync' | 'storage' | 'updates' | 'about'>('recovery');
  const [updateUrl, setUpdateUrl] = useState('');
  const [loadingAction, setLoadingAction] = useState('');

  const refreshHistory = () => {
    window.electronAPI.getDocumentHistory(state.curDoc, 30)
      .then((result: any) => setHistory(Array.isArray(result?.snapshots) ? result.snapshots : Array.isArray(result) ? result : []))
      .catch(() => onStatus('Belge geçmişi alınamadı'));
  };

  useEffect(() => {
    if (active === 'settings') {
      window.electronAPI.getAppInfo().then(setInfo).catch(() => onStatus('App bilgisi alınamadı'));
      window.electronAPI.getSyncSettings().then(setSyncInfo).catch(() => onStatus('Sync ayarları okunamadı'));
      window.electronAPI.getBrowserCaptureStatus().then(setBrowserStatus).catch(() => onStatus('Capture durumu alınamadı'));
      window.electronAPI.getDocumentHistory(state.curDoc, 30)
        .then((result: any) => setHistory(Array.isArray(result?.snapshots) ? result.snapshots : Array.isArray(result) ? result : []))
        .catch(() => onStatus('Belge geçmişi alınamadı'));
    }
    if (active === 'history') {
      window.electronAPI.getDocumentHistory(state.curDoc, 30)
        .then((result: any) => setHistory(Array.isArray(result?.snapshots) ? result.snapshots : Array.isArray(result) ? result : []))
        .catch(() => onStatus('Belge geçmişi alınamadı'));
    }
    if (active === 'recovery') {
      refreshHistory();
    }
    if (active === 'browserCapture') {
      window.electronAPI.getBrowserCaptureStatus().then(setBrowserStatus).catch(() => onStatus('Capture durumu alınamadı'));
    }
  }, [active, onStatus, state.curDoc]);

  const refreshCaptureStatus = () => window.electronAPI.getBrowserCaptureStatus()
    .then(setBrowserStatus)
    .catch(() => onStatus('Capture durumu alınamadı'));

  const runBackupCreate = () => {
    setLoadingAction('backup-create');
    window.electronAPI.createBackup()
      .then((result: any) => {
        if (result?.canceled) {
          onStatus('Backup iptal edildi');
          return;
        }
        if (!result?.ok) {
          onStatus(`Backup oluşturulamadı${result?.error ? `: ${String(result.error)}` : ''}`);
          return;
        }
        setInfo((current: unknown) => Object.assign({}, asRecord(current), { lastBackup: result }));
        const mb = Number(result.totalBytes || 0) / (1024 * 1024);
        onStatus(`Backup oluşturuldu · ${mb.toFixed(1)} MB`);
      })
      .catch(() => onStatus('Backup oluşturulamadı'))
      .finally(() => setLoadingAction(''));
  };

  const runBackupRestore = () => {
    if (!window.confirm('Backup yüklendiğinde mevcut yerel veriler, notlar, workspace kayıtları ve PDF klasörleri seçilen backup ile değiştirilecek. Devam edilsin mi?')) return;
    (window as any).__aqBackupRestoreInProgress = true;
    setLoadingAction('backup-restore');
    window.electronAPI.restoreBackup()
      .then((result: any) => {
        if (result?.canceled) {
          (window as any).__aqBackupRestoreInProgress = false;
          onStatus('Backup yükleme iptal edildi');
          return;
        }
        if (!result?.ok) {
          (window as any).__aqBackupRestoreInProgress = false;
          onStatus(`Backup yüklenemedi${result?.error ? `: ${String(result.error)}` : ''}`);
          return;
        }
        onStatus('Backup yüklendi');
        onRestoreState();
        window.setTimeout(() => {
          window.location.reload();
        }, 350);
      })
      .catch(() => {
        (window as any).__aqBackupRestoreInProgress = false;
        onStatus('Backup yüklenemedi');
      })
      .finally(() => setLoadingAction(''));
  };
  const updateMatrixAssistant = (patch: Record<string, unknown>) => {
    const current = asRecord((state as any).localMatrixAssistant);
    const next = Object.assign({}, current, patch, {
      updatedAt: Date.now()
    });
    (state as any).localMatrixAssistant = next;
    const win = window as any;
    if (win.S && typeof win.S === 'object') win.S.localMatrixAssistant = next;
    window.electronAPI.saveData(JSON.stringify(state))
      .then(() => {
        onStatus(next.enabled ? 'Yerel Matrix yardımcısı açıldı' : 'Yerel Matrix yardımcısı kapatıldı');
        if (next.enabled && win.AQLiteratureMatrix && typeof win.AQLiteratureMatrix.rerunLocalAssistantAutoFill === 'function') {
          win.AQLiteratureMatrix.rerunLocalAssistantAutoFill();
        } else if (win.AQLiteratureMatrix && typeof win.AQLiteratureMatrix.render === 'function') {
          win.AQLiteratureMatrix.render();
        }
      })
      .catch(() => onStatus('Yerel Matrix yardımcısı kaydedilemedi'));
  };
  const runCaptureAction = (action: string, success: string, failure: string) => {
    setLoadingAction(action);
    window.electronAPI.runBrowserCaptureAction(action)
      .then((result) => {
        setBrowserStatus(result);
        const message = result && typeof result === 'object' && 'message' in result
          ? String((result as { message?: unknown }).message || '')
          : '';
        const installDir = result && typeof result === 'object' && 'installDir' in result
          ? String((result as { installDir?: unknown }).installDir || '')
          : '';
        onStatus(message || (installDir ? `${success}: ${installDir}` : success));
      })
      .catch(() => onStatus(failure))
      .finally(() => setLoadingAction(''));
  };

  const restoreSnapshot = (snapshotId: string) => {
    if (!snapshotId) return;
    if (!window.confirm('Bu belge sürümü geri yüklensin mi?')) return;
    window.electronAPI.restoreDocumentHistorySnapshot(state.curDoc, snapshotId).then(() => {
      onStatus('Snapshot geri yüklendi');
      onRestoreState();
      onClose();
    }).catch(() => onStatus('Snapshot geri yüklenemedi'));
  };

  const capture = asRecord(browserStatus);
  const meta = asRecord(loadMeta);
  const sync = asRecord(syncInfo);
  const update = asRecord(info);
  const checkedUpdateUrl = String(update.downloadUrl || '');
  const updateDownloadUrl = checkedUpdateUrl || updateUrl.trim();
  const updateAvailable = update.available === true;
  const latestSnapshot = history[0] || null;
  const currentDoc = state.docs.find((doc) => doc.id === state.curDoc);
  const captureUpdateAvailable = capture.lifecycleState === 'update_available' || capture.updateAvailable === true;

  return (
    <>
      <Modal title="Belge Sürümleri" open={active === 'recovery'} onClose={onClose} wide>
        <div className="grid max-h-[72vh] grid-cols-[250px_1fr] gap-4 overflow-hidden text-sm">
          <aside className="space-y-3 rounded-[14px] bg-aq-paper/80 p-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-aq-muted">Belge</div>
              <div className="mt-1 text-lg font-semibold text-aq-ink">{currentDoc?.name || 'Aktif belge'}</div>
              <div className="mt-1 text-xs text-aq-muted">{history.length} snapshot hazır</div>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-[0_10px_26px_rgba(16,24,40,0.06)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Draft durumu</div>
              <div className="mt-2 text-sm font-semibold text-aq-ink">
                {meta.recoveredFromDraft || meta.recoveredFromRecovery ? 'Kurtarma yüklendi' : 'Sakin'}
              </div>
              <p className="mt-1 text-xs leading-5 text-aq-muted">
                {meta.recoveredFromDraft || meta.recoveredFromRecovery
                  ? 'Bu oturum recovery veya draft dosyasından açıldı.'
                  : 'Şu anda kurtarma gerektiren yeni draft sinyali yok.'}
              </p>
            </div>
            <div className="rounded-xl bg-white p-3 shadow-[0_10px_26px_rgba(16,24,40,0.06)]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Son snapshot</div>
              <div className="mt-2 text-sm font-semibold text-aq-ink">
                {latestSnapshot ? formatAge(latestSnapshot.createdAt || latestSnapshot.date) : 'Henüz yok'}
              </div>
              <p className="mt-1 text-xs leading-5 text-aq-muted">
                {latestSnapshot
                  ? `${Number(latestSnapshot.wordCount || 0)} kelime · ${String(latestSnapshot.source || 'autosave')}`
                  : 'Bu belge için kayıtlı önceki sürüm bulunamadı.'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="h-9 flex-1 rounded-lg border border-aq-line bg-white px-3 text-xs font-semibold text-aq-ink shadow-sm hover:bg-aq-panel"
                onClick={refreshHistory}
              >
                Yenile
              </button>
              <button
                type="button"
                className="h-9 flex-1 rounded-lg bg-aq-navy px-3 text-xs font-semibold text-white shadow-sm hover:bg-aq-navy/90"
                onClick={() => window.electronAPI.saveEditorDraft(JSON.stringify(state)).then(() => onStatus('Draft kaydedildi')).catch(() => onStatus('Draft kaydedilemedi'))}
              >
                Draft al
              </button>
            </div>
          </aside>

          <section className="min-h-0 overflow-auto pr-1">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-aq-muted">Önceki versiyonlar</div>
                <p className="mt-1 text-xs text-aq-muted">Bir snapshot seçip belgeyi hızlıca o sürüme döndürebilirsin.</p>
              </div>
              <span className="rounded-full border border-aq-line bg-white px-3 py-1 text-xs font-semibold text-aq-muted">
                {history.length} kayıt
              </span>
            </div>
            <div className="space-y-3">
              {history.map((item, index) => {
                const id = String(item.id || item.snapshotId || '');
                const createdAt = item.createdAt || item.date;
                return (
                  <article key={id || index} className="rounded-[14px] border border-aq-line bg-white p-4 shadow-[0_18px_44px_rgba(16,24,40,0.07)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-aq-ink">{formatAge(createdAt)} · {Number(item.wordCount || 0)} kelime</div>
                        <div className="mt-1 text-xs text-aq-muted">{formatDate(createdAt)} · {String(item.source || 'autosave')} · {Number(item.charCount || 0)} karakter</div>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-aq-navy px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-aq-navy/90"
                        onClick={() => restoreSnapshot(id)}
                      >
                        Bu sürüme geç
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl bg-aq-paper/80 p-3 text-sm leading-6 text-aq-muted">
                      {String(item.excerpt || item.preview || 'Önizleme yok.').slice(0, 420)}
                    </div>
                  </article>
                );
              })}
              {!history.length ? (
                <div className="rounded-[14px] border border-dashed border-aq-line bg-white/70 p-10 text-center text-sm text-aq-muted">
                  Bu belge için snapshot bulunamadı.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </Modal>

      <Modal title="Ayarlar" open={active === 'settings'} onClose={onClose}>
        <div className="grid min-h-[520px] grid-cols-[170px_1fr] gap-4 text-sm">
          <nav className="space-y-1 border-r border-aq-line pr-3">
            {[
              ['recovery', 'Recovery / Autosave'],
              ['history', 'Belge geçmişi'],
              ['capture', 'Capture agent'],
              ['matrixAssistant', 'Matrix yardımcısı'],
              ['sync', 'Sync'],
              ['storage', 'Storage / Backup'],
              ['updates', 'Updates'],
              ['about', 'About']
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                onClick={() => setSettingsTab(id as typeof settingsTab)}
                className={[
                  'block w-full rounded-md px-3 py-2 text-left text-xs font-semibold',
                  settingsTab === id ? 'bg-aq-navy text-white' : 'text-aq-muted hover:bg-aq-panel hover:text-aq-ink'
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 overflow-auto pr-1">
            {settingsTab === 'recovery' ? (
              <div className="space-y-3">
                <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Draft recovery</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-white p-3"><b>Unclean shutdown</b><br />{meta.uncleanShutdown ? 'evet' : 'hayır'}</div>
                    <div className="rounded-md bg-white p-3"><b>Draft recovery</b><br />{meta.recoveredFromDraft ? 'drafttan yüklendi' : 'pasif'}</div>
                    <div className="rounded-md bg-white p-3"><b>Recovery file</b><br />{meta.recoveredFromRecovery ? 'recoveryden yüklendi' : 'hazır'}</div>
                    <div className="rounded-md bg-white p-3"><b>Backup</b><br />{meta.restoredFromBackup ? 'backuptan yüklendi' : 'hazır'}</div>
                  </div>
                  <div className="mt-3 rounded-md bg-white p-3 text-xs">
                    Son kayıt: {formatDate(meta.lastSavedAt)}<br />
                    Recovery meta: {JSON.stringify(meta.recoveryMeta || {}, null, 0)}
                  </div>
                </section>
                <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Autosave</div>
                  <p className="mb-2 text-xs leading-5 text-aq-muted">Autosave mevcut editor değişikliğiyle saveData, editor draft ise saveEditorDraft IPC hattından çalışır.</p>
                  <button
                    type="button"
                    className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold"
                    onClick={() => window.electronAPI.saveEditorDraft(JSON.stringify(state)).then((result) => { setInfo(result); onStatus('Draft kaydedildi'); }).catch(() => onStatus('Draft kaydedilemedi'))}
                  >
                    Draft kaydetmeyi test et
                  </button>
                </section>
              </div>
            ) : null}

            {settingsTab === 'history' ? (
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Belge geçmişi</div>
                  <button type="button" className="rounded-md border border-aq-line bg-white px-3 py-1.5 text-xs font-semibold" onClick={() => window.electronAPI.getDocumentHistory(state.curDoc, 30).then((result: any) => setHistory(Array.isArray(result?.snapshots) ? result.snapshots : [])).catch(() => onStatus('Belge geçmişi yenilenemedi'))}>Yenile</button>
                </div>
                {history.map((item, index) => (
                  <div key={String(item.id || item.snapshotId || index)} className="rounded-lg border border-aq-line bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{formatDate(item.createdAt)}</div>
                        <div className="mt-1 text-xs text-aq-muted">{String(item.source || 'autosave')} · {Number(item.wordCount || 0)} kelime · {Number(item.charCount || 0)} karakter</div>
                      </div>
                      <button type="button" className="rounded-md bg-aq-navy px-3 py-1.5 text-xs font-semibold text-white" onClick={() => restoreSnapshot(String(item.id || item.snapshotId || ''))}>Geri yükle</button>
                    </div>
                    {item.excerpt ? <div className="mt-2 rounded-md bg-aq-paper p-2 text-xs leading-5 text-aq-muted">{String(item.excerpt)}</div> : null}
                  </div>
                ))}
                {!history.length ? <div className="rounded-lg border border-dashed border-aq-line p-8 text-center text-sm text-aq-muted">Snapshot bulunamadı.</div> : null}
              </div>
            ) : null}

            {settingsTab === 'capture' ? (
              <div className="space-y-3">
                <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Capture agent / extension</div>
                    <span className="rounded-full border border-aq-line bg-white px-2 py-0.5 text-xs">{statusText(browserStatus)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-white p-3"><b>Browser</b><br />{String(capture.defaultBrowserLabel || capture.browserFamily || '-')}</div>
                    <div className="rounded-md bg-white p-3"><b>Port</b><br />{String(capture.port || capture.agentPort || '-')}</div>
                    <div className="rounded-md bg-white p-3"><b>Extension</b><br />{String(capture.installedExtensionVersion || '-')}</div>
                    <div className="rounded-md bg-white p-3"><b>Son bağlantı</b><br />{formatDate(capture.lastConnectedAt || capture.lastHelloAt)}</div>
                  </div>
                  {captureUpdateAvailable ? (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="font-semibold">Capture extension güncellemesi hazır.</div>
                      <div className="mt-1 text-amber-800">Dosyalar yenilenir, agent yeniden başlatılır ve yönetilen tarayıcı oturumu tekrar açılır.</div>
                      <button
                        type="button"
                        className="mt-3 rounded-md bg-aq-navy px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={loadingAction === 'update'}
                        onClick={() => runCaptureAction('update', 'Capture extension güncellendi', 'Capture extension güncellenemedi')}
                      >
                        {loadingAction === 'update' ? 'Güncelleniyor...' : 'Güncellemeyi uygula'}
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => runCaptureAction('install', 'Capture kurulumu hazırlandı', 'Capture kurulumu hazırlanamadı')}>{loadingAction === 'install' ? 'Hazırlanıyor...' : 'Kurulumu hazırla'}</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => runCaptureAction('repair', 'Capture kurulumu onarıldı', 'Capture onarılamadı')}>Onar</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.testBrowserCaptureConnection().then((result) => { setBrowserStatus(result); onStatus('Capture test edildi'); }).catch(() => onStatus('Capture test edilemedi'))}>Test et</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.openBrowserCaptureInstallDir().catch(() => onStatus('Kurulum klasörü açılamadı'))}>Klasörü aç</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.openBrowserCaptureGuide().catch(() => onStatus('Rehber açılamadı'))}>Rehberi aç</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={refreshCaptureStatus}>Yenile</button>
                  </div>
                </section>
                <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Preferences</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.updateBrowserCapturePrefs({ enabled: !capture.enabled }).then((result) => { setBrowserStatus(result); onStatus('Capture tercihleri güncellendi'); }).catch(() => onStatus('Capture tercihleri güncellenemedi'))}>{capture.enabled ? 'Capture kapat' : 'Capture aktif et'}</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.updateBrowserCapturePrefs({ autoAttachPdfUrl: capture.autoAttachPdfUrl === false }).then((result) => { setBrowserStatus(result); onStatus('PDF URL tercihi güncellendi'); }).catch(() => onStatus('Tercih güncellenemedi'))}>PDF URL auto attach: {capture.autoAttachPdfUrl === false ? 'kapalı' : 'açık'}</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.updateBrowserCapturePrefs({ focusImportedWorkspace: !capture.focusImportedWorkspace }).then((result) => { setBrowserStatus(result); onStatus('Workspace odak tercihi güncellendi'); }).catch(() => onStatus('Tercih güncellenemedi'))}>İçeri aktarılan workspace odağı: {capture.focusImportedWorkspace ? 'açık' : 'kapalı'}</button>
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => runCaptureAction('update', 'Extension dosyaları güncellendi', 'Capture extension güncellenemedi')}>{loadingAction === 'update' ? 'Güncelleniyor...' : 'Extension güncelle'}</button>
                  </div>
                </section>
              </div>
            ) : null}

            {settingsTab === 'matrixAssistant' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Yerel Matrix yardımcısı</div>
                  <span className="rounded-full border border-aq-line bg-white px-2 py-0.5 text-xs">
                    {asRecord((state as any).localMatrixAssistant).enabled ? 'Açık' : 'Kapalı'}
                  </span>
                </div>
                <p className="text-xs leading-5 text-aq-muted">
                  Bu katman yalnızca Literatür Matrisi için çalışır. Aday metinleri yerel olarak puanlar ve istersen
                  hücrelere yazılacak kısa Purpose/Method/Sample/Findings metinlerini yerel olarak oluşturur. Yazı
                  editörüne dokunmaz, dış servise veri göndermez.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-white p-3"><b>Kapsam</b><br />Sadece Literature Matrix auto-fill</div>
                  <div className="rounded-md bg-white p-3"><b>Gizlilik</b><br />PDF/metin verisi cihaz dışına çıkmaz</div>
                  <div className="rounded-md bg-white p-3"><b>Performans</b><br />Kapalıyken sıfır ek maliyet, açıkken aday listesiyle sınırlı</div>
                  <div className="rounded-md bg-white p-3"><b>Yazım</b><br />Sadece matrix hücreleri; makale metni değil</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-md bg-aq-navy px-3 py-2 text-left text-xs font-semibold text-white"
                    onClick={() => {
                      const enabled = !asRecord((state as any).localMatrixAssistant).enabled;
                      updateMatrixAssistant({ enabled, composeCells: enabled ? true : asRecord((state as any).localMatrixAssistant).composeCells });
                    }}
                  >
                    {asRecord((state as any).localMatrixAssistant).enabled ? 'Yardımcıyı kapat' : 'Yardımcıyı aç'}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold"
                    onClick={() => updateMatrixAssistant({ composeCells: !asRecord((state as any).localMatrixAssistant).composeCells })}
                  >
                    Hücre yazımı: {asRecord((state as any).localMatrixAssistant).composeCells ? 'açık' : 'kapalı'}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold"
                    onClick={() => updateMatrixAssistant({ allowModelProvider: !asRecord((state as any).localMatrixAssistant).allowModelProvider })}
                  >
                    Yerel model sağlayıcı: {asRecord((state as any).localMatrixAssistant).allowModelProvider ? 'açık' : 'kapalı'}
                  </button>
                </div>
                <div className="mt-3 rounded-md bg-white p-3 text-xs text-aq-muted">
                  Hücre yazımı açıkken sistem mevcut PDF/özet/not adaylarından kısa matrix hücresi üretir. Yerel model sağlayıcı yoksa
                  güvenli extractive composer kullanılır; gerçek model paketi eklenirse yine yalnızca bu matrix akışında çalışır.
                </div>
              </section>
            ) : null}

            {settingsTab === 'sync' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Sync</div>
                <div className="mb-3 rounded-md bg-white p-3 text-xs">
                  Mode: {sync.syncDir ? 'Sync' : 'Yerel'}<br />
                  Klasör: {String(sync.syncDir || sync.dir || '-')}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.setSyncDir().then((result) => { setSyncInfo(result); onStatus('Sync klasörü seçildi'); }).catch(() => onStatus('Sync klasörü seçilemedi'))}>Sync klasörü seç</button>
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.clearSyncDir().then((result) => { setSyncInfo(result); onStatus('Sync klasörü temizlendi'); }).catch(() => onStatus('Sync klasörü temizlenemedi'))}>Sync klasörünü temizle</button>
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.pdfSyncAll().then((result) => { setSyncInfo(result); onStatus('PDF sync tamamlandı'); }).catch(() => onStatus('PDF sync çalışmadı'))}>PDF sync all</button>
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.getSyncSettings().then(setSyncInfo).catch(() => onStatus('Sync ayarları okunamadı'))}>Yenile</button>
                </div>
              </section>
            ) : null}

            {settingsTab === 'storage' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Storage / Backup</div>
                <p className="mb-3 text-xs leading-5 text-aq-muted">
                  Tek bir AcademiQ backup dosyası; workspace’leri, belgeleri, notları, kaynakları, belge geçmişini, ayarları ve PDF klasörlerini taşır.
                  PDF’ler binary olarak saklanır, base64 kullanılmadığı için dosya gereksiz şişmez.
                </p>
                <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-white p-3"><b>Veri</b><br />Workspace, editor içeriği, notlar, kaynaklar, matrix</div>
                  <div className="rounded-md bg-white p-3"><b>Dosyalar</b><br />Workspace PDF klasörleri ve eski PDF cache</div>
                  <div className="rounded-md bg-white p-3"><b>Geçmiş</b><br />Belge snapshotları ve recovery dosyaları</div>
                  <div className="rounded-md bg-white p-3"><b>Taşıma</b><br />Restore sonrası sync yolu sıfırlanır, veri yerel açılır</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loadingAction === 'backup-create'}
                    onClick={runBackupCreate}
                  >
                    {loadingAction === 'backup-create' ? 'Backup hazırlanıyor...' : 'Backup oluştur'}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-aq-navy px-3 py-2 text-left text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loadingAction === 'backup-restore'}
                    onClick={runBackupRestore}
                  >
                    {loadingAction === 'backup-restore' ? 'Backup yükleniyor...' : 'Backup yükle / restore et'}
                  </button>
                </div>
                <div className="mt-3 rounded-md bg-white p-3 text-xs text-aq-muted">
                  App data: {String(asRecord(info).appDir || '-')}<br />
                  PDF cache: {String(asRecord(info).pdfDir || '-')}<br />
                  PDF sayısı: {String(asRecord(info).pdfCount || 0)}
                </div>
              </section>
            ) : null}
            {settingsTab === 'updates' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Güncelleme</div>
                <div className="mb-3 rounded-md bg-white p-3 text-xs text-aq-ink">
                  <div className="font-semibold">
                    {update.remote
                      ? updateAvailable
                        ? `Yeni sürüm hazır: ${String(update.remote)}`
                        : `Güncel sürüm: ${String(update.current || update.remote)}`
                      : 'Güncelleme durumunu kontrol edin.'}
                  </div>
                  {update.assetName ? <div className="mt-1 text-aq-muted">Paket: {String(update.assetName)}</div> : null}
                  {update.error ? <div className="mt-2 text-red-700">{String(update.error)}</div> : null}
                  {update.ok === true ? <div className="mt-2 text-emerald-700">{String(update.message || 'Güncelleme indirildi.')}</div> : null}
                  {update.ok === false ? <div className="mt-2 text-red-700">{String(update.error || 'Güncelleme indirilemedi.')}</div> : null}
                </div>
                <button
                  className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loadingAction === 'check-update'}
                  onClick={() => {
                    setLoadingAction('check-update');
                    window.electronAPI.checkUpdate()
                      .then((result) => {
                        const record = asRecord(result);
                        setInfo(result);
                        if (record.downloadUrl) setUpdateUrl(String(record.downloadUrl));
                        onStatus(record.available ? 'Yeni güncelleme bulundu' : 'Uygulama güncel');
                      })
                      .catch(() => onStatus('Güncelleme kontrol edilemedi'))
                      .finally(() => setLoadingAction(''));
                  }}
                >
                  {loadingAction === 'check-update' ? 'Kontrol ediliyor...' : 'Güncellemeyi kontrol et'}
                </button>
                <div className="mt-2 flex gap-2">
                  <input value={updateUrl} onChange={(event) => setUpdateUrl(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-3 text-xs outline-none" placeholder="Update URL" />
                  <button className="rounded-md bg-aq-navy px-3 text-xs font-semibold text-white" onClick={() => window.electronAPI.setUpdateUrl(updateUrl).then(() => onStatus('Güncelleme adresi kaydedildi')).catch(() => onStatus('Güncelleme adresi kaydedilemedi'))}>Kaydet</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!updateDownloadUrl || loadingAction === 'download-update'}
                    onClick={() => {
                      if (!updateDownloadUrl) {
                        onStatus('Önce güncellemeyi kontrol edin');
                        return;
                      }
                      setLoadingAction('download-update');
                      window.electronAPI.downloadUpdate(updateDownloadUrl)
                        .then((result) => {
                          setInfo(result);
                          const record = asRecord(result);
                          onStatus(record.ok ? 'Güncelleme indirildi' : String(record.error || 'Güncelleme indirilemedi'));
                        })
                        .catch(() => onStatus('Güncelleme indirilemedi'))
                        .finally(() => setLoadingAction(''));
                    }}
                  >
                    {loadingAction === 'download-update' ? 'İndiriliyor...' : 'Güncellemeyi indir'}
                  </button>
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.restartApp()}>Uygulamayı yeniden başlat</button>
                </div>
                {checkedUpdateUrl ? <div className="mt-3 break-all rounded-md bg-white p-3 text-[11px] text-aq-muted">{checkedUpdateUrl}</div> : null}
              </section>
            ) : null}

            {settingsTab === 'about' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">About</div>
                <pre className="max-h-80 overflow-auto rounded-md bg-white p-3 text-xs">{JSON.stringify({ app: info, sync: syncInfo, load: loadMeta }, null, 2)}</pre>
              </section>
            ) : null}
          </div>
        </div>
      </Modal>

      <HistoryModal
        open={active === 'history'}
        docId={state.curDoc}
        onClose={onClose}
        onStatus={onStatus}
        onRestoreState={onRestoreState}
      />

      <BrowserCaptureModal
        open={active === 'browserCapture'}
        onClose={onClose}
        onStatus={onStatus}
      />

      <ReferenceEditModal
        open={active === 'referenceEdit'}
        reference={selectedReference || null}
        onClose={onClose}
        onUpdate={onUpdateReference}
        onDelete={onDeleteReference}
      />
    </>
  );
}

export type { FeatureModal };

