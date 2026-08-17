# PDF to Word and Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add private, browser-only conversion of text-based PDFs into editable Word DOCX and Markdown files, for either the whole document or one contiguous page range.

**Architecture:** Reuse the installed PDF.js worker to extract positioned text, structural hints, and link annotations into a format-neutral document model. Serialize that model directly to Markdown and, through the browser-compatible docx package, to DOCX; the React workspace analyzes once and can download either format or both in a ZIP.

**Tech Stack:** React 18, TypeScript 5.7, Vite 6, pdfjs-dist 4.10, docx 9.x, JSZip 3.10, Vitest 3, Testing Library, Playwright Chromium.

## Global Constraints

- Keep the application static and compatible with GitHub Pages; add no runtime backend, upload endpoint, account, storage, analytics, telemetry, or third-party request.
- Process document bytes and filenames only in the active browser tab.
- Self-host every runtime asset through the Vite build; do not load a CDN script, font, OCR model, or language file.
- Support text-based PDFs only in this release. Image-only documents must produce a recoverable OCR-required message rather than an empty download.
- Accept one PDF and convert either all pages or one inclusive, contiguous, one-based page range entered by the user.
- Keep engine indexes zero-based. Represent a range internally as startIndex inclusive and endIndexExclusive exclusive.
- Build one ExtractedDocument and reuse it for Word, Markdown, and combined exports.
- Export headings, paragraphs, ordered and unordered lists, conservative simple tables, safe external hyperlinks, Unicode text, and page boundaries.
- Omit figures, page screenshots, macros, embedded fonts, equations-as-OMML or LaTeX, form fields, and arbitrary page positioning.
- Treat uncertain structures as paragraphs; do not invent table cells or heading levels when confidence is insufficient.
- Allow only http, https, and mailto hyperlinks. Render every other link target as unlinked text.
- Preserve the existing recoverable-error behavior: a failed conversion must keep the selected PDF, page mode, and valid range available for correction or retry.
- Use sanitized names: full outputs are <source>.docx, <source>.md, and <source>-documents.zip; range outputs add -pages-<start>-<end>.
- Keep the existing one-output direct-download and multi-output ZIP behavior.
- Do not claim release completion from jsdom tests alone; require Chromium workflow tests, the deployment workflow, and live-site acceptance.

---

## Planned File Map

**Create**

- src/engine/pdfDocument.ts — the single PDF.js worker configuration and document-opening boundary.
- src/engine/documentModel.ts — public extraction types, scope validation, report types, and model helpers.
- src/engine/layoutAnalyzer.ts — deterministic positioned-token to semantic-block reconstruction.
- src/engine/pdfTextExtractor.ts — PDF.js adapter that builds ExtractedDocument values.
- src/engine/markdownExporter.ts — deterministic UTF-8 Markdown serializer.
- src/engine/docxExporter.ts — dynamically loaded DOCX serializer.
- src/components/workspaces/PdfDocumentConversionPanel.tsx — the new Convert tab UI and state machine.
- src/test/documentModel.test.ts
- src/test/layoutAnalyzer.test.ts
- src/test/pdfTextExtractor.test.ts
- src/test/documentExport.test.ts
- src/test/PdfDocumentConversionPanel.test.tsx

**Modify**

- package.json and package-lock.json — add docx.
- src/engine/pdfRenderer.ts — use the shared PDF document opener.
- src/engine/errors.ts — add NO_EXTRACTABLE_TEXT.
- src/engine/naming.ts — add Word, Markdown, and combined archive names.
- src/components/workspaces/ConvertWorkspace.tsx — register the third tab and delegate its content.
- src/test/fixtures.ts and e2e/support/fixtures.ts — add deterministic text PDF builders.
- src/test/errors.test.ts, src/test/naming.test.ts, and src/test/integration.test.tsx — cover the new public behavior.
- e2e/workflows.spec.ts — exercise downloads, range conversion, recovery, privacy, and mobile layout.
- README.md, docs/PDF_TOOL_IMPLEMENTATION_PLAN.md, and CHANGELOG.md — document the feature and acceptance evidence.

---

### Task 1: Define the neutral document model and range contract

**Files:**

- Create: src/engine/documentModel.ts
- Create: src/test/documentModel.test.ts

**Interfaces:**

- Consumes: PdfSource from src/engine/types.ts.
- Produces: ExtractionScope, InlineRun, DocumentBlock, ExtractedPage, ExtractionWarning, ExtractionReport, ExtractedDocument, pageIndicesForScope(), and summarizeDocument().

- [ ] **Step 1: Write the failing scope and report tests**

~~~ts
import { describe, expect, it } from 'vitest';
import {
  pageIndicesForScope,
  summarizeDocument,
  type ExtractedDocument,
} from '../engine/documentModel';

