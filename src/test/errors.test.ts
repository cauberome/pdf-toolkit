import { describe, it, expect } from 'vitest';
import {
  ProcessingError,
  isProcessingError,
  toProcessingError,
  toUserMessage,
} from '../engine/errors';

describe('Typed processing errors', () => {
  it('carries a code, an optional file name, and a recoverable flag', () => {
    const err = new ProcessingError('NOT_A_PDF', 'internal detail', { fileName: 'a.pdf' });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ProcessingError');
    expect(err.code).toBe('NOT_A_PDF');
    expect(err.fileName).toBe('a.pdf');
    expect(err.recoverable).toBe(true);
    expect(isProcessingError(err)).toBe(true);
    expect(isProcessingError(new Error('plain'))).toBe(false);
  });

  it('passes an existing ProcessingError through unchanged', () => {
    const original = new ProcessingError('NO_PAGES', 'no pages');
    expect(toProcessingError(original, 'UNKNOWN')).toBe(original);
  });

  it('classifies pdf-lib encryption failures as ENCRYPTED_PDF', () => {
    const raw = new Error(
      'Input document to `PDFDocument.load` is encrypted. You can use `PDFDocument.load(..., { ignoreEncryption: true })`',
    );
    const mapped = toProcessingError(raw, 'CORRUPT_PDF', 'secret.pdf');
    expect(mapped.code).toBe('ENCRYPTED_PDF');
    expect(mapped.fileName).toBe('secret.pdf');
  });

  it('classifies allocation failures as OUT_OF_MEMORY and keeps them recoverable', () => {
    const raw = new RangeError('Array buffer allocation failed');
    const mapped = toProcessingError(raw, 'CORRUPT_PDF', 'huge.pdf');
    expect(mapped.code).toBe('OUT_OF_MEMORY');
    expect(mapped.recoverable).toBe(true);
  });

  it('falls back to the supplied code for unrecognised failures', () => {
    const mapped = toProcessingError(new Error('something odd'), 'CORRUPT_PDF', 'x.pdf');
    expect(mapped.code).toBe('CORRUPT_PDF');
    expect(mapped.cause).toBeInstanceOf(Error);
  });

  it('handles non-Error throwables', () => {
    const mapped = toProcessingError('just a string', 'UNKNOWN');
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped).toBeInstanceOf(ProcessingError);
  });

  it('produces a readable, file-scoped message for every code', () => {
    const codes = [
      'EMPTY_FILE',
      'NOT_A_PDF',
      'CORRUPT_PDF',
      'ENCRYPTED_PDF',
      'NO_PAGES',
      'UNSUPPORTED_IMAGE',
      'IMAGE_DECODE_FAILED',
      'PAGE_OUT_OF_RANGE',
      'INVALID_SELECTION',
      'RENDER_FAILED',
      'OUT_OF_MEMORY',
      'UNKNOWN',
    ] as const;

    for (const code of codes) {
      const message = toUserMessage(new ProcessingError(code, 'internal', { fileName: 'report.pdf' }));
      expect(message.length).toBeGreaterThan(10);
      // Never leak raw internal wording to the user.
      expect(message).not.toContain('internal');
    }
  });

  it('names the offending file in the user message when known', () => {
    const message = toUserMessage(new ProcessingError('ENCRYPTED_PDF', 'x', { fileName: 'secret.pdf' }));
    expect(message).toContain('secret.pdf');
    expect(message).toMatch(/password/i);
  });

  it('converts unknown throwables into a readable message', () => {
    expect(toUserMessage(new Error('boom'))).toMatch(/unexpected|failed/i);
    expect(toUserMessage(undefined)).toMatch(/unexpected|failed/i);
  });
});
