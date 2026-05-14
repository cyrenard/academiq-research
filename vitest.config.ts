import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom for React component tests; node for pure-logic tests
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/renderer/test/setup.ts'],
    include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.{ts,tsx}'],
      exclude: ['src/renderer/**/*.{test,spec}.{ts,tsx}', 'src/renderer/test/**']
    }
  }
});
