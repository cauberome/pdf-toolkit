/**
 * Real-canvas coverage for the raster path, and confirmation of the five
 * defects found in the pre-release review of BE-08/09/10.
 *
 * Every assertion here was previously out of reach: jsdom has no canvas, so
 * `pdfToImages` and everything downstream of it could only be tested through
 * their sizing rules. These tests run the actual code — pdf.js worker, canvas,
 * JPEG/PNG encoders — and read the pixels back.
 */

import { test, expect, type Page } from '@playwright/test';
import {
  BANDED_HEIGHT,
  BANDED_WIDTH,
  createBandedRotatedPdf,
  createHeavyPdf,
  createMislabeledBytes,
  createRotatedPdf,
  createSolidPdf,
  cropBoxes,
  fromBase64,
  pageSizes,
  toBase64,
} from './support/fixtures';

async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e/harness/index.html');
  await page.waitForFunction(() => Boolean(window.engineApi));
}

test.beforeEach(async ({ page }) => {
  await openHarness(page);
});

test.describe('real canvas rasterisation', () => {
  test('renders a page to actual pixels at the documented dimensions', async ({ page }) => {
    const pdf = await createSolidPdf(200, 600);

    const result = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'solid', name: 'solid.pdf', bytes: api.fromBase64(b64) };
      const blobs = await api.renderer.pdfToImages(source, 'png', [0], 1);

      const bitmap = await createImageBitmap(blobs[0]);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

      let coloured = 0;
      for (let i = 0; i < data.length; i += 4) {
        // The fixture is solid blue; anything non-white proves real drawing.
        if (data[i] < 200 && data[i + 2] > 150) coloured += 1;
      }
      return { width: bitmap.width, height: bitmap.height, coloured, blobSize: blobs[0].size };
    }, toBase64(pdf));

    // renderDimensions(200, 600, 1) — the 1x preset renders at a 1.5 viewport scale.
    expect(result.width).toBe(300);
    expect(result.height).toBe(900);
    expect(result.blobSize).toBeGreaterThan(0);
    // A blank canvas would score zero here; this is the check jsdom cannot make.
    expect(result.coloured).toBeGreaterThan(result.width * result.height * 0.9);
  });

  test('honours the 2x scale preset', async ({ page }) => {
    const pdf = await createSolidPdf(200, 600);

    const size = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'solid', name: 'solid.pdf', bytes: api.fromBase64(b64) };
      const blobs = await api.renderer.pdfToImages(source, 'png', [0], 2);
      const bitmap = await createImageBitmap(blobs[0]);
      return { width: bitmap.width, height: bitmap.height };
    }, toBase64(pdf));

    expect(size).toEqual({ width: 600, height: 1800 });
  });
});

test.describe('BE-08 — compression preserves page shape', () => {
  test('a rotated page keeps the shape a viewer draws, not its media box', async ({ page }) => {
    // Portrait 200x600 media box with /Rotate 90 — displayed as 600x200.
    const pdf = await createHeavyPdf(200, 600, { rotation: 90 });

    const out = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'rot', name: 'rotated.pdf', bytes: api.fromBase64(b64) };
      const result = await api.advanced.compressPdf(source, { mode: 'auto', preset: 'balanced' });
      return { bytes: api.toBase64(result.bytes), rasterized: result.rasterized };
    }, toBase64(pdf));

    // Guard: `compressPdf` returns the source untouched when rasterising would
    // enlarge it, which would leave the assertion below testing nothing.
    expect(out.rasterized).toBe(true);
    // Before the fix this came back [200, 600] and the content was stretched
    // into a page of the wrong aspect ratio.
    expect(await pageSizes(fromBase64(out.bytes))).toEqual([[600, 200]]);
  });

  test('a cropped page compresses to its cropped shape', async ({ page }) => {
    const pdf = await createHeavyPdf(400, 400);

    const out = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'sq', name: 'square.pdf', bytes: api.fromBase64(b64) };
      // Crop half the width away, leaving a 200x400 visible box.
      const cropped = await api.advanced.cropPdf(source, [0], {
        top: 0,
        right: 25,
        bottom: 0,
        left: 25,
      });
      const result = await api.advanced.compressPdf(
        { id: 'cropped', name: 'cropped.pdf', bytes: cropped },
        { mode: 'auto', preset: 'balanced' },
      );
      return { bytes: api.toBase64(result.bytes), rasterized: result.rasterized };
    }, toBase64(pdf));

    expect(out.rasterized).toBe(true);
    // Crop-then-compress is exactly the case the media-box sizing broke: the
    // raster page must follow the crop box, not the untouched 400x400 media box.
    expect(await pageSizes(fromBase64(out.bytes))).toEqual([[200, 400]]);
  });

  test('target mode validates a file that is already under the target', async ({ page }) => {
    const bytes = createMislabeledBytes();

    const failure = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'bad', name: 'not-really.pdf', bytes: api.fromBase64(b64) };
      try {
        await api.advanced.compressPdf(source, { mode: 'target', targetBytes: 10_000_000 });
        return { threw: false, code: null as string | null, message: '' };
      } catch (error) {
        const code = api.errors.isProcessingError(error) ? error.code : 'NOT_TYPED';
        return { threw: true, code, message: api.errors.toUserMessage(error) };
      }
    }, toBase64(bytes));

    // The early return used to hand this straight back as a successful result.
    expect(failure.threw).toBe(true);
    expect(failure.code).toBe('NOT_A_PDF');
    expect(failure.message).toContain('not-really.pdf');
  });
});

