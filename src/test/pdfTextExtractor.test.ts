import { describe, expect, it, vi, afterEach } from 'vitest';
import * as pdfDocument from '../engine/pdfDocument';
import { extractPdfDocument } from '../engine/pdfTextExtractor';
import type { DocumentBlock, ExtractedDocument } from '../engine/documentModel';
import { createTextPdf, createTestPdf, TEXT_PAGE_HEIGHT } from './fixtures';

function source(bytes: Uint8Array, name = 'report.pdf') {
  return { id: 'fixture', name, bytes };
}

/** Flattens a page's blocks to plain text, for order and content assertions. */
function textOf(blocks: DocumentBlock[]): string[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case 'heading':
      case 'paragraph':
        return block.runs.map((run) => run.text).join('');
      case 'list':
        return block.items.map((item) => item.map((run) => run.text).join('')).join(' | ');
      case 'table':
        return block.rows
          .map((row) => row.map((cell) => cell.map((run) => run.text).join('')).join(' | '))
          .join(' / ');
    }
  });
}

function allText(document: ExtractedDocument): string {
  return document.pages.flatMap((page) => textOf(page.blocks)).join('\n');
}

const TWO_PAGE_FIXTURE = [
  [
    { text: 'Annual Report', x: 60, y: 720, size: 22, bold: true },
    { text: 'The first page carries an opening paragraph', x: 60, y: 680 },
    { text: 'that wraps onto a second line.', x: 60, y: 666 },
  ],
  [
    { text: 'Second Page Heading', x: 60, y: 720, size: 18, bold: true },
    { text: 'Range-only body text lives here.', x: 60, y: 680 },
  ],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pdf text extraction', () => {
  it('extracts every page in source order for an all-pages scope', async () => {
    const bytes = await createTextPdf(TWO_PAGE_FIXTURE);
    const document = await extractPdfDocument(source(bytes), { mode: 'all' });

    expect(document.sourceName).toBe('report.pdf');
    expect(document.pages.map((page) => page.sourcePageIndex)).toEqual([0, 1]);
    expect(document.pages.every((page) => page.hasExtractableText)).toBe(true);

    expect(textOf(document.pages[0].blocks)).toEqual([
      'Annual Report',
      'The first page carries an opening paragraph that wraps onto a second line.',
    ]);
    expect(document.pages[0].blocks[0]).toMatchObject({ kind: 'heading', level: 1 });
    expect(textOf(document.pages[1].blocks)).toEqual([
      'Second Page Heading',
      'Range-only body text lives here.',
    ]);
  });

  it('marks bold and italic runs from the source fonts', async () => {
    const bytes = await createTextPdf([
      [
        { text: 'Plain body text on this page.', x: 60, y: 700 },
        { text: 'Bold words here.', x: 60, y: 660, bold: true },
        { text: 'Slanted words here.', x: 60, y: 620, italic: true },
      ],
    ]);
    const document = await extractPdfDocument(source(bytes), { mode: 'all' });
    const runs = document.pages[0].blocks.flatMap((block) =>
      block.kind === 'paragraph' ? block.runs : [],
    );

    expect(runs).toContainEqual(expect.objectContaining({ text: 'Bold words here.', bold: true }));
    expect(runs).toContainEqual(
      expect.objectContaining({ text: 'Slanted words here.', italic: true }),
    );
    expect(runs).toContainEqual({ text: 'Plain body text on this page.' });
  });

  it('extracts only the pages inside an engine range', async () => {
    const bytes = await createTextPdf(TWO_PAGE_FIXTURE);
    const document = await extractPdfDocument(source(bytes), {
      mode: 'range',
      startIndex: 1,
      endIndexExclusive: 2,
    });

    expect(document.pages.map((page) => page.sourcePageIndex)).toEqual([1]);
    expect(allText(document)).toContain('Range-only body text lives here.');
    expect(allText(document)).not.toContain('Annual Report');
  });

  it('refuses a range that leaves the document', async () => {
    const bytes = await createTextPdf(TWO_PAGE_FIXTURE);

    await expect(
      extractPdfDocument(source(bytes), { mode: 'range', startIndex: 0, endIndexExclusive: 9 }),
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION', fileName: 'report.pdf' });
  });

  it('reports progress once per selected page, ending at the total', async () => {
    const bytes = await createTextPdf([...TWO_PAGE_FIXTURE, [{ text: 'Third page.', x: 60, y: 700 }]]);
    const calls: Array<[number, number]> = [];

    await extractPdfDocument(source(bytes), { mode: 'all' }, (completed, total) => {
      calls.push([completed, total]);
    });

    expect(calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('keeps a link only when its scheme is safe', async () => {
    const bytes = await createTextPdf([
      [
        { text: 'Visit the handbook', x: 60, y: 700, href: 'https://example.com/handbook' },
        { text: 'Mail the team', x: 60, y: 660, href: 'mailto:team@example.com' },
        { text: 'Run this script', x: 60, y: 620, href: 'javascript:alert(1)' },
      ],
    ]);
    const document = await extractPdfDocument(source(bytes), { mode: 'all' });
    const runs = document.pages[0].blocks.flatMap((block) =>
      block.kind === 'paragraph' ? block.runs : [],
    );

    expect(runs).toContainEqual(
      expect.objectContaining({ text: 'Visit the handbook', href: 'https://example.com/handbook' }),
    );
    expect(runs).toContainEqual(
      expect.objectContaining({ text: 'Mail the team', href: 'mailto:team@example.com' }),
    );
    expect(runs.find((run) => run.text === 'Run this script')?.href).toBeUndefined();
  });

  it('removes a header and footer repeated across the selected pages', async () => {
    const margins = (body: string) => [
      { text: 'Acme Internal Handbook', x: 60, y: TEXT_PAGE_HEIGHT - 40 },
      { text: body, x: 60, y: 500 },
      { text: 'Confidential — do not distribute', x: 60, y: 40 },
    ];
    const bytes = await createTextPdf([
      margins('Body one.'),
      margins('Body two.'),
      margins('Body three.'),
    ]);

    const document = await extractPdfDocument(source(bytes), { mode: 'all' });
    const text = allText(document);

    expect(text).toContain('Body one.');
    expect(text).toContain('Body three.');
    expect(text).not.toContain('Acme Internal Handbook');
    expect(text).not.toContain('Confidential');
  });

  it('reports an empty page without blocking the rest of the export', async () => {
    const bytes = await createTextPdf([
      [{ text: 'Page one has text.', x: 60, y: 700 }],
      [],
      [{ text: 'Page three has text.', x: 60, y: 700 }],
    ]);

    const document = await extractPdfDocument(source(bytes), { mode: 'all' });

    expect(document.pages.map((page) => page.hasExtractableText)).toEqual([true, false, true]);
    expect(document.pages[1].blocks).toEqual([]);
    expect(document.warnings).toContainEqual({ code: 'EMPTY_PAGE', pageNumber: 2 });
    expect(allText(document)).toContain('Page three has text.');
  });

  it('always records the omitted-figures and flattening limitations', async () => {
    const bytes = await createTextPdf([[{ text: 'Anything at all.', x: 60, y: 700 }]]);
    const document = await extractPdfDocument(source(bytes), { mode: 'all' });

    expect(document.warnings).toContainEqual({ code: 'FIGURES_OMITTED' });
    expect(document.warnings).toContainEqual({ code: 'COMPLEX_CONTENT_MAY_FLATTEN' });
    // pdf-lib writes no structure tree, so this document is untagged.
    expect(document.warnings).toContainEqual({ code: 'UNTAGGED_LAYOUT' });
  });

  it('refuses a document with no text layer so no empty file is offered', async () => {
    const bytes = await createTestPdf(2);

    await expect(extractPdfDocument(source(bytes, 'scan.pdf'), { mode: 'all' })).rejects.toMatchObject(
      { code: 'NO_EXTRACTABLE_TEXT', fileName: 'scan.pdf', recoverable: true },
    );
  });

  it('destroys the pdf.js document on success and on failure', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const page = {
      getViewport: () => ({ width: 612, height: 792 }),
      getTextContent: vi.fn().mockResolvedValue({ items: [], styles: {} }),
      getStructTree: vi.fn().mockResolvedValue(null),
      getAnnotations: vi.fn().mockResolvedValue([]),
      getOperatorList: vi.fn().mockResolvedValue({}),
      commonObjs: { has: () => false, get: () => null },
      cleanup: vi.fn(),
    };

    const opener = vi.spyOn(pdfDocument, 'openPdfDocument');
    opener.mockResolvedValue({ numPages: 1, getPage: async () => page, destroy } as never);

    // An empty text layer is a failure, and the document must still be released.
    await expect(
      extractPdfDocument(source(new Uint8Array(), 'mock.pdf'), { mode: 'all' }),
    ).rejects.toMatchObject({ code: 'NO_EXTRACTABLE_TEXT' });
    expect(destroy).toHaveBeenCalledTimes(1);

    page.getTextContent.mockResolvedValue({
      items: [
        {
          str: 'Mocked text content.',
          dir: 'ltr',
          transform: [11, 0, 0, 11, 60, 700],
          width: 100,
          height: 11,
          fontName: 'f1',
          hasEOL: false,
        },
      ],
      styles: { f1: { fontFamily: 'sans-serif', ascent: 0.7, descent: -0.2, vertical: false } },
    });

    const document = await extractPdfDocument(source(new Uint8Array(), 'mock.pdf'), { mode: 'all' });
    expect(allText(document)).toBe('Mocked text content.');
    expect(destroy).toHaveBeenCalledTimes(2);
  });

  it('flags a page whose text runs in a complex writing direction', async () => {
    const page = {
      getViewport: () => ({ width: 612, height: 792 }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          {
            str: 'שלום עולם',
            dir: 'rtl',
            transform: [11, 0, 0, 11, 400, 700],
            width: 60,
            height: 11,
            fontName: 'f1',
            hasEOL: false,
          },
        ],
        styles: { f1: { fontFamily: 'sans-serif', ascent: 0.7, descent: -0.2, vertical: false } },
      }),
      getStructTree: vi.fn().mockResolvedValue(null),
      getAnnotations: vi.fn().mockResolvedValue([]),
      getOperatorList: vi.fn().mockResolvedValue({}),
      commonObjs: { has: () => false, get: () => null },
      cleanup: vi.fn(),
    };

    vi.spyOn(pdfDocument, 'openPdfDocument').mockResolvedValue({
      numPages: 1,
      getPage: async () => page,
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    const document = await extractPdfDocument(source(new Uint8Array(), 'rtl.pdf'), { mode: 'all' });

    expect(allText(document)).toBe('שלום עולם');
    expect(document.warnings).toContainEqual({ code: 'COMPLEX_WRITING_DIRECTION', pageNumber: 1 });
  });

  it('uses tagged heading roles when the structure tree provides them', async () => {
    const item = (str: string, y: number, size: number) => ({
      str,
      dir: 'ltr',
      transform: [size, 0, 0, size, 60, y],
      width: str.length * size * 0.5,
      height: size,
      fontName: 'f1',
      hasEOL: false,
    });

    const page = {
      getViewport: () => ({ width: 612, height: 792 }),
      getTextContent: vi.fn().mockResolvedValue({
        items: [
          item('Overview', 740, 16),
          item('Body copy that fills out this page.', 700, 11),
          item('Details', 640, 13),
        ],
        styles: { f1: { fontFamily: 'sans-serif', ascent: 0.7, descent: -0.2, vertical: false } },
      }),
      getStructTree: vi.fn().mockResolvedValue({
        role: 'Root',
        children: [
          { role: 'H2', children: [{ type: 'content', id: 'p0_mc0' }] },
          { role: 'P', children: [{ type: 'content', id: 'p0_mc1' }] },
          { role: 'H3', children: [{ type: 'content', id: 'p0_mc2' }] },
        ],
      }),
      getAnnotations: vi.fn().mockResolvedValue([]),
      getOperatorList: vi.fn().mockResolvedValue({}),
      commonObjs: { has: () => false, get: () => null },
      cleanup: vi.fn(),
    };

    vi.spyOn(pdfDocument, 'openPdfDocument').mockResolvedValue({
      numPages: 1,
      getPage: async () => page,
      destroy: vi.fn().mockResolvedValue(undefined),
    } as never);

    const document = await extractPdfDocument(source(new Uint8Array(), 'tagged.pdf'), { mode: 'all' });

    expect(document.pages[0].blocks.map((block) => (block.kind === 'heading' ? block.level : block.kind))).toEqual(
      [2, 'paragraph', 3],
    );
    expect(document.warnings).not.toContainEqual({ code: 'UNTAGGED_LAYOUT' });
  });
});
