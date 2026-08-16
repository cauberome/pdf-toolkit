import { PDFDocument, PDFImage } from 'pdf-lib';
import { PdfSource } from './types';
import { assertValidPdfBytes, assertValidImageBytes, readFileAsUint8Array } from './validation';
import { ProcessingError, toProcessingError } from './errors';

/**
 * Loads a PDF for processing, rejecting empty, mislabeled, damaged, encrypted,
 * and page-less documents as typed errors before any work begins.
 */
export async function loadPdfDocument(source: PdfSource): Promise<PDFDocument> {
  assertValidPdfBytes(source.bytes, source.name);

  let doc: PDFDocument;
  try {
    // `ignoreEncryption: false` makes pdf-lib reject protected documents
    // instead of silently producing an unreadable output.
    doc = await PDFDocument.load(source.bytes, { ignoreEncryption: false });
  } catch (err) {
    throw toProcessingError(err, 'CORRUPT_PDF', source.name);
  }

  if (doc.getPageCount() === 0) {
    throw new ProcessingError('NO_PAGES', 'document has zero pages', { fileName: source.name });
  }

  return doc;
}

function assertPagesInRange(pages: number[], totalPages: number, fileName: string): void {
  for (const pageIndex of pages) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= totalPages) {
      throw new ProcessingError(
        'PAGE_OUT_OF_RANGE',
        `page index ${pageIndex} outside 0..${totalPages - 1}`,
        { fileName },
      );
    }
  }
}

/**
 * Merge two or more PDF sources. Output page order is the source order given,
 * and within each source its own page order.
 */
export async function mergePdfs(sources: PdfSource[]): Promise<Uint8Array> {
  if (!sources || sources.length < 2) {
    throw new ProcessingError('INVALID_SELECTION', 'merge requires at least two PDF documents');
  }

  const mergedDoc = await PDFDocument.create();

  for (const source of sources) {
    const srcDoc = await loadPdfDocument(source);
    const pageIndices = srcDoc.getPageIndices();
    const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((page) => mergedDoc.addPage(page));
  }

  return await mergedDoc.save();
}

/**
 * Retain and reorder pages of a single PDF.
 * @param retainedPages 0-based page indexes in the desired output sequence.
 */
export async function editPdf(source: PdfSource, retainedPages: number[]): Promise<Uint8Array> {
  if (!retainedPages || retainedPages.length === 0) {
    throw new ProcessingError('INVALID_SELECTION', 'no pages retained', { fileName: source.name });
  }

  const srcDoc = await loadPdfDocument(source);
  assertPagesInRange(retainedPages, srcDoc.getPageCount(), source.name);

  const editedDoc = await PDFDocument.create();
  const copiedPages = await editedDoc.copyPages(srcDoc, retainedPages);
  copiedPages.forEach((page) => editedDoc.addPage(page));

  return await editedDoc.save();
}

/**
 * Split a PDF into one output document per group.
 * @param groups groups of 0-based page indexes, in output order.
 */
export async function splitPdf(source: PdfSource, groups: number[][]): Promise<Uint8Array[]> {
  if (!groups || groups.length === 0) {
    throw new ProcessingError('INVALID_SELECTION', 'split requires at least one output group', {
      fileName: source.name,
    });
  }

  const srcDoc = await loadPdfDocument(source);
  const totalPages = srcDoc.getPageCount();
  const outputBuffers: Uint8Array[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];

    if (!group || group.length === 0) {
      throw new ProcessingError('INVALID_SELECTION', `group ${groupIndex + 1} contains no pages`, {
        fileName: source.name,
      });
    }

    if (new Set(group).size !== group.length) {
      throw new ProcessingError(
        'INVALID_SELECTION',
        `group ${groupIndex + 1} repeats a page`,
        { fileName: source.name },
      );
    }

    assertPagesInRange(group, totalPages, source.name);

    const groupDoc = await PDFDocument.create();
    const copiedPages = await groupDoc.copyPages(srcDoc, group);
    copiedPages.forEach((page) => groupDoc.addPage(page));
    outputBuffers.push(await groupDoc.save());
  }

  return outputBuffers;
}

export type EmbeddedImage = {
  width: number;
  height: number;
  image: PDFImage;
};

/**
 * Rasterises an image through a canvas so formats pdf-lib cannot embed
 * directly (WebP, and PNG variants it rejects) still become PDF pages.
 */
async function embedViaCanvas(pdfDoc: PDFDocument, file: File): Promise<EmbeddedImage> {
  return new Promise<EmbeddedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    const fail = (err: unknown) => {
      URL.revokeObjectURL(url);
      reject(toProcessingError(err, 'IMAGE_DECODE_FAILED', file.name));
    };

    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new ProcessingError('IMAGE_DECODE_FAILED', 'canvas 2D context unavailable', {
            fileName: file.name,
          });
        }
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          try {
            if (!blob) {
              throw new ProcessingError('IMAGE_DECODE_FAILED', 'canvas produced no blob', {
                fileName: file.name,
              });
            }
            const pngBuffer = await blob.arrayBuffer();
            const embeddedImg = await pdfDoc.embedPng(new Uint8Array(pngBuffer));
            resolve({ width: canvas.width, height: canvas.height, image: embeddedImg });
          } catch (err) {
            reject(toProcessingError(err, 'IMAGE_DECODE_FAILED', file.name));
          }
        }, 'image/png');
      } catch (err) {
        fail(err);
      }
    };

    img.onerror = () => fail(new Error('image failed to load'));
    img.src = url;
  });
}

/**
 * Embeds one image file, choosing the native pdf-lib path where possible and
 * falling back to canvas rasterisation otherwise. Exported so callers that
 * insert images into an existing document can reuse the decoding rules without
 * building a throwaway PDF first.
 */
export async function embedImageInPdf(pdfDoc: PDFDocument, file: File): Promise<EmbeddedImage> {
  const bytes = await readFileAsUint8Array(file);
  // Trust the signature, not the extension: a .png that is really a GIF is
  // rejected here rather than failing deep inside pdf-lib.
  const format = assertValidImageBytes(bytes, file.name);

  if (format === 'jpeg') {
    try {
      const img = await pdfDoc.embedJpg(bytes);
      return { width: img.width, height: img.height, image: img };
    } catch (err) {
      throw toProcessingError(err, 'IMAGE_DECODE_FAILED', file.name);
    }
  }

  if (format === 'png') {
    try {
      const img = await pdfDoc.embedPng(bytes);
      return { width: img.width, height: img.height, image: img };
    } catch {
      // Interlaced or otherwise unsupported PNG: rasterise it instead.
    }
  }

  return await embedViaCanvas(pdfDoc, file);
}

/**
 * Converts an ordered list of JPG, PNG, or WebP images into a single PDF.
 * Each image becomes one page sized to the image's own pixel dimensions, so
 * aspect ratio is preserved and nothing is cropped or letterboxed.
 */
export async function imagesToPdf(images: File[]): Promise<Uint8Array> {
  if (!images || images.length === 0) {
    throw new ProcessingError('INVALID_SELECTION', 'no images provided');
  }

  const pdfDoc = await PDFDocument.create();

  for (const imageFile of images) {
    const { width, height, image } = await embedImageInPdf(pdfDoc, imageFile);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  return await pdfDoc.save();
}
