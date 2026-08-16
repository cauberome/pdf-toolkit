import { describe, it, expect } from 'vitest';
import {
  isPdfBytes,
  isImageBytes,
  formatFileSize,
  sanitizeFilename,
  getBaseFilename,
  assertValidPdfBytes,
  assertValidImageBytes,
  urlTracker,
} from '../engine/validation';
import { ProcessingError } from '../engine/errors';

describe('Validation Utilities', () => {
  it('detects PDF magic bytes (%PDF)', () => {
    const validPdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
    expect(isPdfBytes(validPdf)).toBe(true);

    const invalidBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    expect(isPdfBytes(invalidBytes)).toBe(false);
  });

  it('detects PNG, JPEG, and WebP signatures', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(isImageBytes(png)).toEqual({ valid: true, format: 'png' });

    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(isImageBytes(jpeg)).toEqual({ valid: true, format: 'jpeg' });

    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    expect(isImageBytes(webp)).toEqual({ valid: true, format: 'webp' });
  });

  it('formats file sizes accurately', () => {
    expect(formatFileSize(0)).toBe('0 Bytes');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('sanitizes filenames and extracts base name', () => {
    expect(sanitizeFilename('my<doc>:file?.pdf')).toBe('my_doc_file_.pdf');
    expect(getBaseFilename('annual-report.2024.pdf')).toBe('annual-report.2024');
    expect(getBaseFilename('simple.pdf')).toBe('simple');
  });
});

describe('PDF byte assertions', () => {
  const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

  it('accepts bytes carrying a %PDF header', () => {
    expect(() => assertValidPdfBytes(pdfHeader, 'ok.pdf')).not.toThrow();
  });

  it('rejects a zero-byte file as EMPTY_FILE', () => {
    try {
      assertValidPdfBytes(new Uint8Array(0), 'empty.pdf');
      throw new Error('expected assertValidPdfBytes to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProcessingError);
      expect((err as ProcessingError).code).toBe('EMPTY_FILE');
      expect((err as ProcessingError).fileName).toBe('empty.pdf');
    }
  });

  it('rejects a file that is merely named .pdf as NOT_A_PDF', () => {
    const mislabeled = new TextEncoder().encode('this is plain text pretending to be a pdf');
    try {
      assertValidPdfBytes(mislabeled, 'fake.pdf');
      throw new Error('expected assertValidPdfBytes to throw');
    } catch (err) {
      expect((err as ProcessingError).code).toBe('NOT_A_PDF');
    }
  });

  it('accepts a %PDF header that appears after leading junk', () => {
    const withPreamble = new Uint8Array([0x0a, 0x20, ...pdfHeader]);
    expect(() => assertValidPdfBytes(withPreamble, 'padded.pdf')).not.toThrow();
  });
});

describe('Image byte assertions', () => {
  it('returns the detected format for supported images', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(assertValidImageBytes(png, 'a.png')).toBe('png');
  });

  it('rejects an empty image as EMPTY_FILE', () => {
    try {
      assertValidImageBytes(new Uint8Array(0), 'a.png');
      throw new Error('expected assertValidImageBytes to throw');
    } catch (err) {
      expect((err as ProcessingError).code).toBe('EMPTY_FILE');
    }
  });

  it('rejects an unsupported or mislabeled image as UNSUPPORTED_IMAGE', () => {
    const gif = new TextEncoder().encode('GIF89a-----------');
    try {
      assertValidImageBytes(gif, 'a.png');
      throw new Error('expected assertValidImageBytes to throw');
    } catch (err) {
      expect((err as ProcessingError).code).toBe('UNSUPPORTED_IMAGE');
      expect((err as ProcessingError).fileName).toBe('a.png');
    }
  });
});

describe('Object URL tracking', () => {
  it('creates, revokes, and bulk-releases tracked object URLs', () => {
    const blob = new Blob(['x'], { type: 'text/plain' });

    const first = urlTracker.create(blob);
    const second = urlTracker.create(blob);
    expect(urlTracker.size).toBe(2);

    urlTracker.revoke(first);
    expect(urlTracker.size).toBe(1);

    // Revoking an untracked URL is a no-op rather than an error.
    urlTracker.revoke('blob:not-tracked');
    expect(urlTracker.size).toBe(1);

    urlTracker.revokeAll();
    expect(urlTracker.size).toBe(0);
    expect(second).toMatch(/^blob:/);
  });
});
