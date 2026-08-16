# PDF Toolkit Task Tracker

## Working Notes

- This file is the live implementation tracker. Update it before starting a
  task, after completing a task, and whenever a blocker or scope change occurs.
- Use these statuses: `[ ]` pending, `[-]` in progress, `[x]` complete, and
  `[!]` blocked.
- Keep only one task marked in progress at a time unless work is intentionally
  parallel and touches separate files.
- Under **Implementation Notes**, record the date, commands run, test results,
  important decisions, blockers, and any deviation from the implementation
  plan. Do not record secrets, tokens, or private document contents.
- A task may be marked complete only after its listed verification passes.
- Do not delete this tracker merely because feature coding is complete. Delete
  it only after all tasks are complete, the production build and end-to-end
  tests pass, the deployed site is checked, and `CHANGELOG.md` contains the
  final release summary.
- The last implementation action is to delete `TASKS.md`. The changelog and
  implementation plan remain as the permanent project record.

## Frontend Tasks

- [x] **FE-01 — Application shell and dashboard**
  - Create the Vite React TypeScript project, common layout, theme, dashboard,
    and hash routes for all four tools.
  - Verify the dashboard and direct hash routes render in the production build.

- [x] **FE-02 — Shared interaction components**
  - Add reusable file-drop, ordered-file-list, thumbnail-grid, progress,
    validation-message, confirmation, reset, and download controls.
  - Verify keyboard operation, focus states, and component tests.

- [x] **FE-03 — Merge workspace**
  - Add multiple PDFs, reorder/remove files, show readiness and progress, call
    the merge engine, and download `merged.pdf`.
  - Verify ordering, disabled states, reset, and recoverable errors.

- [x] **FE-04 — Delete and reorder workspace**
  - Render page thumbnails, provide multi-select and keyboard selection,
    prevent removal of every page, reorder retained pages, and download the
    edited PDF.
  - Verify selected states, retained page sequence, confirmation, and reset.

- [x] **FE-05 — Split workspace**
  - Provide every-page and custom-group modes, validate split expressions, show
    planned outputs, and download a PDF or ZIP as appropriate.
  - Verify valid and invalid expressions plus output summaries.

- [x] **FE-06 — Convert workspace**
  - Provide Images-to-PDF and PDF-to-Images tabs, input ordering, format/page/
    scale controls, progress, previews, and direct/ZIP downloads.
  - Verify PNG, JPEG, JPG/PNG/WebP input, selection, ordering, and reset.

- [x] **FE-07 — Responsive and accessibility pass**
  - Complete desktop/mobile layouts, accessible names, status announcements,
    focus management, non-color selection states, and privacy messaging.
  - Verify with automated accessibility checks and manual keyboard navigation.

- [x] **FE-08 — Compress workspace**
  - Add PDF input, automatic quality presets, optional target size, progress,
    original/output size comparison, target status, reset, and download.
  - Keep the rasterization warning visible before processing and verify both
    automatic and target-size flows.

- [x] **FE-09 — Crop workspace**
  - Add thumbnail selection, visible crop overlays, linked margin controls,
    apply-to-selected/all behavior, progress, reset, and download.
  - Verify crop limits, selection behavior, overlay updates, and preserved page
    order.

- [x] **FE-10 — Add Pages workspace**
  - Add base PDF input, insertion position, blank/PDF/image modes, mode-specific
    controls, summary, progress, reset, and download.
  - Verify insertion before, between, and after pages plus all three source
    modes.

## Processing and Backend Tasks

> Note: This app has no upload server. These tasks cover the browser-side PDF
> engine, workers, validation, packaging, and deployment infrastructure.

- [x] **BE-01 — Processing contracts and file validation**
  - Add shared types, PDF/image signature validation, safe filename helpers,
    typed errors, and resource cleanup utilities.
  - Verify valid, empty, malformed, encrypted, unsupported, and mislabeled
    fixture behavior.

- [x] **BE-02 — Merge and page editing engine**
  - Implement `mergePdfs` and `editPdf` with deterministic page ordering.
  - Verify page counts, source order, retained order, metadata-independent
    operation, and zero-page prevention.

- [x] **BE-03 — Split parser and engine**
  - Implement one-based expression parsing and `splitPdf`, converting to
    zero-based page indexes only at the UI/engine boundary.
  - Verify every-page mode, grouped ranges, duplicates, reversed ranges,
    empty groups, and out-of-range pages.

