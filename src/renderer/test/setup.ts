import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Stub the IPC bridge so components that touch window.electronAPI don't crash
// in jsdom. Tests that need specific IPC behavior should override per-test.
const stubIpc = new Proxy({}, {
  get: () => async () => ({ ok: true })
});
const stubOcr = { recognize: async () => ({ ok: true, text: '' }) };

if (!(window as any).electronAPI) Object.defineProperty(window, 'electronAPI', { value: stubIpc, writable: true });
if (!(window as any).ocrAPI) Object.defineProperty(window, 'ocrAPI', { value: stubOcr, writable: true });

afterEach(() => {
  cleanup();
});
