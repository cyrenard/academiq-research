import { useEffect, useMemo, useState } from 'react';
import type { AcademiqReference } from '../../lib/app-state';
import {
  countReferencesWithLabel,
  REFERENCE_LABEL_COLORS,
  type ReferenceLabel
} from '../../lib/reference-label-state';
import { Modal } from '../ui/Modal';

type LabelManagerModalProps = {
  open: boolean;
  labels: ReferenceLabel[];
  references: AcademiqReference[];
  onClose: () => void;
  onCreate: (name: string, color?: string) => void;
  onUpdate: (currentName: string, label: ReferenceLabel) => void;
  onDelete: (name: string, options?: { skipConfirm?: boolean }) => void;
};

type LabelDraft = { name: string; color: string };

export function LabelManagerModal({
  open,
  labels,
  references,
  onClose,
  onCreate,
  onUpdate,
  onDelete
}: LabelManagerModalProps) {
  const [newLabel, setNewLabel] = useState<LabelDraft>({ name: '', color: REFERENCE_LABEL_COLORS[0] });
  const [drafts, setDrafts] = useState<Record<string, LabelDraft>>({});
  const [deleteName, setDeleteName] = useState('');

  useEffect(() => {
    if (!open) return;
    setDrafts(Object.fromEntries(labels.map((label) => [
      label.name,
      { name: label.name, color: label.color || '#9ca3af' }
    ])));
    setDeleteName('');
  }, [labels, open]);

  const labelNames = useMemo(
    () => new Set(labels.map((label) => label.name.toLowerCase())),
    [labels]
  );

  const create = () => {
    const name = newLabel.name.trim();
    if (!name || labelNames.has(name.toLowerCase())) return;
    onCreate(name, newLabel.color);
    setNewLabel((current) => ({ ...current, name: '' }));
  };

  return (
    <Modal title="Etiketleri Yönet" open={open} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <form
          className="grid grid-cols-[minmax(0,1fr)_44px_auto] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
        >
          <input
            aria-label="Yeni etiket adı"
            value={newLabel.name}
            onChange={(event) => setNewLabel((current) => ({ ...current, name: event.target.value }))}
            className="h-9 min-w-0 rounded-md border border-aq-line bg-white px-3 outline-none focus:border-aq-navy"
            placeholder="Yeni etiket adı..."
          />
          <input
            aria-label="Yeni etiket rengi"
            type="color"
            value={newLabel.color}
            onChange={(event) => setNewLabel((current) => ({ ...current, color: event.target.value }))}
            className="h-9 w-11 cursor-pointer rounded-md border border-aq-line bg-white p-1"
          />
          <button
            type="submit"
            disabled={!newLabel.name.trim() || labelNames.has(newLabel.name.trim().toLowerCase())}
            className="rounded-md bg-aq-navy px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Ekle
          </button>
        </form>

        <div className="max-h-80 space-y-2 overflow-auto">
          {labels.map((label) => {
            const draft = drafts[label.name] || { name: label.name, color: label.color || '#9ca3af' };
            const duplicate = draft.name.trim().toLowerCase() !== label.name.toLowerCase()
              && labelNames.has(draft.name.trim().toLowerCase());
            const changed = draft.name.trim() !== label.name || draft.color !== (label.color || '#9ca3af');
            return (
              <div key={label.name} className="rounded-lg border border-aq-line bg-white p-2">
                <div className="grid grid-cols-[minmax(0,1fr)_44px_auto_auto] items-center gap-2">
                  <div className="min-w-0">
                    <input
                      aria-label={`${label.name} adı`}
                      value={draft.name}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [label.name]: { ...draft, name: event.target.value }
                      }))}
                      className="h-8 w-full rounded-md border border-aq-line px-2 text-sm font-semibold outline-none focus:border-aq-navy"
                    />
                    <div className="mt-1 text-[11px] text-aq-muted">{countReferencesWithLabel(references, label.name)} kaynak</div>
                  </div>
                  <input
                    aria-label={`${label.name} rengi`}
                    type="color"
                    value={draft.color}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [label.name]: { ...draft, color: event.target.value }
                    }))}
                    className="h-8 w-11 cursor-pointer rounded-md border border-aq-line bg-white p-1"
                  />
                  <button
                    type="button"
                    disabled={!changed || !draft.name.trim() || duplicate}
                    onClick={() => onUpdate(label.name, { name: draft.name.trim(), color: draft.color })}
                    className="rounded-md border border-aq-line px-2 py-1 text-xs font-semibold hover:bg-aq-panel disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Kaydet
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteName(label.name)}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Sil
                  </button>
                </div>
                {duplicate ? <div className="mt-1 text-[11px] text-red-700">Bu adda başka bir etiket var.</div> : null}
                {deleteName === label.name ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-red-50 p-2 text-xs text-red-900">
                    <span>Etiket tüm kaynaklardan kaldırılsın mı?</span>
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => setDeleteName('')} className="rounded border border-red-200 bg-white px-2 py-1 font-semibold">Vazgeç</button>
                      <button type="button" onClick={() => { onDelete(label.name, { skipConfirm: true }); setDeleteName(''); }} className="rounded bg-red-700 px-2 py-1 font-semibold text-white">Sil</button>
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!labels.length ? (
            <div className="rounded-lg border border-dashed border-aq-line p-8 text-center text-aq-muted">
              Henüz etiket yok.
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
