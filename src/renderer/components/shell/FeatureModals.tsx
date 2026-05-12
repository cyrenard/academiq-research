import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import type { AcademiqAppState, AcademiqReference } from '../../lib/app-state';

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

function formatDate(value: unknown) {
  const stamp = Number(value || 0);
  if (!stamp) return '-';
  try { return new Date(stamp).toLocaleString('tr-TR'); } catch (_error) { return String(value); }
}

function formatAge(value: unknown) {
  const stamp = Number(value || 0);
  if (!stamp) return '-';
  const diff = Date.now() - stamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'az önce';
  if (diff < hour) return `${Math.max(1, Math.round(diff / minute))} dk önce`;
  if (diff < day) return `${Math.max(1, Math.round(diff / hour))} sa önce`;
  return `${Math.max(1, Math.round(diff / day))} gün önce`;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {};
}

function statusText(value: unknown) {
  const record = asRecord(value);
  return String(record.lifecycle || record.lifecycleState || record.state || record.status || (record.ok === false ? 'hata' : record.ok === true ? 'ok' : '-'));
}

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
  const [settingsTab, setSettingsTab] = useState<'recovery' | 'history' | 'capture' | 'sync' | 'updates' | 'about'>('recovery');
  const [refDraft, setRefDraft] = useState<Record<string, string>>({});
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

  useEffect(() => {
    if (active !== 'referenceEdit' || !selectedReference) return;
    setRefDraft({
      title: String(selectedReference.title || ''),
      authors: Array.isArray(selectedReference.authors) ? selectedReference.authors.join('; ') : String(selectedReference.authors || ''),
      year: String(selectedReference.year || ''),
      doi: String(selectedReference.doi || ''),
      url: String(selectedReference.url || ''),
      journal: String(selectedReference.journal || ''),
      abstract: String(selectedReference.abstract || '')
    });
  }, [active, selectedReference]);

  const saveReference = () => {
    if (!selectedReference) return;
    onUpdateReference(selectedReference.id, {
      title: refDraft.title,
      authors: refDraft.authors.split(';').map((item) => item.trim()).filter(Boolean),
      year: refDraft.year,
      doi: refDraft.doi,
      url: refDraft.url,
      journal: refDraft.journal,
      abstract: refDraft.abstract
    });
    onClose();
  };

  const refreshCaptureStatus = () => window.electronAPI.getBrowserCaptureStatus()
    .then(setBrowserStatus)
    .catch(() => onStatus('Capture durumu alınamadı'));

  const runCaptureAction = (action: string, success: string, failure: string) => {
    setLoadingAction(action);
    window.electronAPI.runBrowserCaptureAction(action)
      .then((result) => {
        setBrowserStatus(result);
        onStatus(success);
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
  const latestSnapshot = history[0] || null;
  const currentDoc = state.docs.find((doc) => doc.id === state.curDoc);

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
              ['sync', 'Sync'],
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
                    <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => runCaptureAction('update', 'Capture extension güncellendi', 'Capture extension güncellenemedi')}>Extension güncelle</button>
                  </div>
                </section>
              </div>
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

            {settingsTab === 'updates' ? (
              <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Updates</div>
                <button className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.checkUpdate().then((result) => { setInfo(result); onStatus('Güncelleme kontrol edildi'); }).catch(() => onStatus('Güncelleme kontrol edilemedi'))}>Güncellemeyi kontrol et</button>
                <div className="mt-2 flex gap-2">
                  <input value={updateUrl} onChange={(event) => setUpdateUrl(event.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-3 text-xs outline-none" placeholder="Update URL" />
                  <button className="rounded-md bg-aq-navy px-3 text-xs font-semibold text-white" onClick={() => window.electronAPI.setUpdateUrl(updateUrl).then(() => onStatus('Update URL kaydedildi')).catch(() => onStatus('Update URL kaydedilemedi'))}>Kaydet</button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.downloadUpdate(updateUrl).then((result) => { setInfo(result); onStatus('Update indirildi'); }).catch(() => onStatus('Update indirilemedi'))}>Update indir</button>
                  <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left text-xs font-semibold" onClick={() => window.electronAPI.restartApp()}>Uygulamayı yeniden başlat</button>
                </div>
                <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-white p-3 text-xs">{JSON.stringify(info, null, 2)}</pre>
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

      <Modal title="Belge Geçmişi" open={active === 'history'} onClose={onClose} wide>
        <div className="space-y-2">
          {history.map((item, index) => (
            <div key={String(item.id || item.snapshotId || index)} className="flex items-center justify-between rounded-md border border-aq-line bg-white p-3 text-sm">
              <div>
                <div className="font-semibold">{String(item.createdAt || item.date || item.id || `Snapshot ${index + 1}`)}</div>
                <div className="text-xs text-aq-muted">{String(item.size || item.reason || '')}</div>
              </div>
              <button
                className="rounded-md bg-aq-navy px-3 py-1.5 text-xs font-semibold text-white"
                onClick={() => {
                  const id = String(item.id || item.snapshotId || '');
                  if (!id) return;
                  window.electronAPI.restoreDocumentHistorySnapshot(state.curDoc, id).then(() => {
                    onStatus('Snapshot geri yüklendi');
                    onRestoreState();
                    onClose();
                  });
                }}
              >
                Geri Yükle
              </button>
            </div>
          ))}
          {!history.length ? <div className="p-8 text-center text-sm text-aq-muted">Snapshot bulunamadı.</div> : null}
        </div>
      </Modal>

      <Modal title="Browser Capture" open={active === 'browserCapture'} onClose={onClose}>
        <div className="space-y-3 text-sm">
          <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Setup</div>
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={() => window.electronAPI.prepareBrowserCaptureSetup().then(() => onStatus('Capture kurulumu hazırlandı')).catch(() => onStatus('Capture kurulumu hazırlanamadı'))}>Kurulumu hazırla</button>
              <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={() => window.electronAPI.openBrowserCaptureInstallDir().then(() => onStatus('Kurulum klasörü açıldı')).catch(() => onStatus('Kurulum klasörü açılamadı'))}>Kurulum klasörünü aç</button>
              <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={() => window.electronAPI.openBrowserCaptureGuide().then(() => onStatus('Kurulum rehberi açıldı')).catch(() => onStatus('Kurulum rehberi açılamadı'))}>Rehberi aç</button>
              <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={() => window.electronAPI.testBrowserCaptureConnection().then((result) => { setBrowserStatus(result); onStatus('Capture test edildi'); }).catch(() => onStatus('Capture test edilemedi'))}>Bağlantıyı test et</button>
            </div>
          </section>

          <section className="rounded-lg border border-aq-line bg-aq-paper p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-aq-muted">Preferences</div>
            <button className="w-full rounded-md border border-aq-line bg-white px-3 py-2 text-left" onClick={() => window.electronAPI.updateBrowserCapturePrefs({ enabled: true }).then((result) => { setBrowserStatus(result); onStatus('Capture tercihleri güncellendi'); }).catch(() => onStatus('Capture tercihleri güncellenemedi'))}>Capture aktif et</button>
          </section>

          <pre className="max-h-60 overflow-auto rounded-md bg-white p-3 text-xs">{JSON.stringify(browserStatus, null, 2)}</pre>
        </div>
      </Modal>

      <Modal title="Kaynak Detayı" open={active === 'referenceEdit'} onClose={onClose}>
        {selectedReference ? (
          <div className="space-y-3 text-sm">
            {[
              ['title', 'Başlık'],
              ['authors', 'Yazarlar (; ile ayır)'],
              ['year', 'Yıl'],
              ['doi', 'DOI'],
              ['url', 'URL'],
              ['journal', 'Dergi']
            ].map(([key, label]) => (
              <label key={key} className="block text-xs font-semibold text-aq-muted">
                {label}
                <input value={refDraft[key] || ''} onChange={(event) => setRefDraft((draft) => ({ ...draft, [key]: event.target.value }))} className="mt-1 h-9 w-full rounded-md border border-aq-line bg-white px-3 text-sm font-normal text-aq-ink outline-none" />
              </label>
            ))}
            <label className="block text-xs font-semibold text-aq-muted">
              Abstract
              <textarea value={refDraft.abstract || ''} onChange={(event) => setRefDraft((draft) => ({ ...draft, abstract: event.target.value }))} className="mt-1 h-24 w-full resize-none rounded-md border border-aq-line bg-white px-3 py-2 text-sm font-normal text-aq-ink outline-none" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button className="rounded-md bg-aq-navy px-3 py-2 text-xs font-semibold text-white" onClick={saveReference}>Kaydet</button>
              <button className="rounded-md border border-aq-line bg-white px-3 py-2 text-xs font-semibold text-red-700" onClick={() => onDeleteReference(selectedReference.id)}>Sil</button>
            </div>
          </div>
        ) : <div className="text-sm text-aq-muted">Kaynak seçilmedi.</div>}
      </Modal>
    </>
  );
}

export type { FeatureModal };
