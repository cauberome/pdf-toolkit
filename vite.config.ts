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
    // Three suites open real documents with pdf.js under jsdom — the loader,
    // the text extractor, and the conversion panel, whose page count is
    // deliberately not mocked. The first such load in a worker pays for
    // importing and warming the worker module, which a cold CI runner does not
    // finish inside Vitest's 5-second default; the panel's own 10-second
    // `findByRole` wait could never be reached under it.
    testTimeout: 15_000,
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