describe('document extraction model', () => {
  it('expands all pages into zero-based indexes', () => {
    expect(pageIndicesForScope({ mode: 'all' }, 3)).toEqual([0, 1, 2]);
  });

  it('uses an inclusive-exclusive engine range', () => {
    expect(
      pageIndicesForScope(
        { mode: 'range', startIndex: 1, endIndexExclusive: 4 },
        5,
      ),
    ).toEqual([1, 2, 3]);
  });

  it.each([
    [{ mode: 'range', startIndex: -1, endIndexExclusive: 2 }, 3],
    [{ mode: 'range', startIndex: 2, endIndexExclusive: 2 }, 3],
    [{ mode: 'range', startIndex: 1, endIndexExclusive: 4 }, 3],
  ] as const)('rejects an invalid range', (scope, totalPages) => {
    expect(() => pageIndicesForScope(scope, totalPages)).toThrow(
      expect.objectContaining({ code: 'INVALID_SELECTION' }),
    );
  });

  it('counts exported structures and empty source pages', () => {
    const document = {
      sourceName: 'report.pdf',
      scope: { mode: 'all' },
      pages: [
        {
          sourcePageIndex: 0,
          hasExtractableText: true,
          blocks: [
            { kind: 'heading', level: 1, runs: [{ text: 'Title' }] },
            { kind: 'paragraph', runs: [{ text: 'Body' }] },
            {
              kind: 'table',
              rows: [
                [[{ text: 'A' }], [{ text: 'B' }]],
                [[{ text: '1' }], [{ text: '2' }]],
              ],
            },
          ],
        },
        { sourcePageIndex: 1, hasExtractableText: false, blocks: [] },
      ],
      warnings: [],
    } satisfies ExtractedDocument;

    expect(summarizeDocument(document)).toMatchObject({
      processedPages: 2,
      headingCount: 1,
      paragraphCount: 1,
      tableCount: 1,
      pagesWithoutText: [2],
    });
  });
});
~~~

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

~~~bash
npx vitest run src/test/documentModel.test.ts
~~~

Expected: FAIL because src/engine/documentModel.ts does not exist.

- [ ] **Step 3: Implement the model and validation boundary**

Use these exact public types:

~~~ts
export type ExtractionScope =
  | { mode: 'all' }
  | { mode: 'range'; startIndex: number; endIndexExclusive: number };

export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
};

export type DocumentBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'list'; ordered: boolean; items: InlineRun[][] }
  | { kind: 'table'; rows: InlineRun[][][] };

export type ExtractedPage = {
  sourcePageIndex: number;
  hasExtractableText: boolean;
  blocks: DocumentBlock[];
};

export type ExtractionWarning =
  | { code: 'EMPTY_PAGE'; pageNumber: number }
  | { code: 'UNTAGGED_LAYOUT' }
  | { code: 'COMPLEX_WRITING_DIRECTION'; pageNumber: number }
  | { code: 'FIGURES_OMITTED' }
  | { code: 'COMPLEX_CONTENT_MAY_FLATTEN' };

export type ExtractionReport = {
  processedPages: number;
  headingCount: number;
  paragraphCount: number;
  listCount: number;
  tableCount: number;
  linkCount: number;
  pagesWithoutText: number[];
  warnings: ExtractionWarning[];
};

export type ExtractedDocument = {
  sourceName: string;
  scope: ExtractionScope;
  pages: ExtractedPage[];
  warnings: ExtractionWarning[];
};
~~~

Implement pageIndicesForScope() so invalid integers, empty ranges, negative indexes, and indexes past totalPages throw ProcessingError with code INVALID_SELECTION. Implement summarizeDocument() as a pure traversal of the block union; return user-facing page numbers in pagesWithoutText.

- [ ] **Step 4: Run the model tests**

Run:

~~~bash
npx vitest run src/test/documentModel.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit the model**

~~~bash
git add src/engine/documentModel.ts src/test/documentModel.test.ts
git commit -m "feat: define document extraction model"
~~~

---

### Task 2: Centralize PDF.js document loading

**Files:**

- Create: src/engine/pdfDocument.ts
- Modify: src/engine/pdfRenderer.ts
- Create: src/test/pdfDocument.test.ts

**Interfaces:**

- Consumes: PdfSource and assertValidPdfBytes().
- Produces: openPdfDocument(source: PdfSource): Promise<PDFDocumentProxy>.
- Preserves: all existing renderer exports and their behavior.

- [ ] **Step 1: Write a failing shared-loader test**

~~~ts
import { describe, expect, it } from 'vitest';
import { openPdfDocument } from '../engine/pdfDocument';
import { createTestPdf } from './fixtures';

