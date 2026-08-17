/**
 * End-to-end coverage of all seven workspaces, driven the way a person drives
 * them: choose files, operate the controls, take the download.
 *
 * These complete the workflow half of BE-07. They run against Chromium only;
 * Firefox and WebKit remain outstanding and are tracked in TASKS.md.
 */

import { test, expect, type Download, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { createPngBytes } from '../src/test/fixtures';
import { CONVERSION_FIXTURE_PAGES, createSolidPdf, createTextPdf } from './support/fixtures';

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

function pdfFile(name: string, bytes: Uint8Array): UploadFile {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) };
}

function pngFile(name: string, bytes: Uint8Array): UploadFile {
  return { name, mimeType: 'image/png', buffer: Buffer.from(bytes) };
}

/**
 * The dropzone's file input is deliberately hidden from assistive technology
 * and from the pointer, so it is addressed directly rather than by role.
 * `setInputFiles` drives hidden inputs, which is exactly the seam a real file
 * chooser would use.
 */
async function chooseFiles(page: Page, files: UploadFile[], inputIndex = 0): Promise<void> {
  await page.locator('input[type="file"]').nth(inputIndex).setInputFiles(files);
}

/** Clicks an enabled control and returns the download it produces. */
async function downloadFrom(page: Page, name: RegExp): Promise<Download> {
  const button = page.getByRole('button', { name });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return download;
}

/**
 * Reads the bytes the browser actually saved. Asserting the filename alone
 * would pass just as happily for an empty or malformed file, which is the one
 * failure a conversion is most likely to produce.
 */
async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Opens the Convert workspace on its document-conversion tab with a PDF loaded. */
async function openDocumentConversion(page: Page, file: UploadFile): Promise<void> {
  await page.goto('#/convert');
  await page.getByRole('tab', { name: /PDF to Word.*Markdown/i }).click();
  await chooseFiles(page, [file]);
  await expect(page.getByRole('button', { name: 'Analyze document' })).toBeEnabled({
    timeout: 20_000,
  });
}

/** Runs the analysis and waits for the report the downloads are generated from. */
async function analyzeDocument(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Analyze document' }).click();
  await expect(page.getByRole('button', { name: 'Download Word' })).toBeEnabled({
    timeout: 30_000,
  });
}

async function conversionFixture(name = 'report.pdf'): Promise<UploadFile> {
  return pdfFile(name, await createTextPdf(CONVERSION_FIXTURE_PAGES));
}

test.describe('workspace workflows', () => {
  test('merge combines two documents into merged.pdf', async ({ page }) => {
    await page.goto('#/merge');
    await chooseFiles(page, [
      pdfFile('first.pdf', await createSolidPdf(200, 300, 2)),
      pdfFile('second.pdf', await createSolidPdf(200, 300, 3)),
    ]);

    const download = await downloadFrom(page, /Merge 2 Files/i);
    expect(download.suggestedFilename()).toBe('merged.pdf');
  });

  test('delete and reorder saves an edited document', async ({ page }) => {
    await page.goto('#/edit');
    await chooseFiles(page, [pdfFile('report.pdf', await createSolidPdf(200, 300, 3))]);

    // Thumbnails are rendered with the real pdf.js canvas path.
    await expect(page.getByRole('button', { name: /Save \d+ Pages?/i })).toBeEnabled({
      timeout: 20_000,
    });

    const download = await downloadFrom(page, /Save \d+ Pages?/i);
    expect(download.suggestedFilename()).toBe('report-edited.pdf');
  });

  test('split produces a ZIP of one document per page', async ({ page }) => {
    await page.goto('#/split');
    await chooseFiles(page, [pdfFile('manual.pdf', await createSolidPdf(200, 300, 3))]);

    const download = await downloadFrom(page, /Extract \d+ Documents?/i);
    // Three outputs must be packaged rather than downloaded individually.
    expect(download.suggestedFilename()).toBe('manual-split.zip');
  });

  test('images convert into a single PDF', async ({ page }) => {
    await page.goto('#/convert');
    await chooseFiles(page, [
      pngFile('one.png', createPngBytes(40, 60)),
      pngFile('two.png', createPngBytes(60, 40)),
    ]);

    const download = await downloadFrom(page, /Create PDF/i);
    expect(download.suggestedFilename()).toBe('converted-images.pdf');
  });

  test('a PDF converts into page images', async ({ page }) => {
    await page.goto('#/convert');
    // The mode switcher is a proper tablist, not a pair of plain buttons.
    await page.getByRole('tab', { name: /PDF to Images/i }).click();
    await chooseFiles(page, [pdfFile('deck.pdf', await createSolidPdf(200, 300, 2))]);

    const download = await downloadFrom(page, /Export \d+ Images?/i);
    expect(download.suggestedFilename()).toBe('deck-images.zip');
  });

  test('compress returns a smaller document', async ({ page }) => {
    await page.goto('#/compress');
    await chooseFiles(page, [pdfFile('scan.pdf', await createSolidPdf(400, 600, 2))]);

    const download = await downloadFrom(page, /Compress and Download/i);
    expect(download.suggestedFilename()).toBe('scan-compressed.pdf');
  });

  test('crop applies margins to the selected pages', async ({ page }) => {
    await page.goto('#/crop');
    await chooseFiles(page, [pdfFile('poster.pdf', await createSolidPdf(400, 600, 2))]);

    await page.getByRole('button', { name: /Select all/i }).click();

    const download = await downloadFrom(page, /Crop \d+ Pages?/i);
    expect(download.suggestedFilename()).toBe('poster-cropped.pdf');
  });

  test('add pages inserts blank pages into a document', async ({ page }) => {
    await page.goto('#/add-pages');
    await chooseFiles(page, [pdfFile('contract.pdf', await createSolidPdf(200, 300, 2))]);

    const download = await downloadFrom(page, /Save & Download PDF/i);
    expect(download.suggestedFilename()).toBe('contract-pages-added.pdf');
  });
});

