import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { PdfDocumentConversionPanel } from '../components/workspaces/PdfDocumentConversionPanel';
import { urlTracker } from '../engine/validation';
import { ProcessingError } from '../engine/errors';
import { createTextPdf, asFile } from './fixtures';
import type { ExtractedDocument, ExtractionScope } from '../engine/documentModel';

/**
 * The panel is tested against stand-ins for extraction and serialization, so
 * what is under test is the state machine: which scope reaches the engine,
 * when a report is trusted, and whether one analysis really does feed both
 * downloads. Extraction and both serializers have their own suites; repeating
 * them here would only make these tests slow and vague.
 *
 * The page count is not mocked. It comes from a real document through the
 * shared pdf.js loader, because range validation is only meaningful against a
 * real page count.
 */
const engine = vi.hoisted(() => ({
  scopes: [] as unknown[],
  extractCalls: 0,
  extractFailure: null as unknown,
  docxFailure: null as unknown,
  docxCalls: 0,
  markdownCalls: 0,
  delivered: [] as Array<{ entries: Array<{ name: string }>; zipName: string }>,
  downloads: [] as Array<{ name: string; mime: string }>,
  pageCountOverride: null as number | null,
}));

function documentFor(sourceName: string, scope: ExtractionScope): ExtractedDocument {
  return {
    sourceName,
    scope,
    pages: [
      {
        sourcePageIndex: 0,
        hasExtractableText: true,
        blocks: [
          { kind: 'heading', level: 1, runs: [{ text: 'Report' }] },
          { kind: 'paragraph', runs: [{ text: 'Body ' }, { text: 'link', href: 'https://example.com' }] },
          { kind: 'list', ordered: false, items: [[{ text: 'One' }]] },
          { kind: 'table', rows: [[[{ text: 'A' }], [{ text: 'B' }]]] },
        ],
      },
      { sourcePageIndex: 1, hasExtractableText: false, blocks: [] },
    ],
    warnings: [{ code: 'FIGURES_OMITTED' }, { code: 'EMPTY_PAGE', pageNumber: 2 }],
  };
}

vi.mock('../engine/pdfTextExtractor', () => ({
  extractPdfDocument: async (
    source: { name: string },
    scope: ExtractionScope,
    onProgress?: (completed: number, total: number) => void,
  ) => {
    engine.extractCalls += 1;
    engine.scopes.push(scope);
    onProgress?.(1, 2);
    onProgress?.(2, 2);
    if (engine.extractFailure) throw engine.extractFailure;
    return documentFor(source.name, scope);
  },
}));

vi.mock('../engine/docxExporter', () => ({
  exportDocx: async () => {
    engine.docxCalls += 1;
    if (engine.docxFailure) throw engine.docxFailure;
    return new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])]);
  },
}));

vi.mock('../engine/markdownExporter', () => ({
  exportMarkdown: () => {
    engine.markdownCalls += 1;
    return new TextEncoder().encode('# Report\n');
  },
}));

/**
 * The page count is real unless a test needs the degenerate answer. pdf.js is
 * lenient enough to report one page for a document whose page tree is empty,
 * so the panel's guard against a count below one can only be reached by
 * standing in for the loader.
 */
vi.mock('../engine/pdfRenderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/pdfRenderer')>();
  return {
    ...actual,
    getPdfPageCount: async (source: Parameters<typeof actual.getPdfPageCount>[0]) =>
      engine.pageCountOverride ?? actual.getPdfPageCount(source),
  };
});

vi.mock('../engine/download', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/download')>();
  return {
    ...actual,
    downloadFile: (_content: unknown, name: string, mime: string) => {
      engine.downloads.push({ name, mime });
    },
    deliverOutputs: async (
      entries: Array<{ name: string }>,
      zipName: string,
      mime = 'application/pdf',
    ) => {
      engine.delivered.push({ entries, zipName });
      if (entries.length === 1) {
        engine.downloads.push({ name: entries[0].name, mime });
        return { kind: 'file' as const, name: entries[0].name, data: new Blob([]) };
      }
      engine.downloads.push({ name: zipName, mime: 'application/zip' });
      return { kind: 'zip' as const, name: zipName, entries: entries as never };
    },
  };
});

