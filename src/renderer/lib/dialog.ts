type ConfirmRequest = {
  id: number;
  message: string;
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

export function confirmDialog(message: unknown): Promise<boolean> {
  if (resolver) {
    resolveConfirmDialog(false);
  }
  current = {
    id: nextId++,
    message: typeof message === 'string' ? message : String(message ?? '')
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