describe('shared PDF.js document loader', () => {
  it('opens a valid source without detaching the caller bytes', async () => {
    const bytes = await createTestPdf(2);
    const originalLength = bytes.byteLength;
    const document = await openPdfDocument({
      id: 'two-pages',
      name: 'two-pages.pdf',
      bytes,
    });

    expect(document.numPages).toBe(2);
    expect(bytes.byteLength).toBe(originalLength);
    await document.destroy();
  });
});
~~~

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

~~~bash
npx vitest run src/test/pdfDocument.test.ts
~~~

Expected: FAIL because openPdfDocument is not defined.

- [ ] **Step 3: Create the shared loader**

~~~ts
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { PdfSource } from './types';
import { assertValidPdfBytes } from './validation';
import { toProcessingError } from './errors';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function openPdfDocument(
  source: PdfSource,
): Promise<PDFDocumentProxy> {
  assertValidPdfBytes(source.bytes, source.name);
  try {
    return await pdfjsLib.getDocument({
      data: source.bytes.slice(0),
    }).promise;
  } catch (error) {
    throw toProcessingError(error, 'CORRUPT_PDF', source.name);
  }
}
~~~

Remove PDF.js setup and the private openDocument() from pdfRenderer.ts. Import openPdfDocument() there and replace every call without changing rendering semantics or cleanup.

- [ ] **Step 4: Run loader and renderer regression coverage**

Run:

~~~bash
npx vitest run src/test/pdfDocument.test.ts src/test/pdfEngine.test.ts src/test/advancedPdfEngine.test.ts
~~~

Expected: PASS with no detached-buffer regression.

- [ ] **Step 5: Commit the shared loader**

~~~bash
git add src/engine/pdfDocument.ts src/engine/pdfRenderer.ts src/test/pdfDocument.test.ts
git commit -m "refactor: share pdfjs document loading"
~~~

---

### Task 3: Reconstruct editable structure from positioned PDF text

**Files:**

- Create: src/engine/layoutAnalyzer.ts
- Create: src/engine/pdfTextExtractor.ts
- Create: src/test/layoutAnalyzer.test.ts
- Create: src/test/pdfTextExtractor.test.ts
- Modify: src/test/fixtures.ts

**Interfaces:**

- Consumes: ExtractedDocument model and openPdfDocument().
- Produces:

~~~ts
export type PositionedToken = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  direction: 'ltr' | 'rtl' | 'ttb';
  bold: boolean;
  italic: boolean;
  hasEOL: boolean;
  href?: string;
};

export type PageLayoutInput = {
  pageWidth: number;
  pageHeight: number;
  tokens: PositionedToken[];
  structureRoles: string[];
};

export function analyzePageLayout(input: PageLayoutInput): DocumentBlock[];

export async function extractPdfDocument(
  source: PdfSource,
  scope: ExtractionScope,
  onProgress?: (completed: number, total: number) => void,
): Promise<ExtractedDocument>;
~~~

- [ ] **Step 1: Add deterministic text fixtures**

Extend src/test/fixtures.ts with createTextPdf(). It must use PDF-Lib standard fonts and accept explicit page draw instructions so tests can place text in one column, two columns, list indentation, repeated margins, and table-like x anchors.

~~~ts
export type TextFixtureLine = {
  text: string;
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
};

export async function createTextPdf(
  pages: TextFixtureLine[][],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const lines of pages) {
    const page = doc.addPage([612, 792]);
    for (const line of lines) {
      page.drawText(line.text, {
        x: line.x,
        y: line.y,
        size: line.size ?? 11,
        font: line.bold ? bold : regular,
      });
    }
  }

  return await doc.save();
}
~~~

- [ ] **Step 2: Write failing pure layout tests**

Cover these exact cases in layoutAnalyzer.test.ts:

- A 22-point bold line becomes heading level 1 above 11-point body text.
- Wrapped body lines merge into one paragraph.
- A trailing ASCII hyphen joins the next lowercase line without the hyphen.
- A trailing em dash remains intact.
- Bullet and numeric markers become unordered and ordered list blocks.
- Two persistent vertical text bands are read top-to-bottom in the left column, then top-to-bottom in the right column.
- Two or more stable x anchors across at least three rows become a table.
- A two-row aligned layout remains paragraphs.
- Unsafe javascript and file link targets are removed while http, https, and mailto survive.
- RTL or top-to-bottom tokens preserve text but yield COMPLEX_WRITING_DIRECTION through the extractor.

Representative assertion:

~~~ts
expect(
  analyzePageLayout({
    pageWidth: 600,
    pageHeight: 800,
    structureRoles: [],
    tokens: [
      token('Introduction', 50, 740, 22, { bold: true }),
      token('First wrapped', 50, 700, 11),
      token('paragraph line.', 50, 684, 11),
    ],
  }),
).toEqual([
  {
    kind: 'heading',
    level: 1,
    runs: [{ text: 'Introduction', bold: true }],
  },
  {
    kind: 'paragraph',
    runs: [{ text: 'First wrapped paragraph line.' }],
  },
]);
~~~

