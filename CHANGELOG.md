# Changelog

All notable changes to the PDF Toolkit will be recorded in this file.

The format follows Keep a Changelog, and this project uses semantic versioning.

## [Unreleased]

### Added

Work in progress on private, browser-only conversion of text-based PDFs into
editable Word (DOCX) and Markdown files, for the whole document or one
contiguous page range.

- Format-neutral document model (`src/engine/documentModel.ts`): headings,
  paragraphs, ordered and unordered lists, conservative tables, and inline runs
  carrying bold, italic, and safe link targets. One extraction feeds both output
  formats. `pageIndicesForScope` is the single validation boundary for page
  selection — ranges are inclusive/exclusive and zero-based inside the engine,
  and an empty, fractional, negative, or past-the-end range is refused as a
  recoverable `INVALID_SELECTION`. `summarizeDocument` reports page, heading,
  paragraph, list, table, and link counts plus one-based empty page numbers.

- Deterministic layout reconstruction (`src/engine/layoutAnalyzer.ts`), which
  turns positioned glyphs into blocks with no PDF or React dependency: lines
  from baseline proximity, spaces from glyph gaps, at most two columns from a
  persistent vertical gutter (left column read in full before the right),
  headings from the page's own body size with at most three levels, lists from
  stable indentation, and tables only from two or more column anchors holding
  across three or more rows. Wrapped lines merge, a soft hyphen before a
  lowercase continuation disappears, and a trailing dash stays. Ambiguity always
  resolves to a paragraph — a two-row aligned layout stays prose rather than
  becoming an invented table.
- Text extraction (`src/engine/pdfTextExtractor.ts`): positioned text, bold and
  italic taken from the real embedded font names, tagged structure-tree heading
  levels when they map cleanly, link annotations, and per-page progress.
  Running headers and footers are dropped only on document-level evidence
  (margin band, at least three pages, at least 60% of the selection). A PDF with
  no text layer raises the new recoverable `NO_EXTRACTABLE_TEXT` rather than
  producing an empty download, and the pdf.js document is always released.
- Only `http`, `https`, and `mailto` link targets survive into an exported
  document; every other scheme keeps its visible text and loses the target,
  since exports are opened later, outside this tool. The check runs again in
  each serializer, because that is the last point before a target is written
  into a file.
- Markdown export (`src/engine/markdownExporter.ts`): deterministic UTF-8
  GitHub-flavored Markdown with headings, paragraphs, ordered and unordered
  lists, tables, emphasis, safe links, and `<!-- Page n -->` boundary comments.
  Escaping is narrow on purpose — the characters that change meaning inline,
  plus line-start markers — so prose stays readable to whoever edits the file.
  Nothing is invented: no title from the filename, and a table's header row is
  its first row, since the model does not claim to know which row is a header.
- Output names for the new formats: `<source>.docx`, `<source>.md`, and
  `<source>-documents.zip`, with `-pages-<start>-<end>` added for a range. This
  is the one place zero-based engine indexes become the one-based page numbers a
  person reads.
- New `NO_EXTRACTABLE_TEXT` error category, whose message names the file, says
  it has no extractable text, and explains that OCR would be required.
- Word export (`src/engine/docxExporter.ts`) via the `docx` package, generated
  entirely in the browser: `Heading1`–`Heading3` styles, bold and italic run
  properties, ordered and unordered numbering definitions, native Word tables,
  external hyperlinks for safe targets only, a page break at each source page
  boundary, and Unicode text. The output carries no macros, no embedded fonts,
  and no media, which a test asserts against the generated package rather than
  trusting the library. Library and allocation failures are classified through
  the existing typed errors, so an out-of-memory failure still reads as one.
- The `docx` dependency is loaded with a dynamic import, so it never enters the
  initial application chunk — verified against a production build, where it
  splits into its own ~411 kB chunk and adds ~3 kB to the app chunk. Someone
  merging two PDFs never downloads a Word writer.
- A third Convert tab, **PDF to Word / Markdown**
  (`src/components/workspaces/PdfDocumentConversionPanel.tsx`): choose one PDF,
  keep the whole document or enter an inclusive one-based page range, analyze
  once, then download Word, Markdown, or both in a ZIP. Every download is
  serialized from the analysis already in memory, so asking for both formats
  never reads the PDF twice. The report names what was found — pages, headings,
  paragraphs, lists, tables, links — and lists any page with no extractable
  text by its one-based number, so an empty stretch of output has a stated
  cause.
