import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  addPagesToPdf,
  compressPdf,
  compressionAttempts,
  cropPdf,
  displayedPageSize,
  marginsInPageSpace,
  validateCropMargins,
} from '../engine/advancedPdfEngine';
import { ProcessingError } from '../engine/errors';
import { PdfSource } from '../engine/types';
import {
  asFile,
  createEncryptedLikePdf,
  createPngBytes,
  createRotatedTestPdf,
  createTestPdf,
  pageSizes,
  pageWidths,
} from './fixtures';

function source(bytes: Uint8Array, name = 'source.pdf'): PdfSource {
  return { id: name, name, bytes };
}

async function firstPage(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages()[0];
}

async function cropBoxes(bytes: Uint8Array) {
  return (await PDFDocument.load(bytes)).getPages().map((page) => page.getCropBox());
}

describe('BE-08 — compression planning', () => {
  it('uses one deterministic attempt for each automatic preset', () => {
    expect(compressionAttempts({ mode: 'auto', preset: 'quality' })).toEqual([
      { scale: 2, quality: 0.88 },
    ]);
    expect(compressionAttempts({ mode: 'auto', preset: 'balanced' })).toEqual([
      { scale: 1, quality: 0.72 },
    ]);
    expect(compressionAttempts({ mode: 'auto', preset: 'smallest' })).toEqual([
      { scale: 1, quality: 0.48 },
    ]);
  });

  it('orders target attempts from highest to lowest fidelity', () => {
    const attempts = compressionAttempts({ mode: 'target', targetBytes: 500_000 });
    expect(attempts).toHaveLength(5);
    expect(attempts[0]).toEqual({ scale: 2, quality: 0.88 });
    expect(attempts.at(-1)).toEqual({ scale: 1, quality: 0.3 });
  });

  it('rejects non-positive target sizes', () => {
    expect(() => compressionAttempts({ mode: 'target', targetBytes: 0 })).toThrow(
      ProcessingError,
    );
  });

  it('returns an already-small source without rasterising it', async () => {
    const bytes = await createTestPdf(2);
    const result = await compressPdf(source(bytes), {
      mode: 'target',
      targetBytes: bytes.length + 1,
    });
    expect(result.bytes).toBe(bytes);
    expect(result.outputBytes).toBe(bytes.length);
    expect(result.targetReached).toBe(true);
    expect(result.rasterized).toBe(false);
    expect(result.attempts).toBe(0);
  });

  it('still validates a source that is already under the target', async () => {
    // The shortcut above must not become a way to hand back an unusable file
    // as a finished compression result.
    const encrypted = source(await createEncryptedLikePdf(), 'locked.pdf');
    await expect(
      compressPdf(encrypted, { mode: 'target', targetBytes: 10_000_000 }),
    ).rejects.toMatchObject({ code: 'ENCRYPTED_PDF' });

    const notPdf = source(new TextEncoder().encode('plain text'), 'notes.txt');
    await expect(
      compressPdf(notPdf, { mode: 'target', targetBytes: 10_000_000 }),
    ).rejects.toMatchObject({ code: 'NOT_A_PDF' });

    const empty = source(new Uint8Array(0), 'empty.pdf');
    await expect(
      compressPdf(empty, { mode: 'target', targetBytes: 10_000_000 }),
    ).rejects.toMatchObject({ code: 'EMPTY_FILE' });
  });
});

describe('page geometry — display orientation', () => {
  it('reports the rotated size for quarter-turn pages', async () => {
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(0)))).toEqual({
      width: 100,
      height: 400,
    });
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(90)))).toEqual({
      width: 400,
      height: 100,
    });
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(180)))).toEqual({
      width: 100,
      height: 400,
    });
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(270)))).toEqual({
      width: 400,
      height: 100,
    });
  });

  it('normalises negative and over-turned rotations', async () => {
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(-90)))).toEqual({
      width: 400,
      height: 100,
    });
    expect(displayedPageSize(await firstPage(await createRotatedTestPdf(450)))).toEqual({
      width: 400,
      height: 100,
    });
  });

  it('measures the visible box when the crop box is smaller than the media box', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 400]);
    page.setCropBox(10, 20, 50, 200);
    expect(displayedPageSize((await PDFDocument.load(await doc.save())).getPages()[0])).toEqual({
      width: 50,
      height: 200,
    });
  });

  it('maps each visual edge onto the page edge that displays there', () => {
    const visual = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(marginsInPageSpace(visual, 0)).toEqual(visual);
    expect(marginsInPageSpace(visual, 90)).toEqual({ top: 2, right: 3, bottom: 4, left: 1 });
    expect(marginsInPageSpace(visual, 180)).toEqual({ top: 3, right: 4, bottom: 1, left: 2 });
    expect(marginsInPageSpace(visual, 270)).toEqual({ top: 4, right: 1, bottom: 2, left: 3 });
  });
});

