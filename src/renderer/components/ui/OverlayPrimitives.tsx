import type { ReactNode } from 'react';
import { Modal } from './Modal';

export function ConfirmDialog({ open, title, detail, onCancel, onConfirm }: { open: boolean; title: string; detail?: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {detail ? <p className="mb-4 text-sm text-aq-muted">{detail}</p> : null}
      <div className="flex justify-end gap-2">
        <button className="rounded-md border border-aq-line px-3 py-2 text-sm font-semibold" onClick={onCancel}>Vazge?</button>
        <button className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white" onClick={onConfirm}>Onayla</button>
      </div>
    </Modal>
  );
}

export function Drawer({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-y-0 right-0 z-[1000] w-[420px] border-l border-aq-line bg-aq-paper shadow-[0_18px_56px_rgba(31,42,68,0.18)]"><div className="flex h-11 items-center justify-between border-b border-aq-line px-4"><strong className="text-sm">{title}</strong><button className="h-7 rounded-md px-2.5 text-xs font-semibold text-aq-muted hover:bg-aq-panel" onClick={onClose}>Kapat</button></div><div className="h-[calc(100%-2.75rem)] overflow-auto p-4">{children}</div></div>;
}

export function Popover({ open, children }: { open: boolean; children: ReactNode }) {
  return open ? <div className="absolute z-[1000] rounded-lg border border-aq-line bg-white p-1.5 shadow-[0_14px_38px_rgba(31,42,68,0.16)]">{children}</div> : null;
}

export function DropdownMenu({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-aq-line bg-white p-1 shadow-[0_14px_38px_rgba(31,42,68,0.16)]">{children}</div>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return <span title={label}>{children}</span>;
}

export function ContextMenu({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-aq-line bg-white p-1 shadow-[0_16px_44px_rgba(31,42,68,0.18)]">{children}</div>;
}

export function Toast({ message }: { message: string }) {
  if (!message) return null;
  return <div className="fixed bottom-8 left-1/2 z-[1000] -translate-x-1/2 rounded-md bg-aq-navy px-4 py-2 text-sm font-semibold text-white shadow-lg">{message}</div>;
}
