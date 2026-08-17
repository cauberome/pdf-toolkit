import { describe, expect, it } from 'vitest';
import { openPdfDocument } from '../engine/pdfDocument';
import { createTestPdf } from './fixtures';

describe('shared PDF.js document loader', () => {
  it('opens a valid source without detaching the caller bytes', async () => {
    const bytes = await createTestPdf(2);
    const originalLength = bytes.byteLength;
    const document = await openPdfDocument({
      id: 'two-pages',
      name: 'two-pages.pdf',
      bytes,
    });

    expect(document.numPages).toBe(2);
    expect(bytes.byteLength).toBe(originalLength);
    await document.destroy();
  });

  it('refuses an empty or mislabeled source before reaching pdf.js', async () => {
    await expect(
      openPdfDocument({ id: 'empty', name: 'empty.pdf', bytes: new Uint8Array(0) }),
    ).rejects.toMatchObject({ code: 'EMPTY_FILE' });

    await expect(
      openPdfDocument({
        id: 'text',
        name: 'notes.pdf',
        bytes: new TextEncoder().encode('plain text, not a document'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_A_PDF' });
  });

  it('classifies a damaged document as a recoverable CORRUPT_PDF', async () => {
    const bytes = await createTestPdf(1);
    // Keep the %PDF header so validation passes and pdf.js is the one to fail.
    const damaged = bytes.slice(0, 40);

    await expect(
      openPdfDocument({ id: 'damaged', name: 'damaged.pdf', bytes: damaged }),
    ).rejects.toMatchObject({ code: 'CORRUPT_PDF', recoverable: true });
  });
});