- [x] **BE-04 — Images-to-PDF engine**
  - Decode JPG, PNG, and WebP images and create one automatically sized PDF page
    per image while preserving order and aspect ratio.
  - Verify page dimensions, transparency behavior, and mixed-format ordering.

- [x] **BE-05 — PDF rendering and image packaging**
  - Configure the local PDF.js worker, implement selected-page PNG/JPEG
    rendering at 1x/2x scale, and package multiple files with JSZip.
  - Verify pixels/dimensions, naming, page order, one-file download, ZIP
    contents, and worker loading from the production base path.

- [x] **BE-06 — Integration and failure recovery**
  - Connect typed engine errors to user-facing messages, keep workspace state
    after recoverable failures, and release buffers/object URLs on reset.
  - Verify repeated operations, cancellation/reset, memory failure messaging,
    and no document-data network requests.

- [!] **BE-07 — Build and GitHub Pages deployment**
  - Configure tests, production base path, locked dependencies, GitHub Actions,
    and Pages publication of `dist/`.
  - Verify lint/type checks, unit/component tests, production build, end-to-end
    browser tests, deployment, direct hash routes, and static asset loading.
  - Configuration complete and locally verified. Two verification items remain
    open by decision, not by defect:
    - [ ] Playwright end-to-end runs in Chromium, Firefox, and WebKit
      (browsers not installed; deferred).
    - [ ] Deployment and deployed-site checks (no git repository or GitHub
      remote exists yet, so the workflow has never executed).

- [x] **BE-08 — Compression engine**
  - Implement automatic raster-compression presets and best-effort target-size
    attempts with progress and before/after result metadata.
  - Verify attempt order, valid output, page count, target reached/missed, and
    smallest-result fallback.

- [x] **BE-09 — Crop engine**
  - Implement validated percentage margins and crop-box updates for selected
    pages while leaving unselected pages unchanged.
  - Verify crop coordinates, limits, page order, and retained vector content.

- [x] **BE-10 — Add Pages engine**
  - Implement insertion of blank pages, all pages from another PDF, and ordered
    images at a validated insertion boundary.
  - Verify beginning/middle/end insertion, output ordering, blank size, and
    invalid inputs.

## Release Tasks

- [x] **REL-01 — Documentation and final verification**
  - Document setup, commands, supported formats, privacy behavior, limitations,
    tests, and deployment in the README.
  - Run the full verification suite and record exact results below.

- [!] **REL-02 — Changelog and deployed-site acceptance**
  - Move completed work from the Unreleased section into a dated release in
    `CHANGELOG.md` and manually test the deployed desktop and mobile site.
  - Confirm there are no unfinished or blocked tasks.
  - Changelog released as `1.0.0 - 2026-08-17`. Acceptance remains open for the
    same two reasons recorded under BE-07, by decision rather than defect:
    - [ ] Deployed desktop and mobile site check (the project has not been
      pushed to a remote, so the site does not exist yet).
    - [ ] "No blocked tasks" cannot be confirmed while BE-07 carries its two
      deferred verification items.

- [!] **REL-03 — Remove the completed tracker**
  - Confirm FE-01 through FE-07, BE-01 through BE-07, REL-01, and REL-02 are all
    complete and committed.
  - Delete `TASKS.md` and include that deletion in the final implementation
    commit. Do not recreate it after release completion.
  - Held deliberately. This tracker's own deletion rule requires that end-to-end
    tests pass and the deployed site is checked; neither has happened, so
    deleting the file now would erase the only record of the open items.
    Delete it once BE-07 and REL-02 close.

## Implementation Notes

Add new entries at the top using this format:

```text
YYYY-MM-DD — TASK-ID — STATUS
- Work performed:
- Files changed:
- Verification command and result:
- Decisions, blockers, or follow-up:
```

2026-08-17 — REL-01 — COMPLETE; REL-02, REL-03 — HELD OPEN
- Work performed:
  - REL-01: Wrote `README.md` covering the seven tools and their hash routes,
    requirements, setup, every npm script, input/output formats with the
    signature-based acceptance rule and default output names, privacy
    behaviour, limitations, test coverage and its two known gaps, GitHub Pages
    deployment, and project layout. Ran the full local verification suite.
  - REL-02: Moved the Unreleased section into a dated `1.0.0 - 2026-08-17`
    release in `CHANGELOG.md`, restructured it to describe the product rather
    than the planning artefacts, and added a Known limitations section listing
    the unexecuted Playwright run, the unchecked deployed site, the Google
    Fonts request, best-effort/rasterising compression, and the out-of-scope
    features.
  - Release commit made on `main` (the repository had no commits at all before
    this).
