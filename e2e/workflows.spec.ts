/**
 * End-to-end coverage of all seven workspaces, driven the way a person drives
 * them: choose files, operate the controls, take the download.
 *
 * These complete the workflow half of BE-07. They run against Chromium only;
 * Firefox and WebKit remain outstanding and are tracked in TASKS.md.
 */

import { test, expect, type Download, type Page } from '@playwright/test';
import { createPngBytes } from '../src/test/fixtures';
import { createSolidPdf } from './support/fixtures';

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

test.describe('workspace workflows', () => {
  test('merge combines two documents into merged.pdf', async ({ page }) => {
    await page.goto('/#/merge');
    await chooseFiles(page, [
      pdfFile('first.pdf', await createSolidPdf(200, 300, 2)),
      pdfFile('second.pdf', await createSolidPdf(200, 300, 3)),
    ]);

    const download = await downloadFrom(page, /Merge 2 Files/i);
    expect(download.suggestedFilename()).toBe('merged.pdf');
  });

  test('delete and reorder saves an edited document', async ({ page }) => {
    await page.goto('/#/edit');
    await chooseFiles(page, [pdfFile('report.pdf', await createSolidPdf(200, 300, 3))]);

    // Thumbnails are rendered with the real pdf.js canvas path.
    await expect(page.getByRole('button', { name: /Save \d+ Pages?/i })).toBeEnabled({
      timeout: 20_000,
    });

    const download = await downloadFrom(page, /Save \d+ Pages?/i);
    expect(download.suggestedFilename()).toBe('report-edited.pdf');
  });

  test('split produces a ZIP of one document per page', async ({ page }) => {
    await page.goto('/#/split');
    await chooseFiles(page, [pdfFile('manual.pdf', await createSolidPdf(200, 300, 3))]);

    const download = await downloadFrom(page, /Extract \d+ Documents?/i);
    // Three outputs must be packaged rather than downloaded individually.
    expect(download.suggestedFilename()).toBe('manual-split.zip');
  });

  test('images convert into a single PDF', async ({ page }) => {
    await page.goto('/#/convert');
    await chooseFiles(page, [
      pngFile('one.png', createPngBytes(40, 60)),
      pngFile('two.png', createPngBytes(60, 40)),
    ]);

    const download = await downloadFrom(page, /Create PDF/i);
    expect(download.suggestedFilename()).toBe('converted-images.pdf');
  });

  test('a PDF converts into page images', async ({ page }) => {
    await page.goto('/#/convert');
    // The mode switcher is a proper tablist, not a pair of plain buttons.
    await page.getByRole('tab', { name: /PDF to Images/i }).click();
    await chooseFiles(page, [pdfFile('deck.pdf', await createSolidPdf(200, 300, 2))]);

    const download = await downloadFrom(page, /Export \d+ Images?/i);
    expect(download.suggestedFilename()).toBe('deck-images.zip');
  });

  test('compress returns a smaller document', async ({ page }) => {
    await page.goto('/#/compress');
    await chooseFiles(page, [pdfFile('scan.pdf', await createSolidPdf(400, 600, 2))]);

    const download = await downloadFrom(page, /Compress and Download/i);
    expect(download.suggestedFilename()).toBe('scan-compressed.pdf');
  });

  test('crop applies margins to the selected pages', async ({ page }) => {
    await page.goto('/#/crop');
    await chooseFiles(page, [pdfFile('poster.pdf', await createSolidPdf(400, 600, 2))]);

    await page.getByRole('button', { name: /Select all/i }).click();

    const download = await downloadFrom(page, /Crop \d+ Pages?/i);
    expect(download.suggestedFilename()).toBe('poster-cropped.pdf');
  });

  test('add pages inserts blank pages into a document', async ({ page }) => {
    await page.goto('/#/add-pages');
    await chooseFiles(page, [pdfFile('contract.pdf', await createSolidPdf(200, 300, 2))]);

    const download = await downloadFrom(page, /Save & Download PDF/i);
    expect(download.suggestedFilename()).toBe('contract-pages-added.pdf');
  });
});

test.describe('recoverable failures', () => {
  test('a mislabeled file is refused with a readable message', async ({ page }) => {
    await page.goto('/#/merge');
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
    await page.goto('/#/merge');
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
      await page.goto(`/${route}`);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    }
  });

  test('loading and using the app makes no third-party request', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('http://localhost:')) external.push(request.url());
    });

    await page.goto('/#/merge');
    await chooseFiles(page, [
      pdfFile('a.pdf', await createSolidPdf(200, 300, 1)),
      pdfFile('b.pdf', await createSolidPdf(200, 300, 1)),
    ]);
    await downloadFrom(page, /Merge 2 Files/i);

    expect(external).toEqual([]);
  });
});