- [ ] **Step 3: Run layout tests and confirm failure**

Run:

~~~bash
npx vitest run src/test/layoutAnalyzer.test.ts
~~~

Expected: FAIL because analyzePageLayout() is not defined.

- [ ] **Step 4: Implement conservative layout analysis**

Apply these rules in this order:

1. Normalize whitespace and discard empty tokens.
2. Group tokens into lines when their baselines differ by no more than 35% of the page median token height and their vertical boxes overlap.
3. Sort within a line by writing direction and infer a space only when the geometric gap is materially larger than adjacent glyph spacing.
4. Identify a maximum of two text columns from a persistent vertical whitespace band wider than 8% of page width and spanning at least half the occupied text height.
5. Traverse columns left-to-right and lines top-to-bottom for horizontal LTR documents.
6. Remove a repeated header or footer only in the document-level pass when normalized text appears within the top or bottom 10% on at least three pages and at least 60% of selected pages.
7. Use tagged structure roles when they map cleanly; otherwise cluster font sizes and allow only three heading levels.
8. Detect list markers only with stable indentation.
9. Detect a table only with at least two stable x anchors across at least three consecutive rows.
10. Merge paragraph lines; remove a terminal ASCII hyphen only when the next line begins with a lowercase letter.

Keep all constants named and exported only when tests need them. Keep this module free of React and PDF.js objects.

- [ ] **Step 5: Write failing PDF adapter tests**

In pdfTextExtractor.test.ts, use createTextPdf() to verify:

- all-page and range extraction;
- progress calls from 1 through total selected pages;
- headings and body text arrive in source-page order;
- one empty page in a mixed PDF is reported but does not block export;
- an entirely text-empty PDF throws NO_EXTRACTABLE_TEXT;
- document.destroy() runs on success and error;
- figures-omitted and complex-content warnings are included in the model.

- [ ] **Step 6: Implement the PDF.js adapter**

For each selected page:

~~~ts
const textContent = await page.getTextContent({
  includeMarkedContent: true,
});
const structureTree = await page.getStructTree();
const annotations = await page.getAnnotations({ intent: 'display' });
~~~

Map PDF.js TextItem fields str, dir, transform, width, height, fontName, and hasEOL into PositionedToken. Read font style metadata from textContent.styles. Associate safe external link annotations with overlapping tokens. Pass plain normalized data into analyzePageLayout().

Always destroy the PDFDocumentProxy in finally. After processing, apply repeated header/footer removal across selected pages. If every page has no non-whitespace text, throw:

~~~ts
new ProcessingError(
  'NO_EXTRACTABLE_TEXT',
  'no extractable text layer',
  { fileName: source.name },
);
~~~

- [ ] **Step 7: Run extraction tests**

Run:

~~~bash
npx vitest run src/test/layoutAnalyzer.test.ts src/test/pdfTextExtractor.test.ts
~~~

Expected: PASS.

- [ ] **Step 8: Commit extraction**

~~~bash
git add src/engine/layoutAnalyzer.ts src/engine/pdfTextExtractor.ts src/test/layoutAnalyzer.test.ts src/test/pdfTextExtractor.test.ts src/test/fixtures.ts
git commit -m "feat: extract editable structure from pdf text"
~~~

---

### Task 4: Add deterministic Markdown export, errors, and filenames

**Files:**

- Create: src/engine/markdownExporter.ts
- Create: src/test/documentExport.test.ts
- Modify: src/engine/errors.ts
- Modify: src/engine/naming.ts
- Modify: src/test/errors.test.ts
- Modify: src/test/naming.test.ts

**Interfaces:**

- Consumes: ExtractedDocument and ExtractionScope.
- Produces:

~~~ts
export function exportMarkdown(document: ExtractedDocument): Uint8Array;

export type DocumentOutputNames = {
  docx: string;
  markdown: string;
  zip: string;
};

export function documentOutputNames(
  sourceName: string,
  scope: ExtractionScope,
): DocumentOutputNames;
~~~

- [ ] **Step 1: Write failing error and naming tests**

Add NO_EXTRACTABLE_TEXT to the error-code loop and assert its user message contains both no extractable text and OCR.

Add naming expectations:

~~~ts
expect(documentOutputNames('report.pdf', { mode: 'all' })).toEqual({
  docx: 'report.docx',
  markdown: 'report.md',
  zip: 'report-documents.zip',
});

expect(
  documentOutputNames('report.pdf', {
    mode: 'range',
    startIndex: 1,
    endIndexExclusive: 4,
  }),
).toEqual({
  docx: 'report-pages-2-4.docx',
  markdown: 'report-pages-2-4.md',
  zip: 'report-pages-2-4-documents.zip',
});
~~~

