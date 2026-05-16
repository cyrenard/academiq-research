/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  return {
    plugins: [react()],
    root: '.',
    base: './',
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true,
      // Keep sourcemaps for production crash diagnostics but use 'hidden' so
      // they're not referenced from the bundle (they ship for symbolication
      // without bloating page-load).
      sourcemap: isProd ? 'hidden' : true,
      rollupOptions: {
        input: 'index.html',
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          }
        }
      }
    },
    // Strip debugger statements and dead-code-eliminate informational console
    // calls from production. console.error / console.warn are kept so genuine
    // failures still surface in DevTools.
    // (Vite's ESBuildOptions type misses drop/pure; the underlying esbuild
    // supports both — see https://esbuild.github.io/api/#drop)
    esbuild: isProd
      ? ({
          drop: ['debugger'],
          pure: ['console.log', 'console.debug', 'console.info', 'console.trace']
        } as never)
      : {},
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/renderer/test/setup.ts'],
      include: ['src/renderer/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/src-tauri/**']
    }
  };
});
