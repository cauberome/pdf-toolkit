/**
 * Validation and resource management utilities for browser PDF processing.
 */

import { ProcessingError } from './errors';

// Magic byte constants
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // %PDF
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]; // .PNG
const JPEG_MAGIC = [0xff, 0xd8, 0xff];       // JPEG SOI
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];  // RIFF
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];  // WEBP

export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // Some PDFs have leading whitespace or comments, search within first 1024 bytes
  const headerLen = Math.min(bytes.length, 1024);
  for (let i = 0; i <= headerLen - 4; i++) {
    if (
      bytes[i] === PDF_MAGIC[0] &&
      bytes[i + 1] === PDF_MAGIC[1] &&
      bytes[i + 2] === PDF_MAGIC[2] &&
      bytes[i + 3] === PDF_MAGIC[3]
    ) {
      return true;
    }
  }
  return false;
}

export function isImageBytes(bytes: Uint8Array): { valid: boolean; format?: 'png' | 'jpeg' | 'webp' } {
  if (bytes.length < 12) return { valid: false };

  // Check PNG
  if (
    bytes[0] === PNG_MAGIC[0] &&
    bytes[1] === PNG_MAGIC[1] &&
    bytes[2] === PNG_MAGIC[2] &&
    bytes[3] === PNG_MAGIC[3]
  ) {
    return { valid: true, format: 'png' };
  }

  // Check JPEG
  if (
    bytes[0] === JPEG_MAGIC[0] &&
    bytes[1] === JPEG_MAGIC[1] &&
    bytes[2] === JPEG_MAGIC[2]
  ) {
    return { valid: true, format: 'jpeg' };
  }

  // Check WebP (RIFF .... WEBP)
  if (
    bytes[0] === WEBP_RIFF[0] &&
    bytes[1] === WEBP_RIFF[1] &&
    bytes[2] === WEBP_RIFF[2] &&
    bytes[3] === WEBP_RIFF[3] &&
    bytes[8] === WEBP_WEBP[0] &&
    bytes[9] === WEBP_WEBP[1] &&
    bytes[10] === WEBP_WEBP[2] &&
    bytes[11] === WEBP_WEBP[3]
  ) {
    return { valid: true, format: 'webp' };
  }

  return { valid: false };
}

/**
 * Throws a typed error unless the bytes are a plausible PDF. Distinguishes a
 * zero-byte file from a mislabeled one so the UI can explain the difference.
 */
export function assertValidPdfBytes(bytes: Uint8Array, fileName: string): void {
  if (bytes.length === 0) {
    throw new ProcessingError('EMPTY_FILE', 'zero-byte file', { fileName });
  }
  if (!isPdfBytes(bytes)) {
    throw new ProcessingError('NOT_A_PDF', 'missing %PDF header', { fileName });
  }
}

/**
 * Throws a typed error unless the bytes are a supported image, and returns the
 * detected format so callers do not have to trust the file extension.
 */
export function assertValidImageBytes(
  bytes: Uint8Array,
  fileName: string,
): 'png' | 'jpeg' | 'webp' {
  if (bytes.length === 0) {
    throw new ProcessingError('EMPTY_FILE', 'zero-byte file', { fileName });
  }
  const check = isImageBytes(bytes);
  if (!check.valid || !check.format) {
    throw new ProcessingError('UNSUPPORTED_IMAGE', 'unrecognised image signature', { fileName });
  }
  return check.format;
}

export async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function sanitizeFilename(name: string, fallback = 'document'): string {
  if (!name || typeof name !== 'string') return fallback;
  // Strip path separators, characters illegal in filenames, and control
  // characters — the last of these is exactly what this rule warns about.
  // eslint-disable-next-line no-control-regex
  let safe = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  // Collapse multiple underscores
  safe = safe.replace(/_+/g, '_');
  // Strip trailing dots
  safe = safe.replace(/\.+$/, '');
  return safe.length > 0 ? safe : fallback;
}

export function getBaseFilename(filename: string): string {
  const safe = sanitizeFilename(filename);
  const lastDot = safe.lastIndexOf('.');
  return lastDot > 0 ? safe.substring(0, lastDot) : safe;
}

// Object URL Tracker for memory cleanup
class UrlTracker {
  private urls = new Set<string>();

  /** Number of object URLs still held; used by tests and reset assertions. */
  get size(): number {
    return this.urls.size;
  }

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  revoke(url: string) {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  revokeAll() {
    this.urls.forEach(url => URL.revokeObjectURL(url));
    this.urls.clear();
  }
}

export const urlTracker = new UrlTracker();
