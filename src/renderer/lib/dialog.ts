type ConfirmRequest = {
  id: number;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'warning' | 'danger';
};

type Listener = (request: ConfirmRequest | null) => void;

let current: ConfirmRequest | null = null;
let nextId = 1;
let resolver: ((value: boolean) => void) | null = null;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener(current));
}

export function subscribeConfirmDialog(listener: Listener) {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

export function resolveConfirmDialog(value: boolean) {
  const done = resolver;
  resolver = null;
  current = null;
  notify();
  if (done) done(value);
}

type ConfirmDialogInput = string | {
  title?: string;
  message?: unknown;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'warning' | 'danger';
};

export function confirmDialog(input: ConfirmDialogInput): Promise<boolean> {
  if (resolver) {
    resolveConfirmDialog(false);
  }
  const options = input && typeof input === 'object' ? input : { message: input };
  current = {
    id: nextId++,
    title: options.title,
    message: typeof options.message === 'string' ? options.message : String(options.message ?? ''),
    confirmLabel: options.confirmLabel,
    cancelLabel: options.cancelLabel,
    tone: options.tone
  };
  notify();
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
}

export function setupConfirmShim() {
  if (typeof window === 'undefined') return;
  (window as any).aqConfirm = confirmDialog;
}
