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
        className={['max-h-[86vh] overflow-hidden rounded-[10px] border border-aq-line bg-[#fbfaf7] shadow-[0_24px_70px_rgba(31,42,68,0.20)]', wide ? 'w-[min(1040px,96vw)]' : 'w-[min(560px,94vw)]'].join(' ')}
        onPointerDownCapture={(event) => event.stopPropagation()}
        onMouseDownCapture={(event) => event.stopPropagation()}
      >
        <div className="flex h-11 items-center justify-between border-b border-aq-line bg-white px-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="h-7 rounded-md px-2.5 text-xs font-semibold text-aq-muted hover:bg-aq-panel">Kapat</button>
        </div>
        <div className="max-h-[calc(86vh-44px)] overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}