/** The dropzone input is hidden and aria-hidden, so it is reached by query. */
function selectFile(container: HTMLElement, file: File): void {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

/** A four-page text PDF, so one-based ranges have somewhere to be wrong. */
async function textPdfFile(name = 'report.pdf'): Promise<File> {
  const bytes = await createTextPdf([
    [{ text: 'Report title', x: 50, y: 720, size: 22, bold: true }],
    [{ text: 'Second page body', x: 50, y: 720 }],
    [{ text: 'Third page body', x: 50, y: 720 }],
    [{ text: 'Fourth page body', x: 50, y: 720 }],
  ]);
  return asFile(bytes, name, 'application/pdf');
}

/** Loads a file and waits for the page count to appear. */
async function loadDocument(container: HTMLElement, file?: File): Promise<void> {
  selectFile(container, file ?? (await textPdfFile()));
  await screen.findByRole('button', { name: 'Analyze document' }, { timeout: 10_000 });
}

async function analyze(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Analyze document' }));
  await screen.findByRole('button', { name: 'Download Word' });
}

function chooseRange(startPage: number, endPage: number): void {
  fireEvent.click(screen.getByRole('radio', { name: 'Page range' }));
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Start page' }), {
    target: { value: String(startPage) },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'End page' }), {
    target: { value: String(endPage) },
  });
}

