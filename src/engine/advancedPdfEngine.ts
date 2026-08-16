import { PDFDocument, PDFPage } from 'pdf-lib';
import {
  CompressionOptions,
  CompressionPreset,
  CompressionResult,
  CropMargins,
  PageAddition,
  PdfSource,
} from './types';
import { loadPdfDocument, embedImageInPdf } from './pdfEngine';
import { pdfToImages, RenderScale } from './pdfRenderer';
import { ProcessingError, toProcessingError } from './errors';

export type CompressionAttempt = {
  scale: RenderScale;
  quality: number;
};

const AUTO_ATTEMPTS: Record<CompressionPreset, CompressionAttempt> = {
  quality: { scale: 2, quality: 0.88 },
  balanced: { scale: 1, quality: 0.72 },
  smallest: { scale: 1, quality: 0.48 },
};

const TARGET_ATTEMPTS: CompressionAttempt[] = [
  { scale: 2, quality: 0.88 },
  { scale: 1, quality: 0.78 },
  { scale: 1, quality: 0.62 },
  { scale: 1, quality: 0.45 },
  { scale: 1, quality: 0.3 },
];

// ---------------------------------------------------------------------------
// Page geometry
//
// pdf-lib reports the MediaBox in unrotated page space, while pdf.js rasterises
// the *visible* box (CropBox clipped to the MediaBox) with `/Rotate` applied.
// Every operation that has to line up with what a person actually saw — raster
// page sizes, crop margins, "match" blank pages — works from the display
// geometry below rather than from `getSize()`.
// ---------------------------------------------------------------------------

type Box = { x: number; y: number; width: number; height: number };
type PageSize = { width: number; height: number };

/** Normalises any `/Rotate` value, including negative ones, to 0/90/180/270. */
export function normalizedRotation(page: PDFPage): number {
  const angle = page.getRotation().angle;
  if (!Number.isFinite(angle)) return 0;
  return (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
}

/** Overlap of two boxes, or `null` when they do not overlap at all. */
function intersectBoxes(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || top <= y) return null;
  return { x, y, width: right - x, height: top - y };
}

/**
 * The page as a viewer draws it. Sizing raster output by `getSize()` instead
 * would stretch every rotated page and every page whose CropBox is smaller
 * than its MediaBox — including the output of this toolkit's own crop tool.
 */
export function displayedPageSize(page: PDFPage): PageSize {
  const media = page.getMediaBox();
  const visible = intersectBoxes(page.getCropBox(), media) ?? media;
  const quarterTurn = normalizedRotation(page) % 180 === 90;
  return quarterTurn
    ? { width: visible.height, height: visible.width }
    : { width: visible.width, height: visible.height };
}

/**
 * Rotates margins from the orientation the person saw into unrotated page
 * space. On a page displayed with `/Rotate 90` the visual top edge is the
 * page's own left edge, so trimming "top" has to move the left crop bound.
 */
export function marginsInPageSpace(margins: CropMargins, rotation: number): CropMargins {
  switch (rotation) {
    case 90:
      return {
        top: margins.right,
        right: margins.bottom,
        bottom: margins.left,
        left: margins.top,
      };
    case 180:
      return {
        top: margins.bottom,
        right: margins.left,
        bottom: margins.top,
        left: margins.right,
      };
    case 270:
      return {
        top: margins.left,
        right: margins.top,
        bottom: margins.right,
        left: margins.bottom,
      };
    default:
      return margins;
  }
}

// ---------------------------------------------------------------------------
// BE-08 — compression
// ---------------------------------------------------------------------------

export function compressionAttempts(options: CompressionOptions): CompressionAttempt[] {
  if (options.mode === 'auto') return [AUTO_ATTEMPTS[options.preset]];
  if (!Number.isFinite(options.targetBytes) || options.targetBytes <= 0) {
    throw new ProcessingError('INVALID_SELECTION', 'target size must be greater than zero');
  }
  return TARGET_ATTEMPTS.map((attempt) => ({ ...attempt }));
}

