/**
 * Deterministic in-memory fixtures for engine tests.
 *
 * Pages are given distinct widths so that page *order* — not merely page
 * count — can be asserted after merge, edit, and split operations.
 */

import { deflateSync } from 'node:zlib';
import { PDFDocument, degrees } from 'pdf-lib';

const PAGE_HEIGHT = 400;
const FIRST_PAGE_WIDTH = 100;
const PAGE_WIDTH_STEP = 10;

/** Width used for the nth (0-based) page of a fixture document. */
export function widthForPage(pageIndex: number, offset = 0): number {
  return FIRST_PAGE_WIDTH + (pageIndex + offset) * PAGE_WIDTH_STEP;
}

/**
 * Builds a PDF whose pages are individually identifiable by width.
 * @param offset shifts the width series so two documents never collide.
 */
export async function createTestPdf(pageCount: number, offset = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([widthForPage(i, offset), PAGE_HEIGHT]);
  }
  return await doc.save();
}

/**
 * A one-page fixture carrying a `/Rotate` value. Viewers show such a page
 * turned, so operations that must follow the displayed orientation can be told
 * apart from ones that read the raw MediaBox.
 */
export async function createRotatedTestPdf(
  angle: number,
  width = FIRST_PAGE_WIDTH,
  height = PAGE_HEIGHT,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]).setRotation(degrees(angle));
  return await doc.save();
}

/** Reads back the width of every page, rounded to survive PDF float output. */
export async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => Math.round(page.getWidth()));
}

/** Reads back `[width, height]` for every page. */
export async function pageSizes(bytes: Uint8Array): Promise<Array<[number, number]>> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())]);
}

/**
 * Takes a valid PDF and points its trailer at an encryption dictionary, which
 * is what makes pdf-lib refuse the document as password-protected.
 */
export async function createEncryptedLikePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([100, 400]);
  // Object streams would emit an XRef stream instead of a classic `trailer`
  // dictionary, leaving nothing to patch.
  const base = await doc.save({ useObjectStreams: false });

  const text = new TextDecoder('latin1').decode(base);
  const patched = text.replace(/trailer\s*\n?<</, 'trailer\n<< /Encrypt 1 0 R');
  if (patched === text) {
    throw new Error('fixture failed: no trailer dictionary found to patch');
  }

  const bytes = new Uint8Array(patched.length);
  for (let i = 0; i < patched.length; i++) {
    bytes[i] = patched.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);

  const chunk = new Uint8Array(4 + body.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(body, 4);
  view.setUint32(4 + body.length, crc32(body));
  return chunk;
}

/**
 * Encodes a real, decodable 8-bit RGBA PNG of the requested size.
 * @param alpha 255 for opaque; lower values exercise transparency handling.
 */
export function createPngBytes(width: number, height: number, alpha = 255): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      raw[offset++] = (x * 8) % 256; // R
      raw[offset++] = (y * 8) % 256; // G
      raw[offset++] = 128; // B
      raw[offset++] = alpha;
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlacing

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', new Uint8Array(deflateSync(raw))),
    pngChunk('IEND', new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let position = 0;
  for (const part of parts) {
    png.set(part, position);
    position += part.length;
  }
  return png;
}

/** A minimal baseline 1x1 JPEG, used to exercise the JPEG embed path. */
const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
  'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
  'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
  'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
  'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEB' +
  'AAA/APn+iiigD//Z';

export function createJpegBytes(): Uint8Array {
  const binary = atob(TINY_JPEG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function asFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes], name, { type });
}
