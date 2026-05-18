import { useEffect, useState } from 'react';
import { confirmDialog, resolveConfirmDialog, setupConfirmShim, subscribeConfirmDialog } from '../../lib/dialog';

type ConfirmRequest = {
  id: number;
  message: string;
};

export function ConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    setupConfirmShim();
    return subscribeConfirmDialog(setRequest);
  }, []);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/35 px-4" role="presentation">
      <div className="w-full max-w-md rounded-lg border border-aq-line bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.22)]" role="dialog" aria-modal="true" aria-labelledby="aq-confirm-title">
        <div id="aq-confirm-title" className="text-sm font-semibold text-aq-ink">Onay gerekli</div>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-aq-muted">{request.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="h-9 rounded-md border border-aq-line bg-white px-4 text-xs font-semibold text-aq-ink hover:bg-aq-panel"
            onClick={() => resolveConfirmDialog(false)}
          >
            Vazgeç
          </button>
          <button
            type="button"
            className="h-9 rounded-md bg-aq-navy px-4 text-xs font-semibold text-white hover:bg-aq-navy/90"
            onClick={() => resolveConfirmDialog(true)}
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
}

export { confirmDialog };