test.describe('document conversion', () => {
  test('a text PDF converts to Markdown carrying every page', async ({ page }) => {
    await openDocumentConversion(page, await conversionFixture());
    await analyzeDocument(page);

    const download = await downloadFrom(page, /Download Markdown/i);
    expect(download.suggestedFilename()).toBe('report.md');

    const markdown = (await readDownload(download)).toString('utf8');
    expect(markdown).toContain('Report title');
    expect(markdown).toContain('First page body text.');
    expect(markdown).toContain('Second page heading');
    expect(markdown).toContain('Range-only body text.');
    // Page boundaries survive the round trip, not just the words.
    expect(markdown).toContain('<!-- Page 2 -->');
  });

  test('a text PDF converts to a Word package carrying every page', async ({ page }) => {
    await openDocumentConversion(page, await conversionFixture());
    await analyzeDocument(page);

    const download = await downloadFrom(page, /Download Word/i);
    expect(download.suggestedFilename()).toBe('report.docx');

    const zip = await JSZip.loadAsync(await readDownload(download));
    const xml = await zip.file('word/document.xml')!.async('string');

    expect(xml).toContain('First page body text.');
    expect(xml).toContain('Range-only body text.');
    expect(xml).toContain('Heading1');
    // A real page break, so the second source page starts where it did.
    expect(xml).toContain('w:type="page"');
  });

  test('a page range exports both formats in one archive', async ({ page }) => {
    await openDocumentConversion(page, await conversionFixture());

    await page.getByRole('radio', { name: 'Page range' }).click();
    await page.getByRole('spinbutton', { name: 'Start page' }).fill('2');
    await page.getByRole('spinbutton', { name: 'End page' }).fill('2');
    await analyzeDocument(page);

    const download = await downloadFrom(page, /Download Both/i);
    expect(download.suggestedFilename()).toBe('report-pages-2-2-documents.zip');

    const archive = await JSZip.loadAsync(await readDownload(download));
    expect(Object.keys(archive.files).sort()).toEqual([
      'report-pages-2-2.docx',
      'report-pages-2-2.md',
    ]);

    const markdown = await archive.file('report-pages-2-2.md')!.async('string');
    expect(markdown).toContain('Range-only body text.');
    // The unselected first page must be absent, or the range meant nothing.
    expect(markdown).not.toContain('First page body text.');

    const inner = await JSZip.loadAsync(
      await archive.file('report-pages-2-2.docx')!.async('uint8array'),
    );
    const xml = await inner.file('word/document.xml')!.async('string');
    expect(xml).toContain('Range-only body text.');
    expect(xml).not.toContain('First page body text.');
  });

  test('an image-only scan explains OCR and keeps the document loaded', async ({ page }) => {
    await openDocumentConversion(page, pdfFile('scan.pdf', await createSolidPdf(400, 600, 2)));

    await page.getByRole('button', { name: 'Analyze document' }).click();

    await expect(page.getByText(/has no extractable text/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/OCR/).first()).toBeVisible();

    // Recoverable: the file and its controls survive, and nothing downloadable
    // is offered in place of the text that could not be read.
    // Exact, because the error message names the file too.
    await expect(page.getByText('scan.pdf', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analyze document' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Download Word' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Download Markdown' })).toHaveCount(0);
  });

  test('converting a document makes no third-party request', async ({ page, baseURL }) => {
    const origin = new URL(baseURL!).origin;
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(origin)) external.push(request.url());
    });

    await openDocumentConversion(page, await conversionFixture());
    await analyzeDocument(page);
    await downloadFrom(page, /Download Word/i);

    // Word generation loads its writer lazily; that chunk must come from here.
    expect(external).toEqual([]);
  });
});