test.describe('BE-09 — crop follows the displayed orientation', () => {
  test('trimming the visual top removes the band shown at the top', async ({ page }) => {
    const pdf = await createBandedRotatedPdf(90);

    const counts = await page.evaluate(
      async ({ b64, band }: { b64: string; band: number }) => {
        const api = window.engineApi!;
        const bytes = api.fromBase64(b64);

        async function redFraction(pdfBytes: Uint8Array, name: string) {
          const blobs = await api.renderer.pdfToImages({ id: name, name, bytes: pdfBytes }, 'png', [0], 1);
          const bitmap = await createImageBitmap(blobs[0]);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          let red = 0;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 180 && data[i + 1] < 80 && data[i + 2] < 80) red += 1;
          }
          return red / (bitmap.width * bitmap.height);
        }

        const before = await redFraction(bytes, 'before.pdf');
        // Trim 30% off the top as the person sees it; the band occupies the
        // first `band`% of that edge, so it must disappear entirely.
        const cropped = await api.advanced.cropPdf({ id: 'r', name: 'rotated.pdf', bytes }, [0], {
          top: 30,
          right: 0,
          bottom: 0,
          left: 0,
        });
        const after = await redFraction(cropped, 'after.pdf');
        return { before, after, band };
      },
      { b64: toBase64(pdf), band: (40 / BANDED_WIDTH) * 100 },
    );

    // Control: the band really is on screen before cropping, so a zero
    // afterwards means the crop removed it rather than it never being drawn.
    expect(counts.before).toBeGreaterThan(0.1);
    // Before the fix the unrotated top was trimmed and the band survived.
    expect(counts.after).toBeLessThan(0.01);
  });

  test('crops only the selected page, and only its crop box', async ({ page }) => {
    const pdf = await createSolidPdf(300, 500, 3);

    const out = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'multi', name: 'multi.pdf', bytes: api.fromBase64(b64) };
      const cropped = await api.advanced.cropPdf(source, [1], {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
      });
      return api.toBase64(cropped);
    }, toBase64(pdf));

    const bytes = fromBase64(out);
    const boxes = await cropBoxes(bytes);
    expect(boxes[0]).toEqual([300, 500]);
    expect(boxes[2]).toEqual([300, 500]);
    expect(boxes[1]).toEqual([240, 400]);

    // Crop is vector-preserving: it narrows the crop box and leaves every
    // media box — and therefore the page content itself — alone.
    expect(await pageSizes(bytes)).toEqual([
      [300, 500],
      [300, 500],
      [300, 500],
    ]);
  });
});

test.describe('BE-10 — page insertion', () => {
  test('a "match" blank page copies the size the neighbour displays at', async ({ page }) => {
    const pdf = await createRotatedPdf(90, 200, 600);

    const out = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'rot', name: 'rotated.pdf', bytes: api.fromBase64(b64) };
      const result = await api.advanced.addPagesToPdf(source, 1, {
        kind: 'blank',
        count: 1,
        size: 'match',
      });
      return api.toBase64(result);
    }, toBase64(pdf));

    const sizes = await pageSizes(fromBase64(out));
    // The neighbour displays as 600x200, so a portrait blank page beside it
    // would be the defect this replaced.
    expect(sizes[1]).toEqual([600, 200]);
  });

  test('an empty image selection reports a recoverable error naming the file', async ({ page }) => {
    const pdf = await createSolidPdf(200, 600);

    const failure = await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'base', name: 'base-document.pdf', bytes: api.fromBase64(b64) };
      try {
        await api.advanced.addPagesToPdf(source, 0, { kind: 'images', files: [] });
        return { threw: false, code: null as string | null, message: '', recoverable: false };
      } catch (error) {
        const typed = api.errors.isProcessingError(error);
        return {
          threw: true,
          code: typed ? error.code : 'NOT_TYPED',
          message: api.errors.toUserMessage(error),
          recoverable: typed ? error.recoverable : false,
        };
      }
    }, toBase64(pdf));

    expect(failure.threw).toBe(true);
    expect(failure.code).toBe('INVALID_SELECTION');
    expect(failure.recoverable).toBe(true);
    // The name used to be missing, leaving the message about "this document".
    expect(failure.message).toContain('base-document.pdf');
  });
});

test.describe('privacy', () => {
  test('processing a document sends no network request', async ({ page }) => {
    const pdf = await createSolidPdf(200, 600, 2);
    const external: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('http://localhost:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
        external.push(url);
      }
    });

    await page.evaluate(async (b64: string) => {
      const api = window.engineApi!;
      const source = { id: 'p', name: 'private.pdf', bytes: api.fromBase64(b64) };
      await api.advanced.compressPdf(source, { mode: 'auto', preset: 'balanced' });
      await api.renderer.pdfToImages(source, 'png', [0, 1], 1);
    }, toBase64(pdf));

    expect(external).toEqual([]);
  });
});

test.describe('fixture sanity', () => {
  test('the banded fixture is built as the crop test assumes', async () => {
    const pdf = await createBandedRotatedPdf(90);
    // Media box stays portrait; only /Rotate makes it display landscape.
    expect(await pageSizes(pdf)).toEqual([[BANDED_WIDTH, BANDED_HEIGHT]]);
  });
});
