/**
 * Typed error categories for the browser-side processing engine.
 *
 * Engine functions throw `ProcessingError` so the UI can react to a stable
 * `code` instead of matching on prose. `toUserMessage` is the single place
 * that turns a code into copy shown to a person; raw library wording is kept
 * on `cause` for debugging and never surfaced.
 */

export type ProcessingErrorCode =
  | 'EMPTY_FILE'
  | 'NOT_A_PDF'
  | 'CORRUPT_PDF'
  | 'ENCRYPTED_PDF'
  | 'NO_PAGES'
  | 'UNSUPPORTED_IMAGE'
  | 'IMAGE_DECODE_FAILED'
  | 'PAGE_OUT_OF_RANGE'
  | 'INVALID_SELECTION'
  | 'NO_EXTRACTABLE_TEXT'
  | 'RENDER_FAILED'
  | 'OUT_OF_MEMORY'
  | 'UNKNOWN';

export type ProcessingErrorOptions = {
  fileName?: string;
  cause?: unknown;
};

export class ProcessingError extends Error {
  readonly code: ProcessingErrorCode;
  readonly fileName?: string;
  /**
   * The originating library error. Declared here rather than relying on the
   * ES2022 `Error.cause`, which is outside this project's `lib` target.
   */
  readonly cause?: unknown;
  /**
   * Every category is recoverable: the workspace keeps its files and
   * selection so the person can adjust the input and retry.
   */
  readonly recoverable = true;

  constructor(code: ProcessingErrorCode, message: string, options: ProcessingErrorOptions = {}) {
    super(message);
    this.name = 'ProcessingError';
    this.code = code;
    this.fileName = options.fileName;
    this.cause = options.cause;
    // Keep `instanceof` working when compiled down for older targets.
    Object.setPrototypeOf(this, ProcessingError.prototype);
  }
}

export function isProcessingError(value: unknown): value is ProcessingError {
  return value instanceof ProcessingError;
}

const ENCRYPTED_PATTERN = /encrypt|password|permission denied to open/i;
const MEMORY_PATTERN =
  /array buffer allocation failed|out of memory|invalid (string|array) length|allocation size overflow|maximum call stack/i;

function rawMessageOf(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value;
  return '';
}

/**
 * Normalises anything thrown by pdf-lib, pdf.js, or the browser into a
 * `ProcessingError`, classifying the two failures worth special handling
 * (encrypted documents and memory exhaustion) before applying `fallbackCode`.
 */
export function toProcessingError(
  value: unknown,
  fallbackCode: ProcessingErrorCode,
  fileName?: string,
): ProcessingError {
  if (isProcessingError(value)) return value;

  const raw = rawMessageOf(value);

  if (ENCRYPTED_PATTERN.test(raw)) {
    return new ProcessingError('ENCRYPTED_PDF', raw, { fileName, cause: value });
  }

  if (MEMORY_PATTERN.test(raw) || value instanceof RangeError) {
    return new ProcessingError('OUT_OF_MEMORY', raw || 'allocation failed', {
      fileName,
      cause: value,
    });
  }

  return new ProcessingError(fallbackCode, raw || 'unknown failure', { fileName, cause: value });
}

const MESSAGES: Record<ProcessingErrorCode, (subject: string) => string> = {
  EMPTY_FILE: (s) => `${s} is empty. Choose a file that contains data.`,
  NOT_A_PDF: (s) => `${s} is not a PDF file. Only PDF documents can be used here.`,
  CORRUPT_PDF: (s) => `${s} could not be read. The file may be damaged or incomplete.`,
  ENCRYPTED_PDF: (s) =>
    `${s} is password-protected. Remove the password in another program, then try again.`,
  NO_PAGES: (s) => `${s} contains no pages, so there is nothing to process.`,
  UNSUPPORTED_IMAGE: (s) => `${s} is not a supported image. Use JPG, PNG, or WebP files.`,
  IMAGE_DECODE_FAILED: (s) => `${s} could not be decoded. The image may be damaged.`,
  PAGE_OUT_OF_RANGE: (s) => `A selected page does not exist in ${s}. Check the page numbers.`,
  INVALID_SELECTION: (s) => `The current selection for ${s} is not valid. Adjust it and try again.`,
  NO_EXTRACTABLE_TEXT: (s) =>
    `${s} has no extractable text. It may be a scanned document and requires OCR, which this tool does not perform yet.`,
  RENDER_FAILED: (s) => `${s} could not be rendered in this browser. Try a smaller document.`,
  OUT_OF_MEMORY: (s) =>
    `${s} is too large for this browser to process. Close other tabs or split the work into smaller parts, then try again.`,
  UNKNOWN: (s) => `An unexpected problem occurred while processing ${s}. Nothing was changed.`,
};

const GENERIC_SUBJECT = 'this document';

/**
 * Turns any thrown value into a sentence suitable for the UI.
 */
export function toUserMessage(value: unknown): string {
  if (isProcessingError(value)) {
    const subject = value.fileName ? `"${value.fileName}"` : GENERIC_SUBJECT;
    return MESSAGES[value.code](subject);
  }
  return MESSAGES.UNKNOWN(GENERIC_SUBJECT);
}
