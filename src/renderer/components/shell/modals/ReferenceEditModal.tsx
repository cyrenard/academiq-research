import { useEffect, useState, type MouseEvent } from 'react';
import { Modal } from '../../ui/Modal';
import type { AcademiqReference } from '../../../lib/app-state';

type ReferenceEditModalProps = {
  open: boolean;
  reference: AcademiqReference | null;
  onClose: () => void;
  onUpdate: (referenceId: string, patch: Record<string, unknown>) => void;
  onDelete: (referenceId: string, options?: { skipConfirm?: boolean }) => void;
};

const FIELDS: Array<[string, string]> = [
  ['title', 'Başlık'],
  ['authors', 'Yazarlar (; ile ayır)'],
  ['year', 'Yıl'],
  ['doi', 'DOI'],
  ['url', 'URL'],
  ['journal', 'Dergi']
];

/**
 * Reference edit modal — populated from `reference` prop, owns its own
 * draft state. On save, splits authors by `;` and dispatches a patch
 * to the parent. On delete, calls onDelete with the reference id.
 *
 * Extracted from FeatureModals.tsx so the parent stays focused on
 * shared modal state and orchestration.
 */
export function ReferenceEditModal({
  open,
  reference,
  onClose,
  onUpdate,
  onDelete
}: ReferenceEditModalProps) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open || !reference) return;
    setDraft({
      title: String(reference.title || ''),
      authors: Array.isArray(reference.authors) ? reference.authors.join('; ') : String(reference.authors || ''),
      year: String(reference.year || ''),
      doi: String(reference.doi || ''),
      url: String(reference.url || ''),
      journal: String(reference.journal || ''),
      abstract: String(reference.abstract || '')
    });
  }, [open, reference]);

  const save = () => {
    if (!reference) return;
    onUpdate(reference.id, {
      title: draft.title,
      authors: (draft.authors || '').split(';').map((item) => item.trim()).filter(Boolean),
      year: draft.year,
      doi: draft.doi,
      url: draft.url,
      journal: draft.journal,
      abstract: draft.abstract
    });
    onClose();
  };

  const openDeleteConfirm = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDeleteConfirm({
      x: Math.max(12, Math.min(rect.right + 8, window.innerWidth - 304)),
      y: Math.max(12, Math.min(rect.top - 8, window.innerHeight - 168))
    });
  };

  const confirmDelete = () => {
    if (!reference) return;
    onDelete(reference.id, { skipConfirm: true });
    setDeleteConfirm(null);
    onClose();
  };

  return (
    <Modal title="Kaynak Detayı" open={open} onClose={onClose}>
      {reference ? (
        <div className="space-y-3 text-sm">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="block text-xs font-semibold text-aq-muted">
              {label}
              <input
                value={draft[key] || ''}
                onChange={(event) => setDraft((d) => ({ ...d, [key]: event.target.value }))}
                className="mt-1 h-9 w-full rounded-md border border-aq-line bg-white px-3 text-sm font-normal text-aq-ink outline-none"
              />
            </label>
          ))}
          <label className="block text-xs font-semibold text-aq-muted">
            Abstract
            <textarea
              value={draft.abstract || ''}
              onChange={(event) => setDraft((d) => ({ ...d, abstract: event.target.value }))}
              className="mt-1 h-24 w-full resize-none rounded-md border border-aq-line bg-white px-3 py-2 text-sm font-normal text-aq-ink outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              className="rounded-md bg-aq-navy px-3 py-2 text-xs font-semibold text-white"
              onClick={save}
            >Kaydet</button>
            <button
              className="rounded-md border border-aq-line bg-white px-3 py-2 text-xs font-semibold text-red-700"
              onClick={openDeleteConfirm}
            >Sil</button>
          </div>
          {deleteConfirm ? (
            <div className="fixed inset-0 z-[3100]" onClick={() => setDeleteConfirm(null)}>
              <div
                className="absolute w-[288px] rounded-[13px] border border-aq-line/90 bg-white/95 p-3 text-xs text-aq-ink shadow-[0_24px_64px_rgba(22,27,34,0.20)] backdrop-blur-xl"
                style={{ left: deleteConfirm.x, top: deleteConfirm.y }}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Kaynağı sil"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-aq-muted">Kaynak</div>
                <div className="mt-1 font-semibold">Kaynak silinsin mi?</div>
                <p className="mt-1 leading-5 text-aq-muted">Kaynak aktif çalışma alanından kaldırılır. Bağlı PDF de temizlenir.</p>
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted hover:bg-aq-panel">Vazgeç</button>
                  <button type="button" onClick={confirmDelete} className="h-8 rounded-md bg-red-700 px-3 text-xs font-semibold text-white hover:bg-red-800">Sil</button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="text-sm text-aq-muted">Kaynak seçilmedi.</div>
      )}
    </Modal>
  );
}
