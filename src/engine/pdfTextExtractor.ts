/**
 * The pdf.js side of document conversion: reads positioned text, font styling,
 * structure roles, and link annotations off each selected page and hands plain
 * data to the layout analyzer.
 *
 * Everything pdf.js-shaped stops here. The analyzer and both exporters see only
 * numbers, strings, and the neutral document model, which is what lets the
 * layout rules be tested without a PDF and the exporters without a browser.
 */

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PdfSource } from './types';
import { openPdfDocument } from './pdfDocument';
import { ProcessingError, isProcessingError, toProcessingError } from './errors';
import {
  pageIndicesForScope,
  type ExtractedDocument,
  type ExtractedPage,
  type ExtractionScope,
  type ExtractionWarning,
} from './documentModel';
import { analyzePageLayout, type PositionedToken } from './layoutAnalyzer';

/** Share of page height at each edge searched for running headers and footers. */
export const MARGIN_BAND_RATIO = 0.1;
/** A margin line must repeat on at least this many pages to be dropped. */
export const REPEATED_MARGIN_MIN_PAGES = 3;
/** ...and on at least this share of the selected pages. */
export const REPEATED_MARGIN_MIN_SHARE = 0.6;

const BOLD_NAME = /bold|black|heavy|semibold|demibold/i;
const ITALIC_NAME = /italic|oblique/i;

type TextItemLike = {
  str: string;
  dir?: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL?: boolean;
};

type FontStyle = { bold: boolean; italic: boolean; vertical: boolean };

type RawPage = {
  sourcePageIndex: number;
  pageWidth: number;
  pageHeight: number;
  tokens: PositionedToken[];
  structureRoles: string[];
};

function isTextItem(item: unknown): item is TextItemLike {
  return typeof item === 'object' && item !== null && typeof (item as TextItemLike).str === 'string';
}

/** Collects structure-tree roles in document order; `null` for an untagged page. */
function collectRoles(node: unknown, roles: string[] = []): string[] {
  if (typeof node !== 'object' || node === null) return roles;
  const record = node as { role?: unknown; children?: unknown };
  if (typeof record.role === 'string' && record.role !== 'Root') roles.push(record.role);
  if (Array.isArray(record.children)) {
    for (const child of record.children) collectRoles(child, roles);
  }
  return roles;
}

/**
 * Reads bold and italic from the real font, which pdf.js only exposes on the
 * page's resolved font objects — `getTextContent` styles carry a generic
 * family such as "sans-serif" and could never tell Helvetica from
 * Helvetica-Bold. Populating those objects is what `getOperatorList` is for
 * here; it is skipped for pages with no text and never allowed to fail a
 * conversion, in which case runs simply come out unstyled.
 */
async function fontStyles(page: PDFPageProxy, fontNames: string[]): Promise<Map<string, FontStyle>> {
  const styles = new Map<string, FontStyle>();
  if (fontNames.length === 0) return styles;

  try {
    await page.getOperatorList();
  } catch {
    return styles;
  }

  for (const name of fontNames) {
    try {
      if (!page.commonObjs.has(name)) continue;
      const font = page.commonObjs.get(name) as {
        name?: string;
        bold?: boolean;
        italic?: boolean;
        vertical?: boolean;
      } | null;
      if (!font) continue;

      const fontName = typeof font.name === 'string' ? font.name : '';
      styles.set(name, {
        bold: font.bold === true || BOLD_NAME.test(fontName),
        italic: font.italic === true || ITALIC_NAME.test(fontName),
        vertical: font.vertical === true,
      });
    } catch {
      // A font that will not resolve costs styling on those runs, nothing more.
    }
  }

  return styles;
}

type LinkTarget = { rect: number[]; url: string };

