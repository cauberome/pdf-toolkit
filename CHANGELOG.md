# Changelog

All notable changes to the PDF Toolkit will be recorded in this file.

The format follows Keep a Changelog, and this project uses semantic versioning.

## [Unreleased]

Nothing yet.

## [1.0.0] - 2026-08-17

First release. A browser-only PDF workbench: every document is processed in the
tab that opened it, and no document byte or filename is sent anywhere.

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

### Changed

- Compression parses the source document once instead of re-parsing it for
  every quality attempt, and releases each rendered page as it is embedded,
  lowering peak memory on long documents.
- Adding images to a PDF embeds them directly rather than building, saving, and
  re-parsing an intermediate PDF.

### Known limitations

- Playwright end-to-end runs across Chromium, Firefox, and WebKit are specified
  in the implementation plan but have not been executed. Automated coverage is
  128 Vitest tests under jsdom, which has no canvas, so real rasterization
  output is unverified by machine.
- The deployed GitHub Pages site has not been checked, because the project has
  not been published to a remote yet.
- Compression target size is best-effort, and compression always rasterizes.
- Password removal, OCR, and Office-format conversion are out of scope.