- [ ] **Step 2: Write failing Markdown serialization tests**

Assert exact UTF-8 decoding for:

- headings;
- paragraphs separated by one blank line;
- ordered and unordered lists;
- GFM tables with a generated separator row;
- pipe, backslash, bracket, and newline escaping;
- safe links;
- source page comments in the form <!-- Page 2 -->;
- Unicode Chinese and Greek text;
- deterministic trailing newline.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

~~~bash
npx vitest run src/test/errors.test.ts src/test/naming.test.ts src/test/documentExport.test.ts
~~~

Expected: FAIL on the missing code, name helpers, and exporter.

- [ ] **Step 4: Implement error copy and safe names**

Add NO_EXTRACTABLE_TEXT to ProcessingErrorCode and MESSAGES:

~~~ts
NO_EXTRACTABLE_TEXT: (subject) =>
  subject + ' has no extractable text. It may be a scanned document and requires OCR, which this tool does not perform yet.',
~~~

Implement documentOutputNames() inside naming.ts so it reuses safeBase(). Convert internal zero-based indexes to user-facing page numbers only when composing names.

- [ ] **Step 5: Implement Markdown serialization**

Use pure block serializers and TextEncoder:

~~~ts
export function exportMarkdown(document: ExtractedDocument): Uint8Array {
  const pages = document.pages.map((page) => {
    const marker = '<!-- Page ' + String(page.sourcePageIndex + 1) + ' -->';
    const body = page.blocks.map(serializeBlock).join('\n\n');
    return body ? marker + '\n\n' + body : marker;
  });

  return new TextEncoder().encode(pages.join('\n\n') + '\n');
}
~~~

Do not generate a title from the filename. Escape Markdown syntax without altering Unicode content. Use the first table row as the header row because the model intentionally does not infer semantic table headers.

- [ ] **Step 6: Run exporter, naming, and error tests**

Run:

~~~bash
npx vitest run src/test/errors.test.ts src/test/naming.test.ts src/test/documentExport.test.ts
~~~

Expected: PASS.

- [ ] **Step 7: Commit Markdown export**

~~~bash
git add src/engine/markdownExporter.ts src/engine/errors.ts src/engine/naming.ts src/test/documentExport.test.ts src/test/errors.test.ts src/test/naming.test.ts
git commit -m "feat: export extracted pdf content as markdown"
~~~

---

### Task 5: Generate editable DOCX in the browser

**Files:**

- Modify: package.json
- Modify: package-lock.json
- Create: src/engine/docxExporter.ts
- Modify: src/test/documentExport.test.ts

**Interfaces:**

- Consumes: ExtractedDocument.
- Produces: exportDocx(document: ExtractedDocument): Promise<Blob>.

- [ ] **Step 1: Install the DOCX dependency**

Run:

~~~bash
npm install docx@^9
~~~

Expected: package.json and package-lock.json record docx; no CDN asset is introduced.

- [ ] **Step 2: Write failing DOCX package-structure tests**

In documentExport.test.ts:

1. Build a model with a heading, styled runs, paragraph, ordered list, unordered list, safe hyperlink, table, and second source page.
2. Call exportDocx().
3. Open the result with the already installed JSZip.
4. Read word/document.xml, word/_rels/document.xml.rels, and word/numbering.xml.
5. Assert heading style Heading1, paragraph text, bold and italic run properties, table XML, both numbering definitions, external hyperlink relationship, and a page break.
6. Assert the archive contains no vbaProject.bin, embedded fonts, or media files.

Representative setup:

~~~ts
const blob = await exportDocx(document);
const zip = await JSZip.loadAsync(await blob.arrayBuffer());
const xml = await zip.file('word/document.xml')!.async('string');

expect(xml).toContain('Heading1');
expect(xml).toContain('<w:tbl>');
expect(xml).toContain('w:type="page"');
expect(zip.file('word/vbaProject.bin')).toBeNull();
~~~

- [ ] **Step 3: Run the DOCX test and confirm failure**

Run:

~~~bash
npx vitest run src/test/documentExport.test.ts
~~~

Expected: FAIL because exportDocx() does not exist.

- [ ] **Step 4: Implement the lazy DOCX exporter**

Keep the dependency out of the initial application chunk:

~~~ts
export async function exportDocx(
  document: ExtractedDocument,
): Promise<Blob> {
  const docx = await import('docx');
  const children = buildDocxChildren(document, docx);

  const output = new docx.Document({
    numbering: {
      config: [
        orderedNumberingConfig(docx),
        unorderedNumberingConfig(docx),
      ],
    },
    sections: [{ children }],
  });

  return await docx.Packer.toBlob(output);
}
~~~

Mapping rules:

