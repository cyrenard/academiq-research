import { useEffect, useState } from 'react';
import { Modal } from '../../ui/Modal';
import type { AcademiqReference } from '../../../lib/app-state';

type ReferenceEditModalProps = {
  open: boolean;
  reference: AcademiqReference | null;
  onClose: () => void;
  onUpdate: (referenceId: string, patch: Record<string, unknown>) => void;
  onDelete: (referenceId: string) => void;
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
              onClick={() => onDelete(reference.id)}
            >Sil</button>
          </div>
        </div>
      ) : (
        <div className="text-sm text-aq-muted">Kaynak seçilmedi.</div>
      )}
    </Modal>
  );
}
