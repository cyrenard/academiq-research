import type { ReactNode } from 'react';

type ModalProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export function Modal({ title, open, onClose, children, wide }: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/20 p-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={['max-h-[86vh] overflow-hidden rounded-[14px] border border-aq-line/90 bg-[#fbfaf7]/95 shadow-[0_28px_90px_rgba(31,42,68,0.24)] backdrop-blur-xl', wide ? 'w-[min(1040px,96vw)]' : 'w-[min(560px,94vw)]'].join(' ')}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
      >
        <div className="flex h-12 items-center justify-between bg-white/90 px-4 shadow-[0_1px_0_rgba(222,216,205,0.72),0_10px_24px_rgba(22,27,34,0.05)]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-aq-muted">AcademiQ</div>
            <h2 className="text-sm font-semibold leading-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="h-8 rounded-md border border-aq-line bg-white px-3 text-xs font-semibold text-aq-muted shadow-sm hover:bg-aq-panel hover:text-aq-ink">Kapat</button>
        </div>
        <div className="max-h-[calc(86vh-44px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
