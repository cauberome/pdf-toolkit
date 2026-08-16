# PDF Toolkit Implementation Plan

## Goal

Build a simple, privacy-first web tool that merges, deletes/reorders, splits,
and converts PDF files. All document processing happens in the browser; files
are never uploaded to a server.

## Product Scope

Version 1 provides seven focused workspaces from a common dashboard:

1. **Merge PDFs** — add two or more PDFs, reorder them, remove unwanted files,
   and download one merged PDF.
2. **Delete and reorder pages** — open one PDF, select pages to remove, reorder
   retained pages, and download the edited document.
3. **Split PDF** — split every page into its own document or define custom
   output groups. Custom syntax uses semicolons between files and commas or
   ranges within a file, for example `1-3;4,6;7-9`.
4. **Convert** — convert ordered JPG, PNG, or WebP images into one PDF, or render
   selected PDF pages as PNG/JPEG images.
5. **Compress PDF** — use an automatic quality preset or enter a best-effort
   target file size. Compression rasterizes pages, so the workspace must warn
   that selectable text, links, forms, and other interactive content are lost.
6. **Crop PDF** — visually define top, right, bottom, and left crop margins and
   apply them to selected pages or the whole document without rasterizing the
   retained content.
7. **Add Pages** — insert blank pages, all pages from another PDF, or ordered
   JPG/PNG/WebP images before the first page, between pages, or after the last
   page.

Accounts, cloud storage, analytics, OCR, Office conversion, and password
removal are outside version 1.

## Architecture

- **Application:** Vite, React, and TypeScript single-page application.
- **Navigation:** Hash routes (`/#/merge`, `/#/edit`, `/#/split`,
  `/#/convert`, `/#/compress`, `/#/crop`, and `/#/add-pages`) so direct links
  work on GitHub Pages.
- **PDF engine:** `pdf-lib` for PDF creation and page manipulation.
- **Rendering:** `pdfjs-dist` with a locally bundled web worker for thumbnails
  and PDF-to-image conversion.
- **Archives:** `jszip` for downloads containing multiple generated files.
- **State:** Component/feature state only. Document bytes and object URLs are
  released when a file is removed, a tool is reset, or the page closes.
- **Hosting:** Static production bundle deployed to GitHub Pages through GitHub
  Actions. There is no runtime application server or document API.

## Internal Interfaces

The processing layer exposes framework-independent TypeScript functions:

```ts
export type PdfSource = {
  id: string;
  name: string;
  bytes: Uint8Array;
};

export type PageRange = {
  start: number;
  end: number;
};

export async function mergePdfs(
  sources: PdfSource[],
): Promise<Uint8Array>;

export async function editPdf(
  source: PdfSource,
  retainedPages: number[],
): Promise<Uint8Array>;

export async function splitPdf(
  source: PdfSource,
  groups: number[][],
): Promise<Uint8Array[]>;

export async function imagesToPdf(
  images: File[],
): Promise<Uint8Array>;

export async function pdfToImages(
  source: PdfSource,
  format: "png" | "jpeg",
  pages: number[],
  scale: 1 | 2,
): Promise<Blob[]>;

export async function compressPdf(
  source: PdfSource,
  options: CompressionOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<CompressionResult>;

export async function cropPdf(
  source: PdfSource,
  pages: number[],
  margins: CropMargins,
): Promise<Uint8Array>;

export async function addPagesToPdf(
  source: PdfSource,
  insertionIndex: number,
  addition: PageAddition,
): Promise<Uint8Array>;
```

All page indexes inside the processing layer are zero-based. User-facing page
numbers and split expressions are one-based and converted at the UI boundary.

## Frontend Work

1. Create the application shell, shared theme, responsive dashboard, and hash
   routes.
2. Build reusable file-drop, file-list, page-thumbnail, progress, error,
   confirmation, and download components.
3. Build the Merge workspace with file ordering and removal controls.
4. Build the Delete/Reorder workspace with page selection, select-all/clear,
   keyboard controls, and drag reordering.
5. Build the Split workspace with every-page and custom-group modes, inline
   expression validation, and output summaries.