function linkTargets(annotations: unknown[]): LinkTarget[] {
  const links: LinkTarget[] = [];
  for (const annotation of annotations) {
    const record = annotation as { subtype?: unknown; rect?: unknown; url?: unknown };
    if (record.subtype !== 'Link') continue;
    if (typeof record.url !== 'string' || !Array.isArray(record.rect)) continue;
    links.push({ rect: record.rect as number[], url: record.url });
  }
  return links;
}

/** The link whose rectangle covers the token box, if any. */
function hrefForBox(links: LinkTarget[], left: number, bottom: number, right: number, top: number) {
  for (const link of links) {
    const [x1, y1, x2, y2] = link.rect;
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    if (left < maxX && right > minX && bottom < maxY && top > minY) return link.url;
  }
  return undefined;
}

function directionOf(item: TextItemLike, style: FontStyle | undefined, vertical: boolean) {
  if (vertical || style?.vertical) return 'ttb' as const;
  return item.dir === 'rtl' ? ('rtl' as const) : ('ltr' as const);
}

function tokensForPage(
  textContent: { items: unknown[]; styles?: Record<string, { vertical?: boolean }> },
  fonts: Map<string, FontStyle>,
  links: LinkTarget[],
): PositionedToken[] {
  const tokens: PositionedToken[] = [];

  for (const item of textContent.items) {
    if (!isTextItem(item)) continue;
    if (!item.str) continue;

    const transform = item.transform ?? [];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;
    const scaled = Math.hypot(transform[2] ?? 0, transform[3] ?? 0);
    const fontSize = scaled > 0 ? scaled : item.height || 0;
    const height = item.height > 0 ? item.height : fontSize;
    const width = item.width > 0 ? item.width : 0;
    const style = fonts.get(item.fontName);
    const vertical = textContent.styles?.[item.fontName]?.vertical === true;

    tokens.push({
      text: item.str,
      x,
      y,
      width,
      height,
      fontSize,
      fontName: item.fontName,
      direction: directionOf(item, style, vertical),
      bold: style?.bold === true,
      italic: style?.italic === true,
      hasEOL: item.hasEOL === true,
      href: hrefForBox(links, x, y, x + width, y + height),
    });
  }

  return tokens;
}

function normalizedKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Drops running headers and footers.
 *
 * This is a document-level decision on purpose: one page cannot tell a running
 * title from a real heading. Text only qualifies when it sits in a margin band
 * and recurs across most of the selected pages, so a one-off line in the margin
 * of a short selection survives.
 */
export function removeRepeatedMargins(pages: RawPage[]): void {
  if (pages.length < REPEATED_MARGIN_MIN_PAGES) return;

  const pagesPerKey = new Map<string, Set<number>>();

  const bandOf = (token: PositionedToken, pageHeight: number): 'top' | 'bottom' | null => {
    if (pageHeight <= 0) return null;
    if (token.y >= pageHeight * (1 - MARGIN_BAND_RATIO)) return 'top';
    if (token.y <= pageHeight * MARGIN_BAND_RATIO) return 'bottom';
    return null;
  };

  pages.forEach((page, index) => {
    for (const token of page.tokens) {
      const band = bandOf(token, page.pageHeight);
      const key = normalizedKey(token.text);
      if (!band || !key) continue;
      const seen = pagesPerKey.get(`${band}:${key}`) ?? new Set<number>();
      seen.add(index);
      pagesPerKey.set(`${band}:${key}`, seen);
    }
  });

  const threshold = Math.max(REPEATED_MARGIN_MIN_PAGES, REPEATED_MARGIN_MIN_SHARE * pages.length);
  const repeated = new Set(
    [...pagesPerKey.entries()]
      .filter(([, seen]) => seen.size >= threshold)
      .map(([key]) => key),
  );
  if (repeated.size === 0) return;

  for (const page of pages) {
    page.tokens = page.tokens.filter((token) => {
      const band = bandOf(token, page.pageHeight);
      if (!band) return true;
      return !repeated.has(`${band}:${normalizedKey(token.text)}`);
    });
  }
}

