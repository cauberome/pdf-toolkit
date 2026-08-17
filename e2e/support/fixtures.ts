/**
 * Node-side fixture builders for the end-to-end suite.
 *
 * Documents are built here rather than in the browser because
 * `src/test/fixtures.ts` reaches for `node:zlib`. Bytes cross into the page as
 * base64 and come back the same way, which keeps the transport boring and the
 * assertions in the test process where pdf-lib is already available.
 */

import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

/** Reads back `[width, height]` for every page, rounded past PDF float noise. */
export async function pageSizes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())]);
}

export const BANDED_WIDTH = 200;
export const BANDED_HEIGHT = 600;
export const BAND_THICKNESS = 40;

/**
 * A portrait page with a red band along its own left edge, on a white ground.
 *
 * With `/Rotate 90` applied, that left edge is the one a viewer draws at the
 * top — `marginsInPageSpace` maps a visual "top" margin onto the page's left.
 * So trimming 30% off the visual top must erase the band, while trimming the
 * unrotated top (the pre-fix behaviour) leaves it fully visible. The band is
 * therefore a direct read-out of which edge was actually cut.
 */
export async function createBandedRotatedPdf(angle = 90): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([BANDED_WIDTH, BANDED_HEIGHT]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: BANDED_WIDTH,
    height: BANDED_HEIGHT,
    color: rgb(1, 1, 1),
  });
  page.drawRectangle({
    x: 0,
    y: 0,
    width: BAND_THICKNESS,
    height: BANDED_HEIGHT,
    color: rgb(1, 0, 0),
  });
  page.setRotation(degrees(angle));
  return await doc.save();
}

/** Reads back the *crop* box of every page — the box `cropPdf` actually sets. */
export async function cropBoxes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => {
    const box = page.getCropBox();
    return [Math.round(box.width), Math.round(box.height)];
  });
}

/**
 * A page that is expensive as vectors but cheap as pixels: thousands of
 * identically coloured rectangles that overlap into what looks like a plain
 * block.
 *
 * Compression fixtures have to be built this way deliberately. `compressPdf`
 * keeps the original bytes whenever rasterising would enlarge them, so a small
 * or empty fixture comes back untouched and any assertion about the output
 * page silently stops testing compression at all. A fat content stream and a
 * near-solid appearance guarantee the raster attempt wins.
 */
export async function createHeavyPdf(
  width: number,
  height: number,
  options: { rotation?: number; rectangles?: number } = {},
): Promise<Uint8Array> {
  const { rotation = 0, rectangles = 3000 } = options;
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);
  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });

  // A fixed linear congruential sequence, so every run builds the same bytes.
  let seed = 42;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (let index = 0; index < rectangles; index++) {
    page.drawRectangle({
      x: next() * width,
      y: next() * height,
      width: 12,
      height: 12,
      color: rgb(0.25, 0.35, 0.55),
    });
  }

  if (rotation) page.setRotation(degrees(rotation));
  return await doc.save();
}

/** A plain portrait page of solid colour, used where only geometry matters. */
export async function createSolidPdf(
  width: number,
  height: number,
  pageCount = 1,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index++) {
    const page = doc.addPage([width, height]);
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.2, 0.4, 0.9) });
  }
  return await doc.save();
}

/** A portrait page carrying a rotation, with no drawn content. */
export async function createRotatedPdf(
  angle: number,
  width = 200,
  height = 600,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]).setRotation(degrees(angle));
  return await doc.save();
}

export type TextFixtureLine = {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
};

/**
 * A document with a real text layer, drawn with the standard fonts every
 * viewer already has.
 *
 * `createSolidPdf` is its opposite number for conversion tests: it has page
 * graphics and no text at all, which is what a scan looks like to pdf.js, so
 * the two fixtures separate "converts" from "needs OCR".
 */
export async function createTextPdf(pages: TextFixtureLine[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    for (const line of lines) {
      page.drawText(line.text, {
        x: line.x,
        y: line.y,
        size: line.size ?? 11,
        font: line.bold ? bold : regular,
      });
    }
  }

  return await doc.save();
}

/**
 * The two-page document the conversion workflows run on. Each page carries
 * text found nowhere else, so an assertion can tell a whole-document export
 * from a one-page range without counting anything.
 */
export const CONVERSION_FIXTURE_PAGES: TextFixtureLine[][] = [
  [
    { text: 'Report title', x: 60, y: 720, size: 22, bold: true },
    { text: 'First page body text.', x: 60, y: 680 },
  ],
  [
    { text: 'Second page heading', x: 60, y: 720, size: 18, bold: true },
    { text: 'Range-only body text.', x: 60, y: 680 },
  ],
];

/** Bytes that are small and clearly not a PDF, for validation paths. */
export function createMislabeledBytes(): Uint8Array {
  return new TextEncoder().encode('this is plain text, not a document');
}