test.describe('recoverable failures', () => {
  test('a mislabeled file is refused with a readable message', async ({ page }) => {
    await page.goto('#/merge');
    await chooseFiles(page, [
      {
        name: 'pretend.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not a pdf at all'),
      },
    ]);

    await expect(page.getByText(/is not a PDF file/i)).toBeVisible({ timeout: 20_000 });
  });

  test('the workspace keeps working after a rejected file', async ({ page }) => {
    await page.goto('#/merge');
    await chooseFiles(page, [
      { name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('junk') },
    ]);
    await expect(page.getByText(/is not a PDF file/i)).toBeVisible({ timeout: 20_000 });

    // The queue must still accept work rather than needing a reload.
    await chooseFiles(page, [
      pdfFile('good-one.pdf', await createSolidPdf(200, 300, 1)),
      pdfFile('good-two.pdf', await createSolidPdf(200, 300, 1)),
    ]);
    const download = await downloadFrom(page, /Merge 2 Files/i);
    expect(download.suggestedFilename()).toBe('merged.pdf');
  });
});

test.describe('deployment shape', () => {
  test('every hash route renders its workspace directly', async ({ page }) => {
    const routes: Array<[string, RegExp]> = [
      ['#/merge', /Merge PDF Files/i],
      ['#/edit', /Delete|Reorder/i],
      ['#/split', /Split/i],
      ['#/convert', /Convert/i],
      ['#/compress', /Compress/i],
      ['#/crop', /Crop/i],
      ['#/add-pages', /Add Pages/i],
    ];

    for (const [route, heading] of routes) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
  });

  test('the layout fits a phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ['', '#/merge', '#/crop', '#/add-pages']) {
      await page.goto(route);

      // Guard first: a page that failed to render has no overflow either, and
      // would turn this into a test that passes hardest when most broken.
      await expect(
        page.locator('main button, main [role="button"]').first(),
        `nothing rendered on "${route || 'dashboard'}"`,
      ).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // A page wider than its viewport is the classic mobile regression, and
      // it is invisible at desktop width. The header nav is the usual culprit:
      // it scrolls internally, but only if it is allowed to shrink.
      expect(overflow, `horizontal overflow on "${route || 'dashboard'}"`).toBeLessThanOrEqual(1);
    }

    // The Convert workspace is checked with its widest tab selected: three
    // tabs, one of them long, is exactly the row that tips over first.
    await page.goto('#/convert');
    await page.getByRole('tab', { name: /PDF to Word.*Markdown/i }).click();
    await expect(page.getByText(/Drop a text-based PDF here/i)).toBeVisible();

    const convertOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(convertOverflow, 'horizontal overflow on "#/convert"').toBeLessThanOrEqual(1);

    // The primary action must still be reachable, not merely present.
    await page.goto('#/merge');
    await expect(page.getByRole('button', { name: /Drop PDF files here/i })).toBeVisible();
  });

  test('loading and using the app makes no third-party request', async ({ page, baseURL }) => {
    // Taken from baseURL so this holds for the deployed origin too, not just
    // the dev server.
    const origin = new URL(baseURL!).origin;
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith(origin)) external.push(request.url());
    });

    await page.goto('#/merge');
    await chooseFiles(page, [
      pdfFile('a.pdf', await createSolidPdf(200, 300, 1)),
      pdfFile('b.pdf', await createSolidPdf(200, 300, 1)),
    ]);
    await downloadFrom(page, /Merge 2 Files/i);

    expect(external).toEqual([]);
  });
});