describe('FE-11..FE-13 — PDF to Word / Markdown panel', () => {
  beforeEach(() => {
    engine.scopes = [];
    engine.extractCalls = 0;
    engine.extractFailure = null;
    engine.docxFailure = null;
    engine.docxCalls = 0;
    engine.markdownCalls = 0;
    engine.delivered = [];
    engine.downloads = [];
    engine.pageCountOverride = null;
    urlTracker.revokeAll();
  });

  afterEach(() => {
    urlTracker.revokeAll();
  });

  it('accepts one PDF and reports its page count', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText(/4 pages/i)).toBeInTheDocument();
  });

  it('refuses a file that is not a PDF and stays idle', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    selectFile(container, asFile(new TextEncoder().encode('plain text'), 'notes.pdf', 'application/pdf'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/notes\.pdf/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyze document' })).not.toBeInTheDocument();
  });

  it('selects the whole PDF by default and reveals range inputs on request', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    expect(screen.getByRole('radio', { name: 'Whole PDF' })).toBeChecked();
    expect(screen.queryByRole('spinbutton', { name: 'Start page' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Page range' }));

    expect(screen.getByRole('radio', { name: 'Page range' })).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Start page' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'End page' })).toBeInTheDocument();
  });

  it('sends an all-pages scope for the whole document', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    expect(engine.scopes).toEqual([{ mode: 'all' }]);
  });

  it('converts an inclusive one-based range into engine indexes', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    chooseRange(2, 4);
    await analyze();

    expect(engine.scopes).toEqual([{ mode: 'range', startIndex: 1, endIndexExclusive: 4 }]);
  });

  it.each([
    [0, 3, /first page is page 1/i],
    [3, 2, /end page cannot come before/i],
    [2, 5, /only has 4 pages/i],
  ])('blocks analysis for the range %i to %i', async (startPage, endPage, message) => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    chooseRange(startPage, endPage);

    expect(screen.getByRole('button', { name: 'Analyze document' })).toBeDisabled();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(engine.extractCalls).toBe(0);
  });

  it('renders the structure report and empty pages as one-based numbers', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    const report = screen.getByRole('table', { name: /analysis/i });
    const rowText = (label: string) =>
      within(report).getByRole('row', { name: new RegExp(`^${label}`, 'i') }).textContent ?? '';

    expect(rowText('Pages')).toMatch(/2/);
    expect(rowText('Headings')).toMatch(/1/);
    expect(rowText('Paragraphs')).toMatch(/1/);
    expect(rowText('Lists')).toMatch(/1/);
    expect(rowText('Tables')).toMatch(/1/);
    expect(rowText('Links')).toMatch(/1/);

    expect(screen.getByText(/no extractable text on page 2/i)).toBeInTheDocument();
  });

  it('always states that figures are omitted and the output is not layout-identical', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    expect(screen.getByText(/figures.*omitted/i)).toBeInTheDocument();
    expect(screen.getByText(/not a layout-identical copy/i)).toBeInTheDocument();
  });

  it('downloads Word from the cached analysis without extracting again', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    fireEvent.click(screen.getByRole('button', { name: 'Download Word' }));

    await waitFor(() => expect(engine.docxCalls).toBe(1));
    expect(engine.extractCalls).toBe(1);
    expect(engine.markdownCalls).toBe(0);
    expect(engine.downloads).toEqual([
      {
        name: 'report.docx',
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]);
  });

  it('downloads Markdown from the cached analysis without extracting again', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    await waitFor(() => expect(engine.markdownCalls).toBe(1));
    expect(engine.extractCalls).toBe(1);
    expect(engine.docxCalls).toBe(0);
    expect(engine.downloads).toEqual([
      { name: 'report.md', mime: 'text/markdown;charset=utf-8' },
    ]);
  });

  it('packages both formats into one archive', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    fireEvent.click(screen.getByRole('button', { name: 'Download Both' }));

    await waitFor(() => expect(engine.delivered).toHaveLength(1));
    expect(engine.delivered[0].zipName).toBe('report-documents.zip');
    expect(engine.delivered[0].entries.map((entry) => entry.name)).toEqual([
      'report.docx',
      'report.md',
    ]);
    expect(engine.extractCalls).toBe(1);
  });

  it('names range outputs with one-based page numbers', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);

    chooseRange(2, 4);
    await analyze();

    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }));

    await waitFor(() => expect(engine.downloads).toHaveLength(1));
    expect(engine.downloads[0].name).toBe('report-pages-2-4.md');
  });

  it('invalidates a report when the range changes, until the document is analyzed again', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    chooseRange(2, 3);

    expect(screen.queryByRole('button', { name: 'Download Word' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Markdown' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze document' })).toBeEnabled();

    await analyze();

    expect(engine.scopes).toEqual([
      { mode: 'all' },
      { mode: 'range', startIndex: 1, endIndexExclusive: 3 },
    ]);
  });

  it('keeps the file and the chosen range after a scanned document is refused', async () => {
    engine.extractFailure = new ProcessingError('NO_EXTRACTABLE_TEXT', 'no text layer', {
      fileName: 'report.pdf',
    });

    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    chooseRange(2, 3);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze document' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/no extractable text/i)).toBeInTheDocument();
    expect(within(alert).getByText(/OCR/)).toBeInTheDocument();

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Page range' })).toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Start page' })).toHaveValue(2);
    expect(screen.getByRole('spinbutton', { name: 'End page' })).toHaveValue(3);
    expect(screen.getByRole('button', { name: 'Analyze document' })).toBeEnabled();
  });

  it('keeps the analysis usable after a failed export', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    engine.docxFailure = new ProcessingError('OUT_OF_MEMORY', 'allocation failed');

    fireEvent.click(screen.getByRole('button', { name: 'Download Word' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Download Word' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toBeEnabled();
    expect(engine.extractCalls).toBe(1);
  });

  it('returns to idle and releases tracked URLs on reset', async () => {
    const { container } = render(<PdfDocumentConversionPanel />);
    await loadDocument(container);
    await analyze();

    urlTracker.create(new Blob(['tracked']));
    expect(urlTracker.size).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    fireEvent.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Analyze document' })).not.toBeInTheDocument(),
    );
    expect(urlTracker.size).toBe(0);
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
  });

  it('refuses a document reporting no pages instead of offering an empty export', async () => {
    engine.pageCountOverride = 0;

    const { container } = render(<PdfDocumentConversionPanel />);
    selectFile(container, await textPdfFile('blank.pdf'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/blank\.pdf/)).toBeInTheDocument();
    expect(within(alert).getByText(/no pages/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analyze document' })).not.toBeInTheDocument();
  });
});
