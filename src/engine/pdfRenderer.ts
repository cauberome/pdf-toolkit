import { PdfSource, PageThumbnail, ImageFormat } from './types';
import { openPdfDocument } from './pdfDocument';
import { ProcessingError, toProcessingError } from './errors';

/**
 * A PDF point is 1/72 inch. Rendering at 1.0 would produce 72 DPI images,
 * which look soft on any modern screen, so the "1x" preset renders at 1.5
 * (108 DPI) and "2x" at 3.0 (216 DPI).
 */
export const BASE_RENDER_SCALE = 1.5;

export type RenderScale = 1 | 2;

/** Viewport scale used for a given user-facing resolution preset. */
export function renderScaleFor(scale: RenderScale): number {
  return scale * BASE_RENDER_SCALE;
}

/**
 * Canvas pixel dimensions for a page, given its unscaled size.
 * Kept separate from rendering so the sizing rule is unit-testable.
 */
export function renderDimensions(
  baseWidth: number,
  baseHeight: number,
  scale: RenderScale,
): { width: number; height: number } {
  const factor = renderScaleFor(scale);
  return {
    width: Math.floor(baseWidth * factor),
    height: Math.floor(baseHeight * factor),
  };
}

/**
 * Scale that fits a page inside a square thumbnail box without upscaling
 * beyond `maxScale`.
 */
export function thumbnailScale(
  pageWidth: number,
  pageHeight: number,
  maxDimension: number,
  maxScale = 1.5,
): number {
  return Math.min(maxDimension / pageWidth, maxDimension / pageHeight, maxScale);
}

function getCanvasContext(
  canvas: HTMLCanvasElement,
  alpha: boolean,
  fileName: string,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha });
  if (!ctx) {
    throw new ProcessingError('RENDER_FAILED', 'canvas 2D context unavailable', { fileName });
  }
  return ctx;
}

/**
 * Get total page count of a PDF file using pdfjs-dist.
 */
export async function getPdfPageCount(source: PdfSource): Promise<number> {
  const pdfDoc = await openPdfDocument(source);
  const numPages = pdfDoc.numPages;
  await pdfDoc.destroy();
  return numPages;
}

/**
 * Render thumbnails for all pages of a PDF document.
 */
export async function renderPdfThumbnails(
  source: PdfSource,
  maxDimension = 260,
  onProgress?: (rendered: number, total: number) => void,
): Promise<PageThumbnail[]> {
  const pdfDoc = await openPdfDocument(source);
  const numPages = pdfDoc.numPages;
  const thumbnails: PageThumbnail[] = [];

  try {
    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const initialViewport = page.getViewport({ scale: 1.0 });
      const scale = thumbnailScale(initialViewport.width, initialViewport.height, maxDimension);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = getCanvasContext(canvas, false, source.name);
      // Thumbnails are JPEG, which has no alpha, so paint the page ground.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      thumbnails.push({
        pageNumber: i,
        pageIndex: i - 1,
        dataUrl: canvas.toDataURL('image/jpeg', 0.85),
        width: viewport.width,
        height: viewport.height,
      });

      onProgress?.(i, numPages);
    }
  } catch (err) {
    throw toProcessingError(err, 'RENDER_FAILED', source.name);
  } finally {
    await pdfDoc.destroy();
  }

  return thumbnails;
}

/**
 * Renders selected PDF pages as PNG or JPEG image Blobs.
 * @param pages 0-based page indexes, rendered in the order given.
 */
export async function pdfToImages(
  source: PdfSource,
  format: ImageFormat,
  pages: number[],
  scale: RenderScale = 1,
  jpegQuality = 0.92,
): Promise<Blob[]> {
  if (!pages || pages.length === 0) {
    throw new ProcessingError('INVALID_SELECTION', 'no pages selected', { fileName: source.name });
  }

  const pdfDoc = await openPdfDocument(source);
  const blobs: Blob[] = [];
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  if (format === 'jpeg' && (!Number.isFinite(jpegQuality) || jpegQuality < 0.1 || jpegQuality > 1)) {
    throw new ProcessingError('INVALID_SELECTION', 'JPEG quality must be between 0.1 and 1', {
      fileName: source.name,
    });
  }
  const quality = format === 'jpeg' ? jpegQuality : undefined;

  try {
    for (const pageIndex of pages) {
      const pageNum = pageIndex + 1;
      if (!Number.isInteger(pageIndex) || pageNum < 1 || pageNum > pdfDoc.numPages) {
        throw new ProcessingError('PAGE_OUT_OF_RANGE', `page ${pageNum} outside document`, {
          fileName: source.name,
        });
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: renderScaleFor(scale) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      // PNG keeps transparency; JPEG cannot, so it gets a white ground.
      const ctx = getCanvasContext(canvas, format === 'png', source.name);
      if (format === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      blobs.push(
        await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (blob) => {
              if (blob) resolve(blob);
              else
                reject(
                  new ProcessingError('RENDER_FAILED', `page ${pageNum} produced no blob`, {
                    fileName: source.name,
                  }),
                );
            },
            mimeType,
            quality,
          );
        }),
      );
    }
  } catch (err) {
    throw toProcessingError(err, 'RENDER_FAILED', source.name);
  } finally {
    await pdfDoc.destroy();
  }

  return blobs;
}