- The range is refused before it reaches the engine: a start below page 1, an
  end past the page count, and an end before the start each disable **Analyze
  document** and say which rule was broken. Changing the mode or either number
  discards the previous report rather than letting a download describe pages
  that were never analyzed. A failed analysis or export keeps the file, the
  page mode, and the typed range exactly as they were, which is what makes a
  scanned PDF an explanation rather than a dead end.
- Standing notices in that tab, shown before any file is chosen: conversion
  happens in the tab, figures and equations are omitted, the result is editable
  text in reading order rather than a layout-identical copy, and a scan needs
  OCR that this tool does not perform.
- Five Chromium end-to-end tests for the new tab, which open the saved bytes
  rather than trusting the filename: the Markdown download carries both pages
  and their `<!-- Page n -->` boundaries; the Word download is a real package
  whose `word/document.xml` holds both pages, a `Heading1`, and a page break;
  a 2-to-2 range produces `report-pages-2-2-documents.zip` containing exactly
  one DOCX and one Markdown, each holding the second page and *not* the first;
  an image-only scan produces the OCR message with the file still loaded and no
  download offered; and a full conversion, lazy Word writer included, makes no
  request off the origin. The phone-width check now also covers the Convert
  workspace with the new tab selected.

### Verified so far (unreleased)

- `npm run verify` — ESLint 0 problems, `tsc --noEmit` 0 errors, Vitest 211/211
  across 16 files, production build succeeded. `docx` still splits into its own
  ~411 kB chunk rather than joining the app chunk.
- `npm run test:e2e` — 29/29 in Chromium, up from 24 at 1.0.0.
- `git diff --check` — clean.
- Browser acceptance on the dev server, driven through the UI with a temporary
  Playwright harness, on a document holding a title, a sub-heading, a paragraph
  wrapped over two lines, a bullet list, a numbered list, a three-row table, a
  safe link, a `mailto:` link, a `javascript:` link, and a second page of prose
  in two columns:
  - The report counted 2 pages, 2 headings, 4 paragraphs, 2 lists, 2 tables,
    and 2 links. Both lists and the table came through; the wrapped lines
    merged into one paragraph.
  - Reading order on the two-column page was the whole left column, then the
    whole right column.
  - The `javascript:` target appears nowhere in the DOCX package or its
    relationships, while its visible text survives. The `https:` and `mailto:`
    targets became real relationships.
  - The generated `report.docx` was opened with macOS `textutil` — a reader
    with no connection to the library that wrote it — and rendered headings,
    the merged paragraph, both lists, the table contents, the links, and the
    page break. `textutil` draws the numbered list as bullets, which is its own
    simplification: in the package, the ordered list references a `decimal`
    numbering definition and the bullet list a `bullet` one.
  - Page range 2 to 2 produced `quarterly-pages-2-2-documents.zip` containing
    exactly `quarterly-pages-2-2.docx` and `quarterly-pages-2-2.md`, holding
    the second page only.
  - Keyboard only: Tab reaches the header, the three Convert tabs, Reset, both
    page-mode radios, and **Analyze document**; Enter runs the analysis, and
    tabbing on to **Download Markdown** and pressing Enter saves the file.
    Every stop reports a name.
- A two-column layout whose lines share baselines across three or more rows is
  read as a table rather than as columns. That is the documented conservative
  rule — two anchors over three rows — and prose columns, whose lines do not
  line up, are read as columns.

- CI and deployment accepted on run 32162692443: `npm run verify`, 29 Chromium
  tests, and the GitHub Pages deploy all green. The two runs before it failed,
  both for the Node 20 reason above — the first was misread as slow tests, which
  cost a commit before the stack trace was read properly.
- The deployed site at <https://cauberome.github.io/pdf-toolkit/> was accepted
  with `PLAYWRIGHT_BASE_URL=... npm run test:e2e`: 18 passed, 11 skipped, the
  skips being the dev-only harness specs. That is up from 13 workflow tests at
  1.0.0, the five new ones being document conversion.