- Heading blocks use HeadingLevel.HEADING_1 through HEADING_3.
- Paragraph blocks use Paragraph and TextRun.
- Lists use stable numbering references pdf-convert-ordered and pdf-convert-unordered.
- Tables use Table, TableRow, and TableCell with one Paragraph per cell.
- Safe links use ExternalHyperlink; text without an approved scheme remains a normal run.
- Insert PageBreak before every extracted page after the first.
- Use system fonts only and do not configure font embedding.

Wrap library failures with toProcessingError(error, 'UNKNOWN', document.sourceName) so memory failures still classify as OUT_OF_MEMORY.

- [ ] **Step 5: Run DOCX and bundle tests**

Run:

~~~bash
npx vitest run src/test/documentExport.test.ts
npm run build
~~~

Expected: exporter tests pass; the build emits docx as a lazy chunk rather than adding it to the initial application chunk.

- [ ] **Step 6: Commit DOCX export**

~~~bash
git add package.json package-lock.json src/engine/docxExporter.ts src/test/documentExport.test.ts
git commit -m "feat: export extracted pdf content as docx"
~~~

---

### Task 6: Add the PDF-to-Word/Markdown conversion panel

**Files:**

- Create: src/components/workspaces/PdfDocumentConversionPanel.tsx
- Create: src/test/PdfDocumentConversionPanel.test.tsx
- Modify: src/components/workspaces/ConvertWorkspace.tsx
- Modify: src/test/integration.test.tsx

**Interfaces:**

- Consumes: extractPdfDocument(), summarizeDocument(), exportMarkdown(), exportDocx(), documentOutputNames(), downloadFile(), deliverOutputs(), and existing Dropzone, ProgressBar, StatusAlert, and Modal components.
- Produces: one self-contained tab panel with analyze, report, Word download, Markdown download, combined download, and reset behavior.

- [ ] **Step 1: Write failing panel behavior tests**

Mock the extractor and exporters at their module boundaries. Cover:

- The panel accepts one PDF.
- Whole PDF is selected by default.
- Selecting Page range reveals Start page and End page number inputs.
- Page ranges are one-based and inclusive in the UI.
- Start zero, start after end, or end past page count disables Analyze document and shows an inline message.
- Analyze document converts page 2 through page 4 into startIndex 1 and endIndexExclusive 4.
- A changed range invalidates the prior report and disables download actions until reanalysis.
- The report renders page, heading, paragraph, list, table, and link counts.
- Empty source pages are shown as one-based page numbers.
- Download Word calls exportDocx() without re-extracting.
- Download Markdown calls exportMarkdown() without re-extracting.
- Download Both exports both formats and passes two entries to deliverOutputs().
- NO_EXTRACTABLE_TEXT keeps the chosen file and range visible.
- Reset revokes tracked URLs and returns the panel to idle.

Use these stable accessible labels in assertions:

~~~ts
screen.getByRole('radio', { name: 'Whole PDF' });
screen.getByRole('radio', { name: 'Page range' });
screen.getByRole('spinbutton', { name: 'Start page' });
screen.getByRole('spinbutton', { name: 'End page' });
screen.getByRole('button', { name: 'Analyze document' });
screen.getByRole('button', { name: 'Download Word' });
screen.getByRole('button', { name: 'Download Markdown' });
screen.getByRole('button', { name: 'Download Both' });
~~~

- [ ] **Step 2: Run panel tests and confirm failure**

Run:

~~~bash
npx vitest run src/test/PdfDocumentConversionPanel.test.tsx
~~~

Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement the panel state machine**

Use explicit state rather than deriving progress from unrelated booleans:

~~~ts
type AnalysisStatus = 'idle' | 'loading' | 'analyzing' | 'ready' | 'error';

type RangeMode =
  | { mode: 'all' }
  | { mode: 'range'; startPage: number; endPage: number };
~~~

Flow:

1. Read and signature-validate the file.
2. Open it long enough to get page count, then destroy that proxy.
3. Let the user keep Whole PDF or enter a valid range.
4. Analyze on explicit button activation with per-page progress.
5. Render the ExtractionReport plus permanent notices that figures are omitted, equations may flatten, and output is editable rather than layout-identical.
6. Generate downloads from the cached ExtractedDocument.
7. Disable reset and range mutation only during an active asynchronous operation.
8. Preserve source and range after recoverable errors.

Use these MIME types:

~~~ts
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MARKDOWN_MIME = 'text/markdown;charset=utf-8';
~~~

For Download Both, create:

~~~ts
const entries = [
  { name: names.docx, data: await exportDocx(document) },
  { name: names.markdown, data: exportMarkdown(document) },
];
await deliverOutputs(entries, names.zip);
~~~

- [ ] **Step 4: Register the third Convert tab**

