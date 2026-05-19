import { useEffect, useState } from 'react';
import { confirmDialog, resolveConfirmDialog, setupConfirmShim, subscribeConfirmDialog } from '../../lib/dialog';

type ConfirmRequest = {
  id: number;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'warning' | 'danger';
};

export function ConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    setupConfirmShim();
    const unsubscribe = subscribeConfirmDialog(setRequest);
    return () => {
      unsubscribe();
    };
  }, []);

  if (!request) return null;

  const toneClass = request.tone === 'danger'
    ? 'bg-red-600 hover:bg-red-700'
    : request.tone === 'warning'
      ? 'bg-amber-600 hover:bg-amber-700'
      : 'bg-aq-navy hover:bg-aq-navy/90';

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]" role="presentation">
      <div className="w-full max-w-xl rounded-lg border border-aq-line bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.22)]" role="dialog" aria-modal="true" aria-labelledby="aq-confirm-title">
        <div id="aq-confirm-title" className="text-sm font-semibold text-aq-ink">{request.title || 'Onay gerekli'}</div>
        <p className="mt-3 max-h-[45vh] overflow-auto whitespace-pre-line rounded-md border border-aq-line bg-aq-panel/40 p-3 text-sm leading-6 text-aq-muted">{request.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-aq-line bg-white px-4 text-xs font-semibold text-aq-ink hover:bg-aq-panel"
            onClick={() => resolveConfirmDialog(false)}
          >
            {request.cancelLabel || 'Vazgec'}
          </button>
          <button
            type="button"
            className={`h-9 rounded-md px-4 text-xs font-semibold text-white ${toneClass}`}
            onClick={() => resolveConfirmDialog(true)}
          >
            {request.confirmLabel || 'Tamam'}
          </button>
        </div>
      </div>
    </div>
  );
}

export { confirmDialog };
