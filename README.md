So

# PDF Toolkit

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
| Convert            | `#/convert`   | JPG/PNG/WebP images into one PDF, or selected PDF pages out as PNG/JPEG.         |
| Compress PDF       | `#/compress`  | Automatic quality preset or best-effort target size. Rasterizes pages.           |
| Crop PDF           | `#/crop`      | Visual top/right/bottom/left margins applied to selected pages or all pages.     |
| Add Pages          | `#/add-pages` | Insert blank pages, every page of another PDF, or ordered images.                |

Routes are hash-based so a direct link works on GitHub Pages without any
server-side rewrite rules.

## Requirements

- Node.js 20 or newer (CI builds on Node 20)
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
| `npm run verify`     | lint → typecheck → test → build. The gate CI runs.                 |

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
- ZIP whenever an operation produces two or more files. A single generated file
  always downloads directly.

**Default names**

`merged.pdf`, `converted-images.pdf`, `<source>-edited.pdf`,
`<source>-part-01.pdf`, `<source>-page-001.png` / `.jpg`,
`<source>-compressed.pdf`, `<source>-cropped.pdf`, `<source>-pages-added.pdf`,
`<source>-split.zip`, `<source>-images.zip`.

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
- **No OCR, no Office conversion, no accounts, no cloud storage, no analytics.**
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

Two coverage limits are worth knowing:

- jsdom has no canvas, so `pdfToImages` and `renderPdfThumbnails` are tested at
  the level of their sizing rules, validation, ordering, naming, and packaging
  rather than actual pixel output. Confirming real rasterization needs a
  browser.
- jsdom borrows Node's `TextEncoder`, whose `Uint8Array` fails `instanceof`
  inside the jsdom realm, so JSZip rejects it. Test helpers re-wrap
  accordingly; this does not happen in a real browser.

Playwright end-to-end runs across Chromium, Firefox, and WebKit are specified
in the implementation plan but have not been executed — see
[docs/PDF_TOOL_IMPLEMENTATION_PLAN.md](docs/PDF_TOOL_IMPLEMENTATION_PLAN.md).

## Deployment

`.github/workflows/deploy.yml` runs on every push and pull request to `main`:

1. **verify** — `npm ci`, then lint, typecheck, test, and build, then upload
   `dist/` as a Pages artifact.
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
    pdfRenderer.ts       pdf.js worker setup, thumbnails, pdfToImages
    splitParser.ts       One-based split-expression parsing
    download.ts          Direct download, ZIP packaging, delivery planning
  components/   Dashboard, shared controls, and one workspace per tool
  router/       Hash router
  styles/       Theme tokens and base styles (system fonts; no font files)
  test/         Vitest suites and fixtures
```

Page indexes are zero-based everywhere inside the engine. User-facing page
numbers and split expressions are one-based and converted only at the UI
boundary.

## Documentation

- [docs/PDF_TOOL_IMPLEMENTATION_PLAN.md](docs/PDF_TOOL_IMPLEMENTATION_PLAN.md)
  — scope, architecture, interfaces, and acceptance criteria.
- [CHANGELOG.md](CHANGELOG.md) — release history.