Extend the existing activeTab union with pdf2doc. Add a tab labeled PDF to Word / Markdown and render PdfDocumentConversionPanel only for that tab. Keep Images to PDF and PDF to Images behavior unchanged.

Update Convert workspace copy to mention document conversion. Because the child owns its own file and async state, the parent reset button must not attempt to reset it; the child renders its own reset control following the existing workspace style.

- [ ] **Step 5: Update route integration tests**

Extend the Convert integration assertion:

~~~ts
expect(
  screen.getByRole('tab', { name: /PDF to Word.*Markdown/i }),
).toBeInTheDocument();
~~~

Click the new tab and assert the Analyze document action and privacy/limitation copy render.

- [ ] **Step 6: Run component and integration tests**

Run:

~~~bash
npx vitest run src/test/PdfDocumentConversionPanel.test.tsx src/test/integration.test.tsx src/test/components.test.tsx
~~~

Expected: PASS.

- [ ] **Step 7: Commit the workspace**

~~~bash
git add src/components/workspaces/PdfDocumentConversionPanel.tsx src/components/workspaces/ConvertWorkspace.tsx src/test/PdfDocumentConversionPanel.test.tsx src/test/integration.test.tsx
git commit -m "feat: add pdf document conversion workspace"
~~~

---

### Task 7: Prove real-browser downloads, recovery, and privacy

**Files:**

- Modify: e2e/support/fixtures.ts
- Modify: e2e/workflows.spec.ts

**Interfaces:**

- Consumes: the visible third-tab labels and deterministic output names from Task 6.
- Produces: Chromium acceptance evidence for DOCX, Markdown, ZIP, ranges, scanned-PDF recovery, privacy, and mobile layout.

- [ ] **Step 1: Add a Node-side text PDF fixture**

Add createTextPdf() to e2e/support/fixtures.ts using PDF-Lib StandardFonts. Build at least two pages with unique text:

- Page 1: Report title and First page body.
- Page 2: Second page heading and Range-only body.

Keep createSolidPdf() as the image-only/scanned analogue because it has page graphics but no text layer.

- [ ] **Step 2: Write failing end-to-end workflows**

Add tests that:

1. Open #/convert and select PDF to Word / Markdown.
2. Upload report.pdf from createTextPdf().
3. Analyze the whole PDF and wait for the report.
4. Download Markdown, assert report.md, and assert its saved body contains both page texts.
5. Download Word, assert report.docx, open it with JSZip in the Playwright process, and assert word/document.xml contains both page texts.
6. Select range 2 through 2, reanalyze, download both, and assert report-pages-2-2-documents.zip contains the expected DOCX and Markdown entries.
7. Upload an image-only solid PDF and assert the OCR-required message appears while the file remains loaded.
8. Run the conversion while recording requests and assert no request leaves baseURL origin.
9. Include #/convert with the new tab active in the 390 by 844 overflow loop.

- [ ] **Step 3: Run the new E2E tests and confirm failure**

Run:

~~~bash
npx playwright test e2e/workflows.spec.ts --grep "Word|Markdown|OCR"
~~~

Expected: FAIL until the fixture and workflow integration are complete.

- [ ] **Step 4: Complete fixture and selector integration**

Use download.createReadStream() or download.path() to inspect generated bytes. Do not assert filename alone; verify Markdown content and DOCX package XML so the test fails if a blank or malformed output downloads.

- [ ] **Step 5: Run the complete Chromium suite**

Run:

~~~bash
npm run test:e2e
~~~

Expected: every existing and new Chromium test passes.

- [ ] **Step 6: Commit browser acceptance coverage**

~~~bash
git add e2e/support/fixtures.ts e2e/workflows.spec.ts
git commit -m "test: cover document conversion in chromium"
~~~

---

### Task 8: Documentation, full verification, deployment, and release acceptance

**Files:**

- Modify: README.md
- Modify: docs/PDF_TOOL_IMPLEMENTATION_PLAN.md
- Modify: CHANGELOG.md
- Create during implementation: TASKS.md
- Remove after final acceptance: TASKS.md

**Interfaces:**

- Consumes: the verified feature behavior and limitations.
- Produces: accurate user documentation, an auditable task lifecycle, and release evidence.

- [ ] **Step 1: Create the live implementation tracker**

Create TASKS.md with separate frontend and processing groups:

- FE-11: third Convert tab and file/range controls.
- FE-12: analysis progress, report, limitations, and recovery.
- FE-13: Word, Markdown, and combined download actions.
- FE-14: responsive and accessible browser acceptance.
- BE-11: shared PDF.js document loader.
- BE-12: neutral model and layout reconstruction.
- BE-13: Markdown and DOCX exporters.
- BE-14: errors, names, packaging, and privacy verification.

Mark an item complete only when its automated and manual acceptance evidence exists.

