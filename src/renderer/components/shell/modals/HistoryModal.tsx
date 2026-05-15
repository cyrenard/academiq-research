import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';

type HistoryModalProps = {
  open: boolean;
  /** Active document id whose history should be loaded. */
  docId: string;
  onClose: () => void;
  onStatus: (message: string) => void;
  /** Called after a successful restore so the parent can re-pull state. */
  onRestoreState: () => void;
  /** How many snapshots to fetch (default 30). */
  limit?: number;
};

type HistoryItem = {
  id?: string;
  snapshotId?: string;
  createdAt?: string | number;
  date?: string;
  size?: string;
  reason?: string;
};

/**
 * Belge Geçmişi modal — lists snapshot entries and lets the user
 * restore one. Each modal opens fresh and fetches its own history
 * (no parent-shared state). Extracted from FeatureModals.tsx.
 */
export function HistoryModal({
  open,
  docId,
  onClose,
  onStatus,
  onRestoreState,
  limit = 30
}: HistoryModalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!open) return;
    window.electronAPI.getDocumentHistory(docId, limit)
      .then((result: any) => setHistory(
        Array.isArray(result?.snapshots) ? result.snapshots
        : Array.isArray(result) ? result
        : []
      ))
      .catch(() => onStatus('Belge geçmişi alınamadı'));
  }, [open, docId, limit, onStatus]);

  const restore = (item: HistoryItem) => {
    const id = String(item.id || item.snapshotId || '');
    if (!id) return;
    window.electronAPI.restoreDocumentHistorySnapshot(docId, id)
      .then(() => {
        onStatus('Snapshot geri yüklendi');
        onRestoreState();
        onClose();
      })
      .catch(() => onStatus('Snapshot geri yüklenemedi'));
  };

  return (
    <Modal title="Belge Geçmişi" open={open} onClose={onClose} wide>
      <div className="space-y-2">
        {history.map((item, index) => (
          <div
            key={String(item.id || item.snapshotId || index)}
            className="flex items-center justify-between rounded-md border border-aq-line bg-white p-3 text-sm"
          >
            <div>
              <div className="font-semibold">
                {String(item.createdAt || item.date || item.id || `Snapshot ${index + 1}`)}
              </div>
              <div className="text-xs text-aq-muted">{String(item.size || item.reason || '')}</div>
            </div>
            <button
              className="rounded-md bg-aq-navy px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => restore(item)}
            >
              Geri Yükle
            </button>
          </div>
        ))}
        {!history.length ? (
          <div className="p-8 text-center text-sm text-aq-muted">Snapshot bulunamadı.</div>
        ) : null}
      </div>
    </Modal>
  );
}