Still outstanding before release: opening a generated DOCX in Microsoft Word or
LibreOffice (neither is installed here) and viewing the Markdown in a GFM
renderer.

### Fixed

- A space between two adjacent links was absorbed into the second link instead
  of standing between them, so it rendered as link text — underlined and
  colored in Word, inside the brackets in Markdown. `runsForTokens` gave the
  separator to whichever side was unstyled, as `joinRuns` already did, but had
  no case for neither side being unstyled; the space is now a run of its own.
  Only two links side by side on one line reach that case, which is why the
  fixtures never did.
- Markdown headings and table header rows carried emphasis markers the format
  already supplies — `# **Title**`, `| **Region** |` — because the source PDF
  draws them in a bold font. Both are rendered bold by any GFM renderer, so the
  markers only cluttered the file someone edits. A bold *body* cell keeps its
  emphasis, since nothing else conveys it there.
- The Convert tab row was 10 pixels wider than a 390-pixel viewport once the
  third tab was added, scrolling the whole page sideways. The row now wraps
  instead of overflowing, so no tab is pushed out of reach. Caught by extending
  the phone-width test to the Convert workspace rather than by looking at it.

### Changed

- pdf.js configuration and document opening now live in one module
  (`src/engine/pdfDocument.ts`) instead of being private to the renderer, so
  rendering and text extraction share the same locally bundled worker, the same
  defensive byte copy (pdf.js detaches the buffer it is handed), and the same
  typed-error boundary. `pdfRenderer.ts` behavior is unchanged.
- The Convert workspace now hosts three tabs, and its reset button no longer
  claims to speak for all of them: the document-conversion tab owns its file,
  its analysis, and its own reset control, because the parent cannot know when
  an extraction is in flight there. The two image tabs are untouched.
- Unit tests can now open real documents with pdf.js under jsdom. jsdom has no
  `Worker`, so pdf.js imports its worker module directly and cannot use Vite's
  `?url` server path; the Vitest config aliases that one import to a module
  resolving the same file to a `file://` URL. Application code is identical in
  both environments. Running pdf.js in Node this way also
  raises the floor: it calls `Promise.withResolvers`, added in Node 22, so CI
  and the documented requirement both move from Node 20 to 22. The browser
  bundle is unaffected.

## [1.0.0] - 2026-08-17

First release, published to <https://cauberome.github.io/pdf-toolkit/>.

A browser-only PDF workbench: every document is processed in the tab that
opened it, and no document byte or filename is sent anywhere. The deployed site
makes no third-party request of any kind, which is asserted by a test rather
than only claimed here.

### Added

Seven workspaces, reachable from a common dashboard over hash routes so direct
links survive static hosting:

- **Merge PDFs** — combine two or more documents in a chosen order, with
  reordering and removal, into `merged.pdf`.
- **Delete and reorder pages** — page thumbnails, multi-select and keyboard
  selection, reordering of retained pages, and a guard against deleting every
  page.
- **Split PDF** — every-page mode plus custom groups such as `1-3;4,6;7-9`,
  with inline expression validation and a planned-output summary.
- **Convert** — ordered JPG/PNG/WebP images into one PDF, and selected PDF
  pages out as PNG or JPEG at 1x (≈108 DPI) or 2x (≈216 DPI).
- **Compress PDF** — automatic quality presets and a best-effort target size,
  with progress, before/after size reporting, and a permanent warning that
  compression rasterizes pages and discards text, links, forms, and
  annotations.
- **Crop PDF** — thumbnail selection, visible crop overlays, linked margin
  controls, and apply-to-selection or apply-to-all. Vector content is preserved
  by adjusting the crop box rather than re-rendering.
- **Add Pages** — insert blank pages, every page of another PDF, or ordered
  images before the first page, between pages, or after the last page.

Processing engine and infrastructure:

- Framework-independent TypeScript processing layer (`mergePdfs`, `editPdf`,
  `splitPdf`, `imagesToPdf`, `pdfToImages`, `compressPdf`, `cropPdf`,
  `addPagesToPdf`) with zero-based page indexes internally and one-based
  numbers only at the UI boundary.
- File acceptance by byte signature rather than extension, so renamed files are
  rejected instead of silently mishandled.