/**
 * Validates the document and measures every page once, so an attempt loop
 * never re-parses the source just to ask how big its pages are.
 */
async function rasterPageSizes(source: PdfSource): Promise<PageSize[]> {
  const doc = await loadPdfDocument(source);
  return doc.getPages().map(displayedPageSize);
}

async function buildRasterPdf(
  pageSizes: PageSize[],
  renderedPages: Blob[],
  fileName: string,
): Promise<Uint8Array> {
  if (renderedPages.length !== pageSizes.length) {
    throw new ProcessingError('RENDER_FAILED', 'rendered page count does not match source', {
      fileName,
    });
  }

  const output = await PDFDocument.create();
  for (const { width, height } of pageSizes) {
    // Consumes the queue as it goes: a long document holds one JPEG per page,
    // and dropping each reference here keeps the peak at the output document
    // instead of the rendered pages and the output at the same time.
    const rendered = renderedPages.shift();
    if (!rendered) {
      throw new ProcessingError('RENDER_FAILED', 'missing rendered page', { fileName });
    }

    const image = await output.embedJpg(new Uint8Array(await rendered.arrayBuffer()));
    const page = output.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return await output.save();
}

/**
 * Raster-compresses a PDF. Target mode is deliberately best-effort: it returns
 * the first attempt below the target, or the smallest valid result otherwise.
 * The original bytes remain the best result if rasterisation would enlarge it.
 */
export async function compressPdf(
  source: PdfSource,
  options: CompressionOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<CompressionResult> {
  const attempts = compressionAttempts(options);
  let bestBytes = source.bytes;
  let rasterized = false;
  let completedAttempts = 0;

  try {
    // Measured before the early return below: a file that is already under the
    // target still has to be a readable, unlocked, non-empty PDF before this
    // function may hand it back as a compression result.
    const pageSizes = await rasterPageSizes(source);

    if (options.mode === 'target' && source.bytes.length <= options.targetBytes) {
      return {
        bytes: source.bytes,
        originalBytes: source.bytes.length,
        outputBytes: source.bytes.length,
        attempts: 0,
        targetReached: true,
        rasterized: false,
      };
    }

    const pages = pageSizes.map((_, index) => index);

    for (const attempt of attempts) {
      const rendered = await pdfToImages(source, 'jpeg', pages, attempt.scale, attempt.quality);
      const candidate = await buildRasterPdf(pageSizes, rendered, source.name);
      completedAttempts += 1;
      onProgress?.(completedAttempts, attempts.length);

      if (candidate.length < bestBytes.length) {
        bestBytes = candidate;
        rasterized = true;
      }

      if (options.mode === 'target' && candidate.length <= options.targetBytes) {
        return {
          bytes: candidate,
          originalBytes: source.bytes.length,
          outputBytes: candidate.length,
          attempts: completedAttempts,
          targetReached: true,
          rasterized: true,
        };
      }
    }

    return {
      bytes: bestBytes,
      originalBytes: source.bytes.length,
      outputBytes: bestBytes.length,
      attempts: completedAttempts,
      targetReached: options.mode === 'target' ? bestBytes.length <= options.targetBytes : null,
      rasterized,
    };
  } catch (error) {
    throw toProcessingError(error, 'RENDER_FAILED', source.name);
  }
}

// ---------------------------------------------------------------------------
// BE-09 — crop
// ---------------------------------------------------------------------------

export function validateCropMargins(margins: CropMargins): void {
  const values = [margins.top, margins.right, margins.bottom, margins.left];
  if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 95)) {
    throw new ProcessingError('INVALID_SELECTION', 'crop margins must be between 0 and 95');
  }
  if (margins.left + margins.right > 95 || margins.top + margins.bottom > 95) {
    throw new ProcessingError('INVALID_SELECTION', 'crop must retain at least 5% of the page');
  }
}

