/**
 * The single place this application configures pdf.js and opens a document.
 *
 * Rendering (thumbnails, page images) and text extraction both need a
 * `PDFDocumentProxy`, and both need the same three guarantees: the worker is
 * resolved from the local bundle, the caller's bytes survive the call, and a
 * failure arrives as a typed `ProcessingError`. Keeping one boundary means a
 * change to any of those cannot apply to one feature and miss the other.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Bundled locally by Vite rather than fetched from a CDN, so no document byte
// ever needs a network round trip and the app works from any base path.
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PdfSource } from './types';
import { assertValidPdfBytes } from './validation';
import { toProcessingError } from './errors';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Opens a document with pdf.js after signature validation.
 *
 * The byte array is copied because pdf.js transfers ownership of the buffer to
 * the worker, which would detach the caller's copy and break every later
 * operation on the same file.
 */
export async function openPdfDocument(source: PdfSource): Promise<PDFDocumentProxy> {
  assertValidPdfBytes(source.bytes, source.name);
  try {
    return await pdfjsLib.getDocument({ data: source.bytes.slice(0) }).promise;
  } catch (error) {
    throw toProcessingError(error, 'CORRUPT_PDF', source.name);
  }
}
