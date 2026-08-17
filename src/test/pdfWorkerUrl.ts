/**
 * Test-only stand-in for Vite's `pdfjs-dist/build/pdf.worker.mjs?url` import.
 *
 * In a browser that import yields an HTTP URL, which is exactly what pdf.js
 * needs. Under jsdom there is no `Worker`, so pdf.js falls back to a fake
 * worker and *imports* `workerSrc` itself — and Node cannot import an HTTP-ish
 * path like `/node_modules/...`. Resolving the same file to a `file://` URL
 * keeps the engine code identical in both environments while letting the
 * real worker code run in tests.
 *
 * Wired up by the `test.alias` entry in `vite.config.ts`.
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

export default pathToFileURL(require.resolve('pdfjs-dist/build/pdf.worker.mjs')).href;
