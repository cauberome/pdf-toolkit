/**
 * Default output names, per the naming rules in the implementation plan:
 * `merged.pdf`, `<source>-edited.pdf`, `<source>-part-01.pdf`, and
 * `<source>-page-001.png` / `.jpg`.
 *
 * Every helper runs the source name through `getBaseFilename`, so a hostile
 * or unusable input name can never reach a download attribute intact.
 */

import { getBaseFilename } from './validation';
import { ImageFormat } from './types';

export const MERGED_FILENAME = 'merged.pdf';
export const IMAGES_PDF_FILENAME = 'converted-images.pdf';

const FALLBACK_BASE = 'document';
const MIN_PART_DIGITS = 2;
const MIN_PAGE_DIGITS = 3;

/**
 * A base name is only usable if something survives sanitisation that a person
 * would recognise as a name; `???` collapsing to `_` is not one.
 */
function safeBase(sourceName: string): string {
  const base = getBaseFilename(sourceName ?? '');
  return /[A-Za-z0-9]/.test(base) ? base : FALLBACK_BASE;
}

function pad(value: number, total: number, minDigits: number): string {
  const width = Math.max(minDigits, String(Math.max(total, 1)).length);
  return String(value).padStart(width, '0');
}

export function editedFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-edited.pdf`;
}

/**
 * @param partNumber 1-based output index.
 * @param totalParts total outputs, used to widen padding past two digits.
 */
export function splitPartFilename(sourceName: string, partNumber: number, totalParts: number): string {
  return `${safeBase(sourceName)}-part-${pad(partNumber, totalParts, MIN_PART_DIGITS)}.pdf`;
}

/**
 * @param pageNumber 1-based page number.
 * @param totalPages document length, used to widen padding past three digits.
 */
export function pageImageFilename(
  sourceName: string,
  pageNumber: number,
  format: ImageFormat,
  totalPages = 0,
): string {
  const extension = format === 'jpeg' ? 'jpg' : 'png';
  return `${safeBase(sourceName)}-page-${pad(pageNumber, totalPages, MIN_PAGE_DIGITS)}.${extension}`;
}

export function splitZipFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-split.zip`;
}

export function imagesZipFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-images.zip`;
}

export function compressedFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-compressed.pdf`;
}

export function croppedFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-cropped.pdf`;
}

export function pagesAddedFilename(sourceName: string): string {
  return `${safeBase(sourceName)}-pages-added.pdf`;
}