- Twelve typed `ProcessingError` categories mapped to plain-language messages in
  one place; raw library wording is kept for debugging and never shown.
- Empty, malformed, mislabeled, password-protected, and zero-page documents are
  refused without crashing or clearing the workspace.
- A locally bundled pdf.js worker resolved through `import.meta.url`, so
  rendering never contacts a CDN and works from any base path.
- System-font typography. No webfont is downloaded or redistributed, so the
  project carries no font licence obligations and the deployed site makes no
  third-party request of any kind. It works offline once cached.
- ZIP packaging for multi-file outputs, with single outputs downloading
  directly, and safe default output names derived from sanitized source names.
- Object URL and buffer release on file removal, tool reset, and page close.
- Accessible labels, visible focus states, screen-reader status messages,
  non-color-only selection indicators, and responsive desktop/mobile layouts.
- ESLint 9 flat config, `lint` / `typecheck` / `test` / `verify` scripts, and a
  GitHub Actions workflow that verifies every push and pull request and
  publishes `dist/` to GitHub Pages from `main`.
- `README.md` covering setup, commands, supported formats, privacy behavior,
  limitations, tests, and deployment.
- Playwright end-to-end suite (24 tests, Chromium) covering real canvas
  rasterization, all seven workflows driven through the UI, recoverable
  failures, direct hash routes, a phone-width layout check, and the
  no-third-party-request property. Each of the five pre-release defects, and
  the mobile overflow above, has a test proven to fail when its fix is
  reverted. CI installs Chromium and runs the suite before deploying.
- The suite can also run against a live deployment rather than the dev server,
  which is how the published site is accepted:
  `PLAYWRIGHT_BASE_URL=https://<user>.github.io/pdf-toolkit/ npm run test:e2e`.

### Fixed

Found during pre-release review of the compression, crop, and page-insertion
engine, before any public release:

- Compressing a rotated or cropped page no longer distorts it. Raster output is
  now sized from the page as a viewer draws it (crop box, with `/Rotate`
  applied) rather than from the unrotated media box, which also fixes
  cropping a document and then compressing it.
- Crop margins now follow the orientation shown in the thumbnail, so on a
  rotated page "top" trims the edge that appears on top instead of a side.
- Compressing a file that is already under the requested target size now
  validates it first; empty, mislabeled, damaged, and password-protected files
  are rejected instead of being returned as a finished result.
- A "match" blank page inserted beside a rotated page now matches the size that
  page displays at.
- Inserting images reports an empty selection as a recoverable validation error
  naming the document.
- The page icon referenced `/vite.svg`, an absolute path to a file that did not
  exist, and 404'd under any GitHub Pages project path. Replaced with a real
  repository-relative `favicon.svg`.
- The header navigation was 66px wider than a 390px viewport, so the whole page
  scrolled sideways on a phone. The nav already asked to scroll internally, but
  as a flex item it kept `min-width: auto` and refused to shrink below its
  content, so the overflow rule never applied. The responsive pass was done
  when there were four tools; Compress, Crop, and Add Pages tipped the row over.

### Changed

- Compression parses the source document once instead of re-parsing it for
  every quality attempt, and releases each rendered page as it is embedded,
  lowering peak memory on long documents.
- Adding images to a PDF embeds them directly rather than building, saving, and
  re-parsing an intermediate PDF.

### Verified at release

- `npm run verify` — ESLint 0 problems, `tsc --noEmit` 0 errors, Vitest 128/128
  across 10 files, production build succeeded.
- `npm run test:e2e` — 24/24 in Chromium, locally and in CI.
- The deployed site at <https://cauberome.github.io/pdf-toolkit/> was accepted
  by running the 13 workflow tests against it: all seven tools produce their
  correct download, every hash route loads directly, the phone-width layout
  does not scroll sideways, and no third-party request is made.
- The live bundle serves relative asset paths, contains no reference to
  `googleapis` or `gstatic`, and ships no font file.

### Known limitations

- End-to-end tests run in Chromium only. The plan also calls for Firefox and
  WebKit, whose browser builds are not installed; adding them is a browser
  download away.
- Compression target size is best-effort, and compression always rasterizes.
- Password removal, OCR, and Office-format conversion are out of scope.