/** Applies percentage crop margins to selected zero-based page indexes. */
export async function cropPdf(
  source: PdfSource,
  pages: number[],
  margins: CropMargins,
): Promise<Uint8Array> {
  validateCropMargins(margins);
  if (!pages.length || new Set(pages).size !== pages.length) {
    throw new ProcessingError('INVALID_SELECTION', 'select one or more unique pages', {
      fileName: source.name,
    });
  }

  const doc = await loadPdfDocument(source);
  const docPages = doc.getPages();
  for (const pageIndex of pages) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= docPages.length) {
      throw new ProcessingError('PAGE_OUT_OF_RANGE', `page ${pageIndex + 1} outside document`, {
        fileName: source.name,
      });
    }
    const page = docPages[pageIndex];
    const box = page.getCropBox();
    const applied = marginsInPageSpace(margins, normalizedRotation(page));
    const left = box.width * (applied.left / 100);
    const right = box.width * (applied.right / 100);
    const bottom = box.height * (applied.bottom / 100);
    const top = box.height * (applied.top / 100);
    page.setCropBox(
      box.x + left,
      box.y + bottom,
      box.width - left - right,
      box.height - top - bottom,
    );
  }

  try {
    return await doc.save();
  } catch (error) {
    // Serialising a large document is where this operation runs out of room;
    // typing the failure lets the workspace show the memory guidance.
    throw toProcessingError(error, 'UNKNOWN', source.name);
  }
}

// ---------------------------------------------------------------------------
// BE-10 — add pages
// ---------------------------------------------------------------------------

function blankPageDimensions(
  doc: PDFDocument,
  insertionIndex: number,
  size: 'match' | 'a4' | 'letter',
): [number, number] {
  if (size === 'a4') return [595.28, 841.89];
  if (size === 'letter') return [612, 792];
  const pages = doc.getPages();
  const neighbor = pages[Math.min(insertionIndex, pages.length - 1)];
  // "Match" means match what the neighbour looks like, so a blank page next to
  // a rotated landscape page comes out landscape too.
  const { width, height } = displayedPageSize(neighbor);
  return [width, height];
}

/** Inserts new content at a boundary from 0 (before first) to pageCount (after last). */
export async function addPagesToPdf(
  source: PdfSource,
  insertionIndex: number,
  addition: PageAddition,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(source);
  const pageCount = doc.getPageCount();
  if (!Number.isInteger(insertionIndex) || insertionIndex < 0 || insertionIndex > pageCount) {
    throw new ProcessingError('PAGE_OUT_OF_RANGE', 'invalid insertion position', {
      fileName: source.name,
    });
  }

  try {
    if (addition.kind === 'blank') {
      if (!Number.isInteger(addition.count) || addition.count < 1 || addition.count > 100) {
        throw new ProcessingError('INVALID_SELECTION', 'blank page count must be from 1 to 100', {
          fileName: source.name,
        });
      }
      const dimensions = blankPageDimensions(doc, insertionIndex, addition.size);
      for (let offset = 0; offset < addition.count; offset++) {
        doc.insertPage(insertionIndex + offset, dimensions);
      }
    } else if (addition.kind === 'images') {
      if (!addition.files || addition.files.length === 0) {
        throw new ProcessingError('INVALID_SELECTION', 'no images provided', {
          fileName: source.name,
        });
      }
      // Embedded straight into the base document. Routing through `imagesToPdf`
      // would serialise an entire intermediate PDF only to parse and copy it
      // back one statement later.
      for (let offset = 0; offset < addition.files.length; offset++) {
        const { width, height, image } = await embedImageInPdf(doc, addition.files[offset]);
        const page = doc.insertPage(insertionIndex + offset, [width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });
      }
    } else {
      const additionDoc = await loadPdfDocument(addition.source);
      const copiedPages = await doc.copyPages(additionDoc, additionDoc.getPageIndices());
      copiedPages.forEach((page, offset) => doc.insertPage(insertionIndex + offset, page));
    }
    return await doc.save();
  } catch (error) {
    throw toProcessingError(error, 'UNKNOWN', source.name);
  }
}
