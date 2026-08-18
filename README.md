# PDF Toolkit

**Live: <https://cauberome.github.io/pdf-toolkit/>**

A privacy-first PDF workbench that runs entirely in the browser. Merge, edit,
split, convert, compress, crop, and add pages without a single document byte
leaving the machine.

There is no upload server, no account, and no document API. Every operation is
performed by JavaScript running in the tab that has the file open.

## Tools

| Tool               | Route           | What it does                                                                     |
| ------------------ | --------------- | -------------------------------------------------------------------------------- |
| Merge PDFs         | `#/merge`     | Combine two or more PDFs in a chosen order into`merged.pdf`.                   |
| Delete and reorder | `#/edit`      | Select pages to remove and reorder the ones kept. At least one page must remain. |
| Split PDF          | `#/split`     | One file per page, or custom groups such as`1-3;4,6;7-9`.                      |
| Convert            | `#/convert`   | JPG/PNG/WebP images into one PDF, selected PDF pages out as PNG/JPEG, or a text-based PDF into editable Word/Markdown. |
| Compress PDF       | `#/compress`  | Automatic quality preset or best-effort target size. Rasterizes pages.           |
| Crop PDF           | `#/crop`      | Visual top/right/bottom/left margins applied to selected pages or all pages.     |
| Add Pages          | `#/add-pages` | Insert blank pages, every page of another PDF, or ordered images.                |

Routes are hash-based so a direct link works on GitHub Pages without any
server-side rewrite rules.

### PDF to Word and Markdown

The Convert workspace has a third tab, **PDF to Word / Markdown**, which turns a
text-based PDF into an editable document. Choose one PDF, keep **Whole PDF** or
enter an inclusive **Page range**, press **Analyze document**, then download
**Word**, **Markdown**, or **Both** — both formats arrive in one ZIP. The
analysis happens once and every download is written from it, so asking for both
formats never reads the PDF twice.

What comes across: headings, paragraphs, ordered and unordered lists,
conservative tables, bold and italic, `http`, `https`, and `mailto` links,
Unicode text, and a page break at each source page boundary. Structure is
reconstructed from the text layer — tagged roles when the PDF has usable ones,
otherwise font sizes and positions — and anything ambiguous stays a paragraph
rather than becoming an invented table or heading.

What does not: figures, page images, equations (which flatten to whatever text
they contain), form fields, footnotes, annotations, and exact page layout. The
output is editable text in reading order, not a facsimile.

The PDF must have a text layer. A scan has none, so it is refused with a
message saying OCR would be required; this tool does not perform OCR, and never
offers an empty file in place of text it could not read. If the range or the
export fails, the file and the page range stay exactly as they were.

The Word writer (the `docx` package) is imported only when the tab is used, so
it never enters the initial bundle — someone merging two PDFs never downloads
it. Like everything else here, the document is generated in the tab: no upload,
no template fetch, no service.

## Requirements

- Node.js 22 or newer (CI builds on Node 22). The tests open real documents
  with pdf.js under jsdom, and pdf.js calls `Promise.withResolvers`, which
  arrived in Node 22. The built site itself has no such requirement beyond
  pdf.js's own browser baseline.
- npm 10 or newer
- A current version of Chrome, Firefox, Safari, or Edge

## Setup

```bash
npm ci      # install exactly what package-lock.json pins
npm run dev # start the dev server on http://localhost:5173
```

Use `npm install` instead of `npm ci` only when intentionally changing
dependencies; the lockfile is what CI installs from.

## Commands

