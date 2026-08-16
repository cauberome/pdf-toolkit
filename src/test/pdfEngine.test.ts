import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePdfs, editPdf, splitPdf, imagesToPdf } from '../engine/pdfEngine';
import { PdfSource } from '../engine/types';
import { ProcessingError, ProcessingErrorCode, isProcessingError } from '../engine/errors';
import {
  createTestPdf,
  createEncryptedLikePdf,
  createPngBytes,
  createJpegBytes,
  pageWidths,
  pageSizes,
  widthForPage,
  asFile,
} from './fixtures';

function source(bytes: Uint8Array, name = 'source.pdf'): PdfSource {
  return { id: name, name, bytes };
}

/** Asserts the promise rejects with a ProcessingError carrying `code`. */
async function expectCode(promise: Promise<unknown>, code: ProcessingErrorCode): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(isProcessingError(err)).toBe(true);
    expect((err as ProcessingError).code).toBe(code);
    return;
  }
  throw new Error(`expected rejection with code ${code}, but the promise resolved`);
}

describe('BE-02 — merge engine', () => {
  it('concatenates sources in the given order, page order preserved within each', async () => {
    const first = await createTestPdf(2); // widths 100, 110
    const second = await createTestPdf(3, 10); // widths 200, 210, 220

    const merged = await mergePdfs([source(first, 'a.pdf'), source(second, 'b.pdf')]);

    expect(await pageWidths(merged)).toEqual([100, 110, 200, 210, 220]);
  });

  it('reverses output when the source order is reversed', async () => {
    const first = await createTestPdf(2);
    const second = await createTestPdf(3, 10);

    const merged = await mergePdfs([source(second, 'b.pdf'), source(first, 'a.pdf')]);

    expect(await pageWidths(merged)).toEqual([200, 210, 220, 100, 110]);
  });

  it('merges the same document with itself without aliasing pages', async () => {
    const bytes = await createTestPdf(2);
    const merged = await mergePdfs([source(bytes, 'a.pdf'), source(bytes, 'a-copy.pdf')]);
    expect(await pageWidths(merged)).toEqual([100, 110, 100, 110]);
  });

  it('produces a document that carries no metadata from its sources', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([100, 400]);
    doc.setTitle('Confidential Source Title');
    doc.setAuthor('Source Author');
    const titled = await doc.save();

    const merged = await mergePdfs([source(titled, 'a.pdf'), source(await createTestPdf(1), 'b.pdf')]);

    const loaded = await PDFDocument.load(merged);
    expect(loaded.getTitle()).toBeUndefined();
    expect(loaded.getAuthor()).toBeUndefined();
  });

  it('requires at least two documents', async () => {
    const only = source(await createTestPdf(2), 'a.pdf');
    await expectCode(mergePdfs([only]), 'INVALID_SELECTION');
    await expectCode(mergePdfs([]), 'INVALID_SELECTION');
  });

  it('names the offending file when one source in the set is invalid', async () => {
    const good = source(await createTestPdf(2), 'good.pdf');
    const bad = source(new TextEncoder().encode('not a pdf at all'), 'bad.pdf');

    try {
      await mergePdfs([good, bad]);
      throw new Error('expected rejection');
    } catch (err) {
      expect((err as ProcessingError).code).toBe('NOT_A_PDF');
      expect((err as ProcessingError).fileName).toBe('bad.pdf');
    }
  });

  it('rejects a zero-byte source', async () => {
    const good = source(await createTestPdf(2), 'good.pdf');
    await expectCode(mergePdfs([good, source(new Uint8Array(0), 'empty.pdf')]), 'EMPTY_FILE');
  });

  it('rejects a password-protected source', async () => {
    const good = source(await createTestPdf(2), 'good.pdf');
    const locked = source(await createEncryptedLikePdf(), 'locked.pdf');
    await expectCode(mergePdfs([good, locked]), 'ENCRYPTED_PDF');
  });
});

describe('BE-02 — page editing engine', () => {
  it('retains pages in the exact sequence requested', async () => {
    const bytes = await createTestPdf(5); // widths 100..140
    const edited = await editPdf(source(bytes), [4, 0, 2]);
    expect(await pageWidths(edited)).toEqual([widthForPage(4), widthForPage(0), widthForPage(2)]);
  });

  it('supports deletion by omission', async () => {
    const bytes = await createTestPdf(4);
    const edited = await editPdf(source(bytes), [0, 2]);
    expect(await pageWidths(edited)).toEqual([100, 120]);
  });

  it('supports duplicating a retained page', async () => {
    const bytes = await createTestPdf(3);
    const edited = await editPdf(source(bytes), [1, 1]);
    expect(await pageWidths(edited)).toEqual([110, 110]);
  });

  it('preserves page height as well as width', async () => {
    const bytes = await createTestPdf(2);
    expect(await pageSizes(await editPdf(source(bytes), [1]))).toEqual([[110, 400]]);
  });

  it('refuses to produce a zero-page document', async () => {
    const bytes = await createTestPdf(3);
    await expectCode(editPdf(source(bytes), []), 'INVALID_SELECTION');
  });

  it('rejects page indexes outside the document', async () => {
    const bytes = await createTestPdf(3);
    await expectCode(editPdf(source(bytes), [0, 3]), 'PAGE_OUT_OF_RANGE');
    await expectCode(editPdf(source(bytes), [-1]), 'PAGE_OUT_OF_RANGE');
  });

  it('rejects an unreadable document before touching the selection', async () => {
    const junk = source(new TextEncoder().encode('%PDF-1.7 but truncated garbage'), 'broken.pdf');
    await expectCode(editPdf(junk, [0]), 'CORRUPT_PDF');
  });
});