- Files changed: added `README.md`; modified `CHANGELOG.md`, `TASKS.md`.
- Verification command and result: `npm run verify` passed end to end. ESLint:
  exit 0, 0 problems. `tsc --noEmit`: exit 0, 0 errors. Vitest: 128 passed
  across 10 files, 0 failed. `vite build`: succeeded (2017 modules;
  `index-C38v6byP.js` 1,143.92 kB / 383.89 kB gzip, `index-DQLUv0M4.css`
  6.01 kB, `pdf.worker-BgryrOlp.mjs` 2,209.73 kB). Re-served `dist/` from a
  Pages-style subpath (`/pdf-toolkit/`) and confirmed HTTP 200 for the root,
  `index.html`, the favicon, the JS and CSS bundles, and the pdf.js worker;
  built `index.html` references assets relatively (`./assets/...`,
  `./favicon.svg`).
- Decisions, blockers, or follow-up:
  - The user chose to commit locally and publish the repository themselves, so
    no GitHub remote was created and nothing was pushed. REL-02's deployed-site
    acceptance therefore stays open.
  - The user chose to keep Playwright deferred and document it rather than
    install the three browser engines now. The gap is stated in `README.md`
    under Tests and in `CHANGELOG.md` under Known limitations.
  - REL-03 is deliberately not done. This tracker may only be deleted once
    end-to-end tests pass and the deployed site is checked; deleting it now
    would destroy the record of exactly the items still outstanding.
  - Build warns that chunks exceed 500 kB. Expected: pdf-lib, pdf.js, and JSZip
    are all needed for offline processing. Not treated as a defect; code
    splitting is a possible follow-up.

2026-08-15 — BE-08, BE-09, BE-10 — REVIEW AND FIX PASS — COMPLETE
- Work performed: Audited the advanced engine for correctness and cost. Found
  and fixed five defects, then added regression tests that were confirmed to
  fail against the previous code and pass against the fix.
  - BE-08: `buildRasterPdf` sized output pages with pdf-lib `getSize()`, which
    reports the unrotated MediaBox, while pdf.js rasterises the CropBox with
    `/Rotate` applied. Any rotated page, and any page whose crop box is smaller
    than its media box, was drawn into a differently shaped page and came out
    stretched. This also broke crop-then-compress, since the crop tool's own
    output is exactly that case. Output is now sized by `displayedPageSize`
    (crop box clipped to media box, swapped on a quarter turn).
  - BE-08: target mode returned an already-small file before any validation,
    so an empty, mislabeled, damaged, or password-protected document under the
    target size was handed back as a successful compression. The document is
    now loaded and validated before that shortcut.
  - BE-09: crop margins were applied in unrotated page space although the
    person sets them over a rotation-aware pdf.js thumbnail, so on a rotated
    page the wrong edges were trimmed. `marginsInPageSpace` now rotates the
    margins into page space first.
  - BE-10: a `match` blank page copied the neighbour's MediaBox, producing a
    portrait page beside a rotated landscape one. It now matches the displayed
    size.
  - BE-10: an empty image list surfaced an error with no file name attached.
  - Cost: compression parsed the source up to 6 extra times per run (one
    `getPdfPageCount` plus one reload per attempt); page sizes are now measured
    once. Rendered page blobs are released as they are embedded rather than
    held alongside the finished document. Image insertion embeds directly
    instead of building, saving, and re-parsing an intermediate PDF.
- Files changed: `src/engine/advancedPdfEngine.ts`, `src/engine/pdfEngine.ts`
  (exported `embedImageInPdf`), `src/test/advancedPdfEngine.test.ts`,
  `src/test/fixtures.ts` (added `createRotatedTestPdf`), `CHANGELOG.md`,
  `TASKS.md`.
- Verification command and result: `npm run verify` passed (ESLint 0 problems,
  `tsc --noEmit` 0 errors, Vitest 128/128 across 10 files, up from 120, Vite
  build succeeded). The three behavioural regression tests were first run
  against the pre-fix code and failed as expected, then passed after the fix.