| Command                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run dev`        | Vite dev server with hot module replacement.                          |
| `npm run build`      | Type-check with`tsc`, then emit the production bundle to `dist/`. |
| `npm run preview`    | Serve the built`dist/` locally.                                     |
| `npm run lint`       | ESLint 9 flat config across the repository.                           |
| `npm run typecheck`  | `tsc --noEmit`.                                                     |
| `npm test`           | Vitest run (unit, component, and integration suites).                 |
| `npm run test:watch` | Vitest in watch mode.                                                 |
| `npm run test:e2e`   | Playwright end-to-end suite (Chromium). Starts the dev server itself. |
| `npm run verify`     | lint → typecheck → test → build. CI runs this plus `test:e2e`.     |

## Supported formats

**Input**

- PDF for every tool that takes a document. Files are accepted on their byte
  signature (`%PDF` within the first 1024 bytes), not their extension, so a
  renamed file is rejected rather than silently mishandled.
- JPG, PNG, and WebP for Images-to-PDF and for Add Pages image insertion, also
  detected by signature (`PNG`, JPEG SOI, and `RIFF`/`WEBP`).

**Output**

- PDF from Merge, Delete/Reorder, Split, Images-to-PDF, Compress, Crop, and
  Add Pages.
- PNG or JPEG from PDF-to-Images, rendered at 1x (≈108 DPI) or 2x (≈216 DPI).
  A PDF point is 1/72 inch, so the 1x preset renders at a 1.5 viewport scale to
  avoid a soft 72 DPI image.
- DOCX and UTF-8 Markdown from PDF-to-Word/Markdown, singly or as a pair in one
  ZIP. The Markdown is GitHub-flavored, with `<!-- Page n -->` boundaries.
- ZIP whenever an operation produces two or more files. A single generated file
  always downloads directly.

**Default names**

`merged.pdf`, `converted-images.pdf`, `<source>-edited.pdf`,
`<source>-part-01.pdf`, `<source>-page-001.png` / `.jpg`,
`<source>-compressed.pdf`, `<source>-cropped.pdf`, `<source>-pages-added.pdf`,
`<source>-split.zip`, `<source>-images.zip`, `<source>.docx`, `<source>.md`,
`<source>-documents.zip`.

A converted page range adds `-pages-<start>-<end>` before the extension, using
one-based page numbers: `report-pages-2-4.docx`, `report-pages-2-4.md`,
`report-pages-2-4-documents.zip`.

Source names are sanitized before they reach a download attribute: path
separators, characters illegal in filenames, and control characters are
replaced, and a name with nothing recognisable left falls back to `document`.

## Privacy

- Document bytes are read with the File API and processed in memory. Nothing is
  sent to any server — the app has no endpoint to send them to.
- The pdf.js worker is bundled locally and resolved through
  `new URL(..., import.meta.url)`. It is never fetched from a CDN, so opening a
  document triggers no network request at all.
- Buffers and object URLs are released when a file is removed, a tool is reset,
  or the page closes. Download URLs are revoked 10 seconds after the click,
  which is long enough for the browser to start the transfer.
- No webfonts. Typography uses each device's own system fonts, so no font file
  is downloaded or redistributed and no font licence applies. The site makes
  **no third-party request of any kind** — no CDN, no font host, no analytics,
  no telemetry. After the initial page load, using the app generates no network
  traffic at all, so it works fully offline once cached.
- No `localStorage`, `sessionStorage`, `IndexedDB`, Cache API, service worker,
  or cookies. Nothing survives closing the tab, by design.
- Verify this independently: open the browser network panel, run any tool, and
  confirm no request carries document bytes or filenames. Or disconnect from
  the network after the page loads and confirm every tool still works.

## Limitations

- **Compression rasterizes.** Each page is re-rendered as an image, so
  selectable text, links, forms, and annotations are lost. The workspace shows
  this warning before processing, and it is not dismissible.
- **Target size is best-effort.** The engine tries up to five quality/scale
  attempts, reports whether the target was reached, and always keeps the
  smallest valid attempt available for download.
- **Crop must retain at least 5%** of each page dimension. Crop is
  vector-preserving — it adjusts the crop box rather than re-rendering.
- **Password-protected PDFs are rejected**, with a message saying to remove the
  password elsewhere first. Password removal is out of scope.
- **Conversion to Word/Markdown needs a text layer.** An image-only scan is
  refused with an OCR-required message rather than an empty document. The
  output is editable text in reading order, not a layout-identical copy:
  figures and page images are omitted, equations flatten to their text, and
  at most two columns are recognised, read left column first.
- **No OCR, no accounts, no cloud storage, no analytics.** Conversion out of
  PDF covers Word and Markdown only; converting *into* PDF from Office formats
  is out of scope.
- **Document size is bounded by the browser tab, not by an arbitrary limit.** A
  document too large to process reports a recoverable memory error suggesting
  closing other tabs or splitting the work, and the workspace keeps its state.
- Insertion positions run `0..pageCount`, where `0` is before the first page
  and `pageCount` is after the last.

## Tests

`npm test` runs Vitest against jsdom. Coverage spans the split-expression
parser, file-signature validation, output naming, error classification and
copy, merge/retained-page order, split grouping, image ordering and dimensions,
ZIP packaging and the one-file-versus-ZIP rule, compression attempt ordering
and target reporting, crop geometry, page insertion, and component behaviour
for drag/drop, keyboard selection, progress, errors, reset, and download states.
It also covers the conversion path end to end without a browser: the layout
rules on positioned tokens, extraction from real PDFs opened by pdf.js under
jsdom, exact Markdown bytes, the generated DOCX package read back with JSZip,
and the conversion panel's state machine.

`npm run test:e2e` runs Playwright against Chromium. It covers what jsdom
structurally cannot:

- **Real rasterization.** Pages are rendered on an actual canvas through the
  pdf.js worker and the pixels are read back — dimensions, and that the output
  is drawn rather than blank.
- **The five defects** found in the pre-release review of compression, crop,
  and page insertion. Each has a test verified by reverting the fix and
  confirming the test fails, so it genuinely catches a regression rather than
  merely passing.
- **All seven workflows** driven through the UI: choose files, operate the
  controls, and assert the resulting download and its filename.
- **Document conversion**, where the saved bytes are opened rather than the
  filename trusted: the Markdown carries both pages and their page comments,
  the DOCX is unzipped and its `word/document.xml` inspected, a 2-to-2 range
  produces an archive holding exactly one DOCX and one Markdown with the
  selected page and not the unselected one, and an image-only scan produces
  the OCR message with the document still loaded.
- **Recoverable failures**, a phone-width layout check, and the privacy
  property — no third-party request is made while loading or using the app.

The suite can also run against a live deployment instead of the dev server,
which is how the published site is accepted:

```bash
PLAYWRIGHT_BASE_URL=https://cauberome.github.io/pdf-toolkit/ npm run test:e2e
```

Only the workflow specs run that way; the rasterization specs need the dev-only
harness page.

Two coverage limits remain:

- Only Chromium runs. The plan calls for Firefox and WebKit too; their browser
  builds are not installed. Tracked in `TASKS.md`.
- jsdom borrows Node's `TextEncoder`, whose `Uint8Array` fails `instanceof`
  inside the jsdom realm, so JSZip rejects it. Test helpers re-wrap
  accordingly; this does not happen in a real browser.

The E2E suite runs against the dev server, so specs can reach engine modules
through a harness page at `e2e/harness/`, which is never part of the production
build. The built bundle is checked separately by serving `dist/` from a
Pages-style subpath.

## Deployment

`.github/workflows/deploy.yml` runs on every push and pull request to `main`:

1. **verify** — `npm ci`, then lint, typecheck, unit tests, the Chromium
   end-to-end suite, and the production build, then upload `dist/` as a Pages
   artifact. A failed E2E run uploads the Playwright report as an artifact.
2. **deploy** — publishes to GitHub Pages, and only from `main`. Pull requests
   stop after verify.

Deployments are queued rather than cancelled, so a published site is always the
result of a completed run.

To deploy a fork or a new repository:

1. Push the repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main` and watch the workflow.

