import { useState, type MouseEvent } from 'react';
import { Modal } from '../ui/Modal';
import type { AcademiqReference } from '../../lib/app-state';

type Collection = {
  id: string;
  name: string;
};

type CollectionManagerModalProps = {
  open: boolean;
  collections: Collection[];
  references: AcademiqReference[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (collectionId: string) => void;
  onDelete: (collectionId: string, options?: { skipConfirm?: boolean }) => void;
  onSelect: (collectionId: string) => void;
};

export function CollectionManagerModal({
  open,
  collections,
  references,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onSelect
}: CollectionManagerModalProps) {
  const [name, setName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; x: number; y: number } | null>(null);
  const count = (collectionId: string) => references.filter((ref) => (
    Array.isArray(ref.collectionIds) && ref.collectionIds.some((id) => String(id) === String(collectionId))
  )).length;
  const openDeleteConfirm = (event: MouseEvent<HTMLButtonElement>, collectionId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDeleteConfirm({
      id: collectionId,
      x: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 304)),
      y: Math.max(12, Math.min(rect.top - 8, window.innerHeight - 168))
    });
  };
  const confirmDelete = () => {
    if (!deleteConfirm) return;
    onDelete(deleteConfirm.id, { skipConfirm: true });
    setDeleteConfirm(null);
  };

  return (
    <Modal title="Klasörleri Yönet" open={open} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const nextName = name.trim();
            if (!nextName) return;
            onCreate(nextName);
            setName('');
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy"
            placeholder="Yeni klasör adı..."
          />
          <button type="submit" className="rounded-md bg-aq-navy px-4 text-xs font-semibold text-white">Ekle</button>
        </form>

        <div className="max-h-80 space-y-2 overflow-auto">
          {collections.map((collection) => (
            <div key={collection.id} className="flex items-center gap-2 rounded-lg border border-aq-line bg-white p-2">
              <button
                type="button"
                onClick={() => onSelect(collection.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate font-semibold text-aq-ink">{collection.name}</div>
                <div className="text-xs text-aq-muted">{count(collection.id)} kaynak</div>
              </button>
              <button type="button" onClick={() => onRename(collection.id)} className="rounded-md border border-aq-line px-2 py-1 text-xs font-semibold hover:bg-aq-panel">Yeniden Adlandır</button>
              <button type="button" onClick={(event) => openDeleteConfirm(event, collection.id)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50">Sil</button>
            </div>
          ))}
          {!collections.length ? (
            <div className="rounded-lg border border-dashed border-aq-line p-8 text-center text-sm text-aq-muted">
              Henüz klasör yok.
            </div>
          ) : null}
        </div>
        {deleteConfirm ? (
          <div className="fixed inset-0 z-[3100]" onClick={() => setDeleteConfirm(null)}>
            <div
              className="absolute w-[288px] rounded-[13px] border border-aq-line/90 bg-white/95 p-3 text-xs text-aq-ink shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
              style={{ left: deleteConfirm.x, top: deleteConfirm.y }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="Klasörü sil"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Klasör</div>
              <div className="mt-1 font-semibold">Klasör silinsin mi?</div>
              <p className="mt-1 leading-5 text-aq-muted">Kaynaklar silinmez, sadece klasör bağlantısı kaldırılır.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setDeleteConfirm(null)} className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted hover:bg-aq-panel">Vazgeç</button>
                <button type="button" onClick={confirmDelete} className="h-8 rounded-md bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800">Sil</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