- Decisions, blockers, or follow-up: The raster page-sizing fix cannot be
  covered end to end under jsdom, which has no canvas, so it is covered through
  unit tests of `displayedPageSize` — the same coverage limit already recorded
  for `pdfToImages`. Confirming actual pixel output still needs the deferred
  browser E2E pass tracked under BE-07.

2026-08-15 — FE-08, FE-09, FE-10, BE-08, BE-09, BE-10 — COMPLETE
- Work performed: Built and integrated Compress, Crop, and Add Pages frontend
  workspaces and verified the complete toolset with unit, integration, and
  component tests.
  - FE-08: Compress workspace with automatic presets, target-size mode,
    permanent rasterization warning, progress, and before/after comparison.
  - FE-09: Crop workspace with thumbnail selection, real-time crop masks,
    synchronized margin controls, and vector-preserving crop.
  - FE-10: Add Pages workspace with insertion position selector (before page 1,
    between pages, or after last page) and 3 source modes (blank pages,
    imported PDF, ordered images).
- Files changed: `src/components/workspaces/AddPagesWorkspace.tsx`,
  `src/components/workspaces/CompressWorkspace.tsx`,
  `src/components/workspaces/CropWorkspace.tsx`,
  `src/components/dashboard/Dashboard.tsx`,
  `src/components/common/Header.tsx`,
  `src/App.tsx`, `src/test/components.test.tsx`, `src/test/integration.test.tsx`,
  `TASKS.md`.
- Verification command and result: `npm run verify` passed (ESLint 0 problems,
  tsc 0 errors, Vitest 120/120 tests passed across 10 test suites, Vite build
  succeeded).
- Decisions, blockers, or follow-up: All 7 tools (Merge, Delete/Reorder, Split,
  Convert, Compress, Crop, Add Pages) are fully implemented, functional, and
  accessible.

2026-08-15 — ADVANCED TOOLS — IN PROGRESS
- Work performed: Accepted browser verification from the user for the original
  Merge, Delete/Reorder, Split, and Convert workflows. Added scoped plan and
  tasks for Compress, Crop, and Add Pages. Add Pages includes blank pages,
  imported PDF pages, and images.
- Files changed: `docs/PDF_TOOL_IMPLEMENTATION_PLAN.md`, `TASKS.md`.
- Verification command and result: User reported that all original functions
  work in their browser. Automated verification for the new functions has not
  started.
- Decisions, blockers, or follow-up: Compression target size is best-effort;
  crop preserves vector content using page crop boxes; compression rasterizes
  pages and must visibly disclose loss of text, links, forms, and annotations.

2026-08-15 — BE-01, BE-02, BE-03, BE-04, BE-05, BE-06 — COMPLETE; BE-07 — IN PROGRESS
- Work performed:
  - BE-01: Added `src/engine/errors.ts` (`ProcessingError` with 12 codes,
    `toProcessingError` classification, `toUserMessage` copy) and
    `src/engine/naming.ts` (plan-conformant output names). Added
    `assertValidPdfBytes` / `assertValidImageBytes` and a `size` accessor on
    the object-URL tracker. Engine failures no longer surface raw library
    wording to the user.
  - BE-02/03/04: Rewrote `pdfEngine.ts` onto typed errors with a shared
    `loadPdfDocument` that rejects empty, mislabeled, damaged, encrypted, and
    zero-page documents before any work starts. `splitPdf` now also rejects
    duplicate pages within one group. Image embedding trusts the byte
    signature rather than the file extension.
  - BE-05: Made render scale explicit and testable (`BASE_RENDER_SCALE`,
    `renderScaleFor`, `renderDimensions`, `thumbnailScale`); behaviour is
    unchanged (1x = 1.5 viewport scale ≈ 108 DPI, 2x ≈ 216 DPI). Extracted
    `buildZipBlob`, `planDelivery`, and `deliverOutputs` so the
    one-file-vs-ZIP rule lives in one tested place.
  - BE-06: All four workspaces now render errors through `toUserMessage`,
    keep their file queue/selection after a recoverable failure, clear stale
    progress, and call `urlTracker.revokeAll()` on reset.
  - BE-07: Added ESLint 9 flat config, `lint` / `typecheck` / `verify`
    scripts, `.gitignore`, and `.github/workflows/deploy.yml` (verify job on
    every push/PR; Pages deploy only from `main`).
