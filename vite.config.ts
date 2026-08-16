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
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
  build: {
    target: 'esnext',
  },
});
