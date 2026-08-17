import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Vitest would otherwise collect `e2e/*.spec.ts` by its default glob and
    // fail on Playwright's runner. Those specs belong to `npm run test:e2e`.
    // Listing this replaces the defaults, so the usual two are repeated here.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // jsdom has no `Worker`, so pdf.js imports its worker module directly.
    // Vite's `?url` import resolves to a server path Node cannot import, so
    // tests swap in a module exporting the same file as a `file://` URL.
    alias: [
      {
        find: /^pdfjs-dist\/build\/pdf\.worker\.mjs\?url$/,
        replacement: fileURLToPath(new URL('./src/test/pdfWorkerUrl.ts', import.meta.url)),
      },
    ],
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    target: 'esnext',
  },
});
