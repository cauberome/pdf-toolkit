# Tasks — PDF to Word and Markdown

Live tracker for the document-conversion feature. An item is complete only when
its automated evidence exists and any manual acceptance it names has been
performed. This file is deleted as the final action after release acceptance.

Status: `[ ]` open · `[x]` complete · `[~]` blocked on something outside the
working tree.

## Frontend

- [x] **FE-11 — Third Convert tab, file, and range controls.**
  `PdfDocumentConversionPanel` renders under a `PDF to Word / Markdown` tab;
  one PDF is accepted by byte signature; `Whole PDF` is the default and
  `Page range` reveals one-based, inclusive `Start page` / `End page` inputs.
  Evidence: `src/test/PdfDocumentConversionPanel.test.tsx` (accepts one PDF,
  refuses a mislabeled file, default scope, revealed inputs, index conversion),
  `src/test/integration.test.tsx` (tab is registered and renders the panel).

- [x] **FE-12 — Analysis progress, report, limitations, and recovery.**
  Per-page progress; a report of pages, headings, paragraphs, lists, tables,
  and links; empty pages named by one-based number; standing privacy and
  limitation notices; an invalid range disables analysis and says why; a
  failure keeps the file and the typed range.
  Evidence: the report, invalid-range, invalidation, and recovery tests in
  `src/test/PdfDocumentConversionPanel.test.tsx`; the OCR-recovery test in
  `e2e/workflows.spec.ts`.

- [x] **FE-13 — Word, Markdown, and combined downloads.**
  Each download is serialized from the cached analysis; both formats deliver
  one ZIP; names carry the one-based range.
  Evidence: the three download tests plus the range-naming test in
  `src/test/PdfDocumentConversionPanel.test.tsx`; the Markdown, Word, and
  archive tests in `e2e/workflows.spec.ts`, which read the saved bytes.

- [x] **FE-14 — Responsive and accessible browser acceptance.**
  No horizontal overflow at 390 × 844 with the new tab selected; every control
  reachable and labeled by keyboard.
  Evidence: the phone-width test in `e2e/workflows.spec.ts` (which caught the
  10-pixel tab-row overflow); the keyboard-only pass recorded in
  `CHANGELOG.md` under unreleased verification notes.

## Processing

- [x] **BE-11 — Shared pdf.js document loader.**
  `openPdfDocument()` is the one worker configuration, defensive byte copy, and
  typed-error boundary; the renderer uses it unchanged.
  Evidence: `src/test/pdfDocument.test.ts`, plus the unchanged renderer suites.

- [x] **BE-12 — Neutral model and layout reconstruction.**
  `ExtractedDocument`, `pageIndicesForScope()`, `summarizeDocument()`,
  `analyzePageLayout()`, and `extractPdfDocument()`; ambiguity resolves to
  paragraphs; repeated margins are dropped only on document-level evidence.
  Evidence: `src/test/documentModel.test.ts`, `src/test/layoutAnalyzer.test.ts`,
  `src/test/pdfTextExtractor.test.ts`.

- [x] **BE-13 — Markdown and DOCX exporters.**
  Deterministic GFM bytes; a DOCX built in the browser from a lazily imported
  writer, with no macros, embedded fonts, or media.
  Evidence: `src/test/documentExport.test.ts`; the production build, where
  `docx` splits into its own chunk.

- [x] **BE-14 — Errors, names, packaging, and privacy verification.**
  `NO_EXTRACTABLE_TEXT` with OCR wording; `documentOutputNames()`; the existing
  one-file-or-ZIP rule reused; no request leaves the origin during a
  conversion, lazy Word writer included.
  Evidence: `src/test/errors.test.ts`, `src/test/naming.test.ts`, and the
  conversion privacy test in `e2e/workflows.spec.ts`.

## Release

- [x] Local gate: `npm run verify`, `npm run test:e2e`, `git diff --check`.
- [x] Automated browser acceptance on the dev server: two-column reading order,
  Unicode, links, lists, tables, range naming, DOCX read back by an independent
  reader, keyboard-only operation.
- [~] Manual acceptance in Microsoft Word or LibreOffice, and in a GFM
  renderer. Neither application is installed on this machine; macOS `textutil`
  was used as an independent DOCX reader instead. Outstanding.
- [x] Push to `main`, confirm the GitHub Actions verify and deploy jobs pass.
  Run 32162692443: verify, 29 Chromium tests, and the Pages deploy all green.
  Two earlier runs failed first — see the changelog's Node 22 entry.
- [x] Accept the live site:
  `PLAYWRIGHT_BASE_URL=https://cauberome.github.io/pdf-toolkit/ npm run test:e2e`
  — 18 passed, 11 skipped, the skips being the dev-only harness specs. Up from
  13 workflow tests at 1.0.0.
- [ ] Move the changelog entry to 1.1.0 with its real date, then delete this
  file.