6. Build the Convert workspace with Images-to-PDF and PDF-to-Images tabs,
   format/page/scale controls, and appropriate download behavior.
7. Add accessible labels, visible focus states, screen-reader status messages,
   non-color-only selection indicators, mobile layouts, and privacy copy.
8. Build the Compress workspace with automatic presets, target-size input,
   before/after size reporting, progress, and a permanent rasterization warning.
9. Build the Crop workspace with thumbnail selection, a visible crop overlay,
   synchronized margin controls, apply-to-selection/all behavior, and reset.
10. Build the Add Pages workspace with base document, insertion position, and
    blank/PDF/image addition modes.

## Processing and Deployment Work

This is the backend task group even though it runs locally in the browser.

1. Implement PDF signature/type validation, readable error categories, safe
   filenames, and object URL cleanup.
2. Implement and unit-test merge and page-edit operations.
3. Implement the split-expression parser and PDF split operation.
4. Implement image decoding and Images-to-PDF conversion while preserving
   order and aspect ratio.
5. Implement PDF.js worker setup, page rendering, PNG/JPEG encoding, and ZIP
   packaging for multiple outputs.
6. Reject empty, malformed, unsupported, and password-protected inputs without
   crashing or losing the current workspace state.
7. Configure production builds, repository-relative assets, GitHub Actions,
   and GitHub Pages deployment.
8. Implement raster compression presets, target-size attempts, size reporting,
   progress callbacks, and the best-result fallback when a target is not met.
9. Implement crop-box validation and selected-page crop-box updates while
   preserving the original page content streams.
10. Implement insertion of blank pages, imported PDF pages, and images at a
    validated zero-based insertion boundary.

## Error and Download Rules

- Prevent merge until at least two valid PDFs are present.
- Prevent editing from deleting every page.
- Reject split groups containing page zero, reversed ranges, out-of-range
  pages, empty groups, or duplicate pages inside one output group.
- Download one generated file directly. Package two or more generated files in
  a ZIP archive.
- Use `merged.pdf`, `<source>-edited.pdf`, `<source>-part-01.pdf`, and
  `<source>-page-001.png`/`.jpg` as default names.
- Show a recoverable memory/processing error for documents too large for the
  current browser instead of defining an arbitrary upload-size limit.
- Treat compression target size as best-effort: report whether the target was
  reached and always keep the smallest valid attempt available for download.
- Reject crop margins that leave less than 5% of either page dimension visible.
- Reject page insertion positions outside `0..pageCount`; `0` means before the
  first page and `pageCount` means after the last page.

## Verification and Acceptance

- Unit tests cover parsing, validation, output naming, merge order, retained
  page order, split groups, image order, image dimensions, and output format.
- Component tests cover drag/drop, keyboard selection, progress, errors, reset,
  and download states.
- Playwright tests complete all four workflows in Chromium, Firefox, and
  WebKit using small deterministic fixtures.
- Malformed, encrypted, zero-byte, and mislabeled fixtures fail cleanly.
- Production build assets and all hash routes load from the GitHub Pages base
  path.
- Browser network inspection confirms that document bytes and filenames are
  never sent over the network.
- Final verification includes desktop and mobile layout checks and confirms
  that temporary object URLs are released after reset.
- Compression tests cover preset selection, attempt ordering, target reached/
  missed reporting, output validity, and page count.
- Crop tests verify selected-page crop boxes, untouched pages, margin limits,
  and vector-preserving PDF output.
- Add Pages tests verify insertion at the beginning/middle/end, blank-page
  dimensions, imported PDF order, image order, and invalid positions.

## Delivery Order

1. Establish the tested project shell and shared contracts.
2. Implement the processing engine operations with unit tests, including
   compression, crop, and page insertion.
3. Connect each of the seven frontend workspaces to the tested engine.
4. Complete accessibility, error handling, and end-to-end coverage.
5. Configure and verify GitHub Pages deployment.
6. Update `CHANGELOG.md`, complete all items in `TASKS.md`, record final test
   evidence, and then delete `TASKS.md` as the final implementation step.