describe('BE-03 — split engine', () => {
  it('creates one document per group with the requested pages in order', async () => {
    const bytes = await createTestPdf(6); // widths 100..150
    const outputs = await splitPdf(source(bytes), [[0, 1], [2, 3, 4], [5]]);

    expect(outputs.length).toBe(3);
    expect(await pageWidths(outputs[0])).toEqual([100, 110]);
    expect(await pageWidths(outputs[1])).toEqual([120, 130, 140]);
    expect(await pageWidths(outputs[2])).toEqual([150]);
  });

  it('honours non-sequential page order inside a group', async () => {
    const bytes = await createTestPdf(4);
    const outputs = await splitPdf(source(bytes), [[3, 0]]);
    expect(await pageWidths(outputs[0])).toEqual([130, 100]);
  });

  it('supports every-page mode', async () => {
    const bytes = await createTestPdf(3);
    const outputs = await splitPdf(source(bytes), [[0], [1], [2]]);
    expect(outputs.length).toBe(3);
    expect(await pageWidths(outputs[1])).toEqual([110]);
  });

  it('allows the same page to appear in different groups', async () => {
    const bytes = await createTestPdf(3);
    const outputs = await splitPdf(source(bytes), [[0], [0, 1]]);
    expect(await pageWidths(outputs[0])).toEqual([100]);
    expect(await pageWidths(outputs[1])).toEqual([100, 110]);
  });

  it('rejects duplicates inside a single group', async () => {
    const bytes = await createTestPdf(3);
    await expectCode(splitPdf(source(bytes), [[0, 0]]), 'INVALID_SELECTION');
  });

  it('rejects empty group lists and empty groups', async () => {
    const bytes = await createTestPdf(3);
    await expectCode(splitPdf(source(bytes), []), 'INVALID_SELECTION');
    await expectCode(splitPdf(source(bytes), [[0], []]), 'INVALID_SELECTION');
  });

  it('rejects out-of-range pages', async () => {
    const bytes = await createTestPdf(3);
    await expectCode(splitPdf(source(bytes), [[0], [5]]), 'PAGE_OUT_OF_RANGE');
  });
});

describe('BE-04 — images-to-PDF engine', () => {
  it('sizes each page to its image, preserving aspect ratio', async () => {
    const wide = asFile(createPngBytes(120, 40), 'wide.png', 'image/png');
    const tall = asFile(createPngBytes(30, 90), 'tall.png', 'image/png');

    const pdf = await imagesToPdf([wide, tall]);

    expect(await pageSizes(pdf)).toEqual([
      [120, 40],
      [30, 90],
    ]);
  });

  it('preserves input order', async () => {
    const files = [
      asFile(createPngBytes(10, 10), 'a.png', 'image/png'),
      asFile(createPngBytes(20, 20), 'b.png', 'image/png'),
      asFile(createPngBytes(30, 30), 'c.png', 'image/png'),
    ];

    expect(await pageSizes(await imagesToPdf(files))).toEqual([
      [10, 10],
      [20, 20],
      [30, 30],
    ]);
  });

  it('keeps order across mixed PNG and JPEG input', async () => {
    const files = [
      asFile(createPngBytes(50, 25), 'first.png', 'image/png'),
      asFile(createJpegBytes(), 'second.jpg', 'image/jpeg'),
      asFile(createPngBytes(70, 35), 'third.png', 'image/png'),
    ];

    expect(await pageSizes(await imagesToPdf(files))).toEqual([
      [50, 25],
      [1, 1],
      [70, 35],
    ]);
  });

  it('accepts transparent PNGs without changing page dimensions', async () => {
    const transparent = asFile(createPngBytes(64, 48, 0), 'alpha.png', 'image/png');
    const opaque = asFile(createPngBytes(64, 48, 255), 'opaque.png', 'image/png');

    expect(await pageSizes(await imagesToPdf([transparent]))).toEqual([[64, 48]]);
    expect(await pageSizes(await imagesToPdf([opaque]))).toEqual([[64, 48]]);
  });

  it('produces one page per image', async () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      asFile(createPngBytes(10 + i, 10), `img-${i}.png`, 'image/png'),
    );
    const loaded = await PDFDocument.load(await imagesToPdf(files));
    expect(loaded.getPageCount()).toBe(5);
  });

  it('requires at least one image', async () => {
    await expectCode(imagesToPdf([]), 'INVALID_SELECTION');
  });

  it('rejects a file whose bytes are not a supported image, whatever its name', async () => {
    const disguised = asFile(new TextEncoder().encode('GIF89a not really a png'), 'sneaky.png', 'image/png');
    await expectCode(imagesToPdf([disguised]), 'UNSUPPORTED_IMAGE');
  });

  it('rejects a zero-byte image', async () => {
    await expectCode(
      imagesToPdf([asFile(new Uint8Array(0), 'empty.png', 'image/png')]),
      'EMPTY_FILE',
    );
  });
});