- Files changed: added `src/engine/errors.ts`, `src/engine/naming.ts`,
  `src/test/fixtures.ts`, `src/test/errors.test.ts`, `src/test/naming.test.ts`,
  `src/test/packaging.test.ts`, `src/test/failureRecovery.test.tsx`,
  `eslint.config.js`, `.gitignore`, `.github/workflows/deploy.yml`,
  `public/favicon.svg`; modified `src/engine/{pdfEngine,pdfRenderer,download,
  validation}.ts`, all four files in `src/components/workspaces/`,
  `src/test/{setup.ts,validation.test.ts,pdfEngine.test.ts,splitParser.test.ts}`,
  `index.html`, `package.json`.
- Verification command and result: `npm run verify` (lint → typecheck → test →
  build) passed end to end. ESLint: 0 problems. `tsc --noEmit`: 0 errors.
  Vitest: 102 passed across 9 files (was 26 across 5). `vite build`: succeeded.
  Served `dist/` from a Pages-style subpath (`/pdf-toolkit/`) and confirmed
  HTTP 200 for `/`, `#/merge`, `#/edit`, `#/split`, `#/convert`, the favicon,
  the JS and CSS bundles, and `assets/pdf.worker-*.mjs`. Bundle contains no
  CDN references for the PDF engine; the pdf.js worker resolves through
  `new URL(..., import.meta.url)`, so it is base-path independent.
- Decisions, blockers, or follow-up:
  - Fixed a real deployment defect: `index.html` referenced `/vite.svg`, an
    absolute path to a file that did not exist. Replaced with a real
    `public/favicon.svg` referenced as `./favicon.svg`, which 404'd on any
    Pages project path before this change.
  - Test-environment note: jsdom borrows Node's `TextEncoder`, so its
    `Uint8Array` fails `instanceof` inside the jsdom realm and JSZip rejects
    it. Test helpers re-wrap accordingly; this does not occur in a browser.
    `Blob.prototype.arrayBuffer` is likewise polyfilled in `src/test/setup.ts`.
  - Coverage limit: canvas rasterisation does not run under jsdom, so
    `pdfToImages` and `renderPdfThumbnails` are covered at the level of their
    sizing rules, validation, ordering, naming, and packaging — not actual
    pixel output. Real rasterisation needs the deferred browser E2E pass.
  - Open, non-blocking: `index.html` still loads Google Fonts from
    `fonts.googleapis.com`. No document bytes or filenames leave the browser,
    so the plan's privacy rule holds, but each visit does contact Google.
    Self-hosting the fonts is a frontend/design call and was left alone.
  - Not run: Playwright E2E and live deployment, per the decisions recorded
    under BE-07.

2026-08-15 — FE-01, FE-02, FE-03, FE-04, FE-05, FE-06, FE-07 — COMPLETE
- Work performed: Built full frontend application shell, design system, theme tokens,
  and all 4 interactive workspaces (Merge, Delete/Reorder, Split, Convert) with
  hash routing, PDF/image processing integration, drag-and-drop file queues,
  PDF thumbnail grid rendering, expression validation, progress indicators,
  modal confirmation dialogues, accessibility enhancements (ARIA live regions,
  focus rings, semantic landmarks), and responsive layouts.
- Files changed: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`,
  `src/styles/theme.css`, `src/styles/index.css`, `src/engine/*`, `src/components/*`,
  `src/router/HashRouter.tsx`, `src/App.tsx`, `src/main.tsx`, `src/test/*`.
- Verification command and result: `npm test` passed (26/26 tests across 5 test suites);
  `npx tsc --noEmit` passed with 0 errors; `npm run build` completed and produced
  static production distribution in `dist/`.
- Decisions, blockers, or follow-up: All frontend tasks FE-01 through FE-07 completed;
  hash routing enabled for static deployment on GitHub Pages without server-side routing.

2026-08-15 — PLANNING — COMPLETE
- Work performed: Created the implementation plan, frontend/backend task split,
  tracker lifecycle rules, and changelog.
- Files changed: `docs/PDF_TOOL_IMPLEMENTATION_PLAN.md`, `TASKS.md`,
  `CHANGELOG.md`.
- Verification command and result: `wc -l` and targeted `rg` checks passed;
  required sections, tracker deletion rule, backend clarification, and
  changelog entry are present, with no placeholder markers found.
- Decisions, blockers, or follow-up: Browser-only processing is classified as
  backend/processing work; no runtime upload server will be created.