function withFileName(error: unknown, fileName: string): ProcessingError {
  if (isProcessingError(error) && !error.fileName) {
    return new ProcessingError(error.code, error.message, { fileName, cause: error.cause });
  }
  return toProcessingError(error, 'UNKNOWN', fileName);
}

async function readPage(page: PDFPageProxy, sourcePageIndex: number): Promise<RawPage> {
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent({ includeMarkedContent: true });

  let structureRoles: string[] = [];
  try {
    structureRoles = collectRoles(await page.getStructTree());
  } catch {
    // An unreadable structure tree just means the page is treated as untagged.
  }

  let annotations: unknown[] = [];
  try {
    annotations = await page.getAnnotations({ intent: 'display' });
  } catch {
    // Losing annotations costs hyperlinks, not text.
  }

  const hasText = textContent.items.some((item) => isTextItem(item) && item.str.trim().length > 0);
  const fontNames = hasText ? Object.keys(textContent.styles ?? {}) : [];
  const fonts = await fontStyles(page, fontNames);

  return {
    sourcePageIndex,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    tokens: tokensForPage(textContent, fonts, linkTargets(annotations)),
    structureRoles,
  };
}

/**
 * Builds the neutral document for a source and page scope.
 *
 * @param scope zero-based, inclusive start and exclusive end.
 * @param onProgress called once per processed page, from 1 to the total.
 * @throws ProcessingError `NO_EXTRACTABLE_TEXT` when no selected page has a
 * text layer, so a scan produces an explanation rather than an empty file.
 */
export async function extractPdfDocument(
  source: PdfSource,
  scope: ExtractionScope,
  onProgress?: (completed: number, total: number) => void,
): Promise<ExtractedDocument> {
  const pdf: PDFDocumentProxy = await openPdfDocument(source);

  try {
    let indexes: number[];
    try {
      indexes = pageIndicesForScope(scope, pdf.numPages);
    } catch (error) {
      throw withFileName(error, source.name);
    }

    const rawPages: RawPage[] = [];
    const warnings: ExtractionWarning[] = [
      { code: 'FIGURES_OMITTED' },
      { code: 'COMPLEX_CONTENT_MAY_FLATTEN' },
    ];

    for (const index of indexes) {
      const page = await pdf.getPage(index + 1);
      try {
        rawPages.push(await readPage(page, index));
      } finally {
        page.cleanup?.();
      }
      onProgress?.(rawPages.length, indexes.length);
    }

    removeRepeatedMargins(rawPages);

    const tagged = rawPages.some((page) => page.structureRoles.length > 0);
    if (!tagged) warnings.push({ code: 'UNTAGGED_LAYOUT' });

    const pages: ExtractedPage[] = rawPages.map((raw) => {
      const hasExtractableText = raw.tokens.some((token) => token.text.trim().length > 0);
      if (!hasExtractableText) {
        warnings.push({ code: 'EMPTY_PAGE', pageNumber: raw.sourcePageIndex + 1 });
      }
      if (raw.tokens.some((token) => token.direction !== 'ltr')) {
        warnings.push({
          code: 'COMPLEX_WRITING_DIRECTION',
          pageNumber: raw.sourcePageIndex + 1,
        });
      }

      return {
        sourcePageIndex: raw.sourcePageIndex,
        hasExtractableText,
        blocks: hasExtractableText
          ? analyzePageLayout({
              pageWidth: raw.pageWidth,
              pageHeight: raw.pageHeight,
              tokens: raw.tokens,
              structureRoles: raw.structureRoles,
            })
          : [],
      };
    });

    if (!pages.some((page) => page.hasExtractableText)) {
      throw new ProcessingError('NO_EXTRACTABLE_TEXT', 'no extractable text layer', {
        fileName: source.name,
      });
    }

    return { sourceName: source.name, scope, pages, warnings };
  } catch (error) {
    throw withFileName(error, source.name);
  } finally {
    await pdf.destroy();
  }
}
