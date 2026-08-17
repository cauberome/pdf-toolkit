import { describe, expect, it } from 'vitest';
import {
  pageIndicesForScope,
  summarizeDocument,
  type ExtractedDocument,
} from '../engine/documentModel';

describe('document extraction model', () => {
  it('expands all pages into zero-based indexes', () => {
    expect(pageIndicesForScope({ mode: 'all' }, 3)).toEqual([0, 1, 2]);
  });

  it('uses an inclusive-exclusive engine range', () => {
    expect(
      pageIndicesForScope(
        { mode: 'range', startIndex: 1, endIndexExclusive: 4 },
        5,
      ),
    ).toEqual([1, 2, 3]);
  });

  it.each([
    [{ mode: 'range', startIndex: -1, endIndexExclusive: 2 }, 3],
    [{ mode: 'range', startIndex: 2, endIndexExclusive: 2 }, 3],
    [{ mode: 'range', startIndex: 1, endIndexExclusive: 4 }, 3],
    [{ mode: 'range', startIndex: 1.5, endIndexExclusive: 3 }, 3],
    [{ mode: 'range', startIndex: 0, endIndexExclusive: Number.NaN }, 3],
  ] as const)('rejects an invalid range', (scope, totalPages) => {
    expect(() => pageIndicesForScope(scope, totalPages)).toThrow(
      expect.objectContaining({ code: 'INVALID_SELECTION' }),
    );
  });

  it('rejects an all-pages scope over a document with no pages', () => {
    expect(() => pageIndicesForScope({ mode: 'all' }, 0)).toThrow(
      expect.objectContaining({ code: 'INVALID_SELECTION' }),
    );
  });

  it('counts exported structures and empty source pages', () => {
    const document = {
      sourceName: 'report.pdf',
      scope: { mode: 'all' },
      pages: [
        {
          sourcePageIndex: 0,
          hasExtractableText: true,
          blocks: [
            { kind: 'heading', level: 1, runs: [{ text: 'Title' }] },
            { kind: 'paragraph', runs: [{ text: 'Body' }] },
            {
              kind: 'table',
              rows: [
                [[{ text: 'A' }], [{ text: 'B' }]],
                [[{ text: '1' }], [{ text: '2' }]],
              ],
            },
          ],
        },
        { sourcePageIndex: 1, hasExtractableText: false, blocks: [] },
      ],
      warnings: [],
    } satisfies ExtractedDocument;

    expect(summarizeDocument(document)).toMatchObject({
      processedPages: 2,
      headingCount: 1,
      paragraphCount: 1,
      tableCount: 1,
      pagesWithoutText: [2],
    });
  });

  it('counts lists and every link in any block kind', () => {
    const document: ExtractedDocument = {
      sourceName: 'links.pdf',
      scope: { mode: 'range', startIndex: 2, endIndexExclusive: 3 },
      pages: [
        {
          sourcePageIndex: 2,
          hasExtractableText: true,
          blocks: [
            {
              kind: 'paragraph',
              runs: [{ text: 'see ' }, { text: 'site', href: 'https://example.com' }],
            },
            {
              kind: 'list',
              ordered: true,
              items: [[{ text: 'one', href: 'https://example.com/1' }], [{ text: 'two' }]],
            },
            {
              kind: 'list',
              ordered: false,
              items: [[{ text: 'bullet' }]],
            },
            {
              kind: 'table',
              rows: [[[{ text: 'cell', href: 'mailto:a@example.com' }]]],
            },
          ],
        },
      ],
      warnings: [{ code: 'FIGURES_OMITTED' }],
    };

    expect(summarizeDocument(document)).toEqual({
      processedPages: 1,
      headingCount: 0,
      paragraphCount: 1,
      listCount: 2,
      tableCount: 1,
      linkCount: 3,
      pagesWithoutText: [],
      warnings: [{ code: 'FIGURES_OMITTED' }],
    });
  });
});
