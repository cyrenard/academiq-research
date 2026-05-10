import { useEffect, useRef, useState } from 'react';
import { Modal } from '../ui/Modal';

type WorkspaceNameModalProps = {
  open: boolean;
  title?: string;
  defaultName: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

export function WorkspaceNameModal({ open, title = 'Yeni Çalışma Alanı', defaultName, onClose, onSubmit }: WorkspaceNameModalProps) {
  const [name, setName] = useState(defaultName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [defaultName, open]);

  return (
    <Modal title={title} open={open} onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          onSubmit(trimmed);
        }}
      >
        <label className="block space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aq-ink">Çalışma alanı adı:</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-10 w-full rounded-md border border-aq-line bg-white px-3 text-sm outline-none focus:border-aq-navy focus:ring-2 focus:ring-aq-navy/15"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md px-4 text-sm text-aq-muted hover:bg-aq-panel">
            İptal
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-9 rounded-md bg-aq-navy px-4 text-sm font-semibold text-white transition hover:bg-aq-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Tamam
          </button>
        </div>
      </form>
    </Modal>
  );
}