describe('BE-09 — crop engine', () => {
  it('applies percentage margins only to selected pages', async () => {
    const bytes = await createTestPdf(3);
    const output = await cropPdf(source(bytes), [1], {
      top: 10,
      right: 20,
      bottom: 15,
      left: 5,
    });
    const pages = (await PDFDocument.load(output)).getPages();
    expect(pages[0].getCropBox()).toMatchObject({ x: 0, y: 0, width: 100, height: 400 });
    expect(pages[1].getCropBox()).toMatchObject({ x: 5.5, y: 60, width: 82.5, height: 300 });
    expect(pages[2].getCropBox()).toMatchObject({ x: 0, y: 0, width: 120, height: 400 });
  });

  it('preserves page order and physical media dimensions', async () => {
    const bytes = await createTestPdf(3);
    const output = await cropPdf(source(bytes), [0, 2], {
      top: 5,
      right: 5,
      bottom: 5,
      left: 5,
    });
    expect(await pageSizes(output)).toEqual(await pageSizes(bytes));
    expect(await pageWidths(output)).toEqual([100, 110, 120]);
  });

  it('trims the edge the person saw on a rotated page', async () => {
    // Displayed 400x100 landscape. A 10% top margin has to move the crop box's
    // left bound, because /Rotate 90 puts the page's left edge on top.
    const rotated = source(await createRotatedTestPdf(90), 'rotated.pdf');
    const output = await cropPdf(rotated, [0], { top: 10, right: 0, bottom: 0, left: 0 });
    expect((await cropBoxes(output))[0]).toMatchObject({
      x: 10,
      y: 0,
      width: 90,
      height: 400,
    });

    // The same margin on a 270 page trims the opposite bound instead.
    const counterRotated = source(await createRotatedTestPdf(270), 'rotated-270.pdf');
    const counterOutput = await cropPdf(counterRotated, [0], {
      top: 10,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect((await cropBoxes(counterOutput))[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 90,
      height: 400,
    });
  });

  it('rejects invalid margins, duplicate pages, and out-of-range pages', async () => {
    expect(() => validateCropMargins({ top: 50, right: 0, bottom: 46, left: 0 })).toThrow(
      ProcessingError,
    );
    const bytes = await createTestPdf(2);
    await expect(
      cropPdf(source(bytes), [0, 0], { top: 0, right: 0, bottom: 0, left: 0 }),
    ).rejects.toThrow(ProcessingError);
    await expect(
      cropPdf(source(bytes), [2], { top: 0, right: 0, bottom: 0, left: 0 }),
    ).rejects.toThrow(ProcessingError);
  });
});

describe('BE-10 — add pages engine', () => {
  it('inserts matching blank pages at the beginning, middle, and end', async () => {
    const bytes = await createTestPdf(2);
    const beginning = await addPagesToPdf(source(bytes), 0, {
      kind: 'blank', count: 1, size: 'match',
    });
    expect(await pageSizes(beginning)).toEqual([[100, 400], [100, 400], [110, 400]]);

    const middle = await addPagesToPdf(source(bytes), 1, {
      kind: 'blank', count: 2, size: 'letter',
    });
    expect(await pageSizes(middle)).toEqual([
      [100, 400], [612, 792], [612, 792], [110, 400],
    ]);

    const end = await addPagesToPdf(source(bytes), 2, {
      kind: 'blank', count: 1, size: 'a4',
    });
    expect(await pageSizes(end)).toEqual([[100, 400], [110, 400], [595, 842]]);
  });

  it('matches the displayed size of a rotated neighbour', async () => {
    const rotated = source(await createRotatedTestPdf(90), 'rotated.pdf');
    const output = await addPagesToPdf(rotated, 1, { kind: 'blank', count: 1, size: 'match' });
    // The neighbour displays as 400x100, so an unrotated blank page has to be
    // created 400x100 to look like it.
    expect(await pageSizes(output)).toEqual([[100, 400], [400, 100]]);
  });

  it('rejects an empty image list', async () => {
    const base = source(await createTestPdf(1), 'base.pdf');
    await expect(
      addPagesToPdf(base, 0, { kind: 'images', files: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  });

  it('inserts all imported PDF pages in source order', async () => {
    const base = source(await createTestPdf(3), 'base.pdf');
    const imported = source(await createTestPdf(2, 10), 'imported.pdf');
    const output = await addPagesToPdf(base, 1, { kind: 'pdf', source: imported });
    expect(await pageWidths(output)).toEqual([100, 200, 210, 110, 120]);
  });

  it('inserts ordered images as PDF pages', async () => {
    const base = source(await createTestPdf(1), 'base.pdf');
    const files = [
      asFile(createPngBytes(40, 20), 'wide.png', 'image/png'),
      asFile(createPngBytes(30, 60), 'tall.png', 'image/png'),
    ];
    const output = await addPagesToPdf(base, 1, { kind: 'images', files });
    expect(await pageSizes(output)).toEqual([[100, 400], [40, 20], [30, 60]]);
  });

  it('rejects invalid insertion positions and blank counts', async () => {
    const base = source(await createTestPdf(2));
    await expect(
      addPagesToPdf(base, 3, { kind: 'blank', count: 1, size: 'match' }),
    ).rejects.toThrow(ProcessingError);
    await expect(
      addPagesToPdf(base, 1, { kind: 'blank', count: 0, size: 'match' }),
    ).rejects.toThrow(ProcessingError);
  });
});