- [ ] **Step 2: Update user and architecture documentation**

README.md must document:

- the expanded Convert route;
- DOCX, Markdown, and combined ZIP outputs;
- full-document and contiguous-range behavior;
- browser-only processing and lazy local DOCX generation;
- text-based PDF requirement;
- OCR-required behavior;
- omitted figures and non-reconstructed equations;
- current Chromium coverage and manual verification steps.

Update docs/PDF_TOOL_IMPLEMENTATION_PLAN.md with the new interfaces and acceptance criteria. Add entries under CHANGELOG.md [Unreleased]; do not assign a release date until deployment acceptance.

- [ ] **Step 3: Run the complete local verification gate**

Run:

~~~bash
npm run verify
npm run test:e2e
git diff --check
~~~

Expected:

- ESLint reports zero errors.
- TypeScript reports zero errors.
- All Vitest tests pass.
- Production build succeeds.
- All Playwright Chromium tests pass.
- git diff --check emits no output and exits zero.

- [ ] **Step 4: Perform manual browser acceptance**

With npm run dev:

1. Convert a tagged text PDF to both formats.
2. Convert a two-column text PDF and verify reading order.
3. Convert a range and confirm names and content.
4. Open DOCX in Microsoft Word or LibreOffice and verify editability, headings, lists, links, tables, Unicode, and page breaks.
5. Open Markdown in a plain-text editor and a GFM renderer.
6. Try an image-only scan and confirm no empty output is offered.
7. Use the Network panel to confirm conversion sends no filename or document byte and makes no third-party request.
8. Test keyboard-only use and a 390-pixel-wide viewport.

Record observed results in CHANGELOG.md under the unreleased verification notes.

- [ ] **Step 5: Push and verify CI and GitHub Pages**

After review and authorization:

~~~bash
git push origin main
~~~

Verify the GitHub Actions run completes both verification and deployment. Then run:

~~~bash
PLAYWRIGHT_BASE_URL=https://cauberome.github.io/pdf-toolkit/ npm run test:e2e
~~~

Expected: workflow tests pass against the live site; dev-only harness tests remain local.

- [ ] **Step 6: Close the release only after live acceptance**

Move the changelog entry from Unreleased to version 1.1.0 with the actual release date. Mark every tracker item complete, confirm no manual acceptance item remains, and then delete TASKS.md as the final implementation action.

- [ ] **Step 7: Commit release documentation**

~~~bash
git add README.md docs/PDF_TOOL_IMPLEMENTATION_PLAN.md CHANGELOG.md
git commit -m "docs: document pdf document conversion"
~~~

Do not include TASKS.md in this final commit because it is removed only after release acceptance.

---

## Acceptance Matrix

| Scenario | Required result |
| --- | --- |
| Text PDF, whole document | One analysis pass; DOCX and Markdown contain every page in reading order |
| Text PDF, valid range | Only the inclusive selected pages appear; names include the one-based range |
| Two-column page | Left column is exported before right column |
| Tagged PDF | Usable structure-tree roles take precedence over heuristics |
| Untagged PDF | Conservative font and position heuristics build editable blocks |
| Simple three-row table | Native DOCX table and GFM table are produced |
| Ambiguous aligned text | Paragraphs are produced instead of an invented table |
| Repeated margin text | Consistent headers and footers are omitted under the documented recurrence rule |
| Mixed text and empty pages | Available text exports; report names empty pages |
| Entirely image-only PDF | Recoverable NO_EXTRACTABLE_TEXT message explains OCR requirement |
| Unsafe link scheme | Visible text remains; no active hyperlink is emitted |
| Both downloads | ZIP contains exactly one DOCX and one Markdown file |
| Export failure | Source, page mode, and valid range remain available |
| Privacy inspection | No document-related or third-party request occurs |
| Mobile and keyboard use | No horizontal page overflow; all controls are reachable and labeled |

## Explicitly Deferred

- OCR and language-model assets.
- Individual figure extraction or page snapshots.
- Arbitrary non-contiguous page selection.
- Rich-text editing or correction inside the browser.
- Exact visual reconstruction, floating text boxes, footnotes, endnotes, form fields, comments, tracked changes, macros, or embedded fonts.
- Semantic math reconstruction into LaTeX or Word OMML.
- Firefox and WebKit automation until their Playwright browser packages are installed and separately accepted.

## Primary References

- PDF.js PDFPageProxy text and structure APIs: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html
- PDF.js TextItem and TextContent contracts: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
- docx browser Packer API: https://docx.js.org/api/classes/Packer.html
- docx project and browser support: https://github.com/dolanmiu/docx
- Scribe.js license comparison explaining why it is not selected: https://github.com/scribeocr/scribe.js/blob/master/docs/scribe_vs_tesseract.md
