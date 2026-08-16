import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildZipBlob, planDelivery, ZipEntry } from '../engine/download';
import {
  BASE_RENDER_SCALE,
  renderScaleFor,
  renderDimensions,
  thumbnailScale,
} from '../engine/pdfRenderer';
import { pageImageFilename, splitPartFilename, splitZipFilename } from '../engine/naming';

/**
 * jsdom borrows Node's `TextEncoder`, so its output is a Node-realm
 * `Uint8Array` that fails `instanceof Uint8Array` inside the jsdom realm —
 * which JSZip's type detection relies on. Browsers have a single realm; the
 * copy here only reproduces that. Do not "simplify" it away.
 */
const bytes = (text: string) => new Uint8Array(new TextEncoder().encode(text));

describe('BE-05 — render scale', () => {
  it('maps the 1x and 2x presets onto viewport scales', () => {
    expect(BASE_RENDER_SCALE).toBe(1.5);
    expect(renderScaleFor(1)).toBe(1.5);
    expect(renderScaleFor(2)).toBe(3);
  });

  it('doubles output pixels from 1x to 2x', () => {
    const at1x = renderDimensions(612, 792, 1);
    const at2x = renderDimensions(612, 792, 2);

    expect(at1x).toEqual({ width: 918, height: 1188 });
    expect(at2x.width).toBe(at1x.width * 2);
    expect(at2x.height).toBe(at1x.height * 2);
  });

  it('produces whole pixel dimensions', () => {
    const { width, height } = renderDimensions(595.28, 841.89, 1);
    expect(Number.isInteger(width)).toBe(true);
    expect(Number.isInteger(height)).toBe(true);
  });

  it('preserves aspect ratio within a pixel at both scales', () => {
    const source = 612 / 792;
    for (const scale of [1, 2] as const) {
      const { width, height } = renderDimensions(612, 792, scale);
      expect(Math.abs(width / height - source)).toBeLessThan(0.01);
    }
  });

  it('fits thumbnails inside the box without upscaling past the cap', () => {
    // Tall page: height is the constraining side.
    expect(thumbnailScale(612, 792, 260)).toBeCloseTo(260 / 792, 5);
    // Tiny page: capped rather than blown up.
    expect(thumbnailScale(50, 50, 260)).toBe(1.5);
  });
});

describe('BE-05 — delivery routing', () => {
  const one: ZipEntry[] = [{ name: 'only-part-01.pdf', data: bytes('a') }];
  const many: ZipEntry[] = [
    { name: 'doc-part-01.pdf', data: bytes('a') },
    { name: 'doc-part-02.pdf', data: bytes('b') },
  ];

  it('downloads a lone output directly under its own name', () => {
    const plan = planDelivery(one, 'doc-split.zip');
    expect(plan).toEqual({ kind: 'file', name: 'only-part-01.pdf', data: one[0].data });
  });

  it('packages two or more outputs into the archive', () => {
    const plan = planDelivery(many, 'doc-split.zip');
    expect(plan.kind).toBe('zip');
    if (plan.kind === 'zip') {
      expect(plan.name).toBe('doc-split.zip');
      expect(plan.entries).toHaveLength(2);
    }
  });

  it('refuses to plan a delivery with no outputs', () => {
    expect(() => planDelivery([], 'doc-split.zip')).toThrow(/at least one output/i);
  });
});

describe('BE-05 — ZIP packaging', () => {
  it('writes every entry under its given name, in order', async () => {
    const entries: ZipEntry[] = [
      { name: 'report-part-01.pdf', data: bytes('first') },
      { name: 'report-part-02.pdf', data: bytes('second') },
      { name: 'report-part-03.pdf', data: bytes('third') },
    ];

    const archive = await JSZip.loadAsync(await buildZipBlob(entries));

    expect(Object.keys(archive.files)).toEqual([
      'report-part-01.pdf',
      'report-part-02.pdf',
      'report-part-03.pdf',
    ]);
    expect(await archive.file('report-part-02.pdf')!.async('string')).toBe('second');
  });

  it('round-trips Blob entries as well as byte arrays', async () => {
    const entries: ZipEntry[] = [
      { name: 'a.png', data: new Blob([bytes('blob-data')]) },
      { name: 'b.png', data: bytes('array-data') },
    ];

    const archive = await JSZip.loadAsync(await buildZipBlob(entries));
    expect(await archive.file('a.png')!.async('string')).toBe('blob-data');
    expect(await archive.file('b.png')!.async('string')).toBe('array-data');
  });

  it('archives a full page-image export with plan-conformant names', async () => {
    const total = 3;
    const entries: ZipEntry[] = Array.from({ length: total }, (_, i) => ({
      name: pageImageFilename('report.pdf', i + 1, 'png', total),
      data: bytes(`page ${i + 1}`),
    }));

    const plan = planDelivery(entries, 'report-images.zip');
    expect(plan.kind).toBe('zip');

    const archive = await JSZip.loadAsync(await buildZipBlob(entries));
    expect(Object.keys(archive.files)).toEqual([
      'report-page-001.png',
      'report-page-002.png',
      'report-page-003.png',
    ]);
  });

  it('archives a full split export with plan-conformant names', async () => {
    const total = 2;
    const entries: ZipEntry[] = Array.from({ length: total }, (_, i) => ({
      name: splitPartFilename('report.pdf', i + 1, total),
      data: bytes(`part ${i + 1}`),
    }));

    const archive = await JSZip.loadAsync(await buildZipBlob(entries));
    expect(Object.keys(archive.files)).toEqual(['report-part-01.pdf', 'report-part-02.pdf']);
    expect(splitZipFilename('report.pdf')).toBe('report-split.zip');
  });
});