The Vite `base` is `'./'`, so the bundle works from a domain root and from a
project subpath such as `https://<user>.github.io/pdf-toolkit/` without
reconfiguration.

## Project layout

```
src/
  engine/       Framework-independent processing layer
    types.ts             Shared contracts; all engine page indexes are 0-based
    validation.ts        Byte-signature checks, filename safety, object URLs
    errors.ts            ProcessingError codes and user-facing copy
    naming.ts            Default output names
    pdfEngine.ts         mergePdfs, editPdf, splitPdf, imagesToPdf
    advancedPdfEngine.ts compressPdf, cropPdf, addPagesToPdf, page geometry
    pdfDocument.ts       The one pdf.js worker setup and document opener
    pdfRenderer.ts       Thumbnails and pdfToImages
    documentModel.ts     Format-neutral document model, scope, report
    layoutAnalyzer.ts    Positioned tokens to semantic blocks (no pdf.js)
    pdfTextExtractor.ts  pdf.js adapter building ExtractedDocument values
    markdownExporter.ts  Deterministic GitHub-flavored Markdown
    docxExporter.ts      DOCX writer, imported lazily in the browser
    splitParser.ts       One-based split-expression parsing
    download.ts          Direct download, ZIP packaging, delivery planning
  components/   Dashboard, shared controls, and one workspace per tool
  router/       Hash router
  styles/       Theme tokens and base styles (system fonts; no font files)
  test/         Vitest suites and fixtures
e2e/            Playwright suite (Chromium)
  harness/      Dev-only page exposing the engine for real-canvas assertions
  support/      Node-side fixture builders and base64 transport
```

Page indexes are zero-based everywhere inside the engine. User-facing page
numbers and split expressions are one-based and converted only at the UI
boundary.

## Documentation

- [docs/PDF_TOOL_IMPLEMENTATION_PLAN.md](docs/PDF_TOOL_IMPLEMENTATION_PLAN.md)
  — scope, architecture, interfaces, and acceptance criteria.
- [CHANGELOG.md](CHANGELOG.md) — release history.
