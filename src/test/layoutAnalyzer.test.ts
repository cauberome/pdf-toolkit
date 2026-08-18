import { describe, expect, it } from 'vitest';
import {
  analyzePageLayout,
  isSafeHref,
  type PositionedToken,
} from '../engine/layoutAnalyzer';

/**
 * Tokens are built by hand so every rule can be pinned to one geometric
 * cause. Width is an estimate of half the font size per character, which is
 * close enough to Helvetica for gap-based decisions.
 */
function token(
  text: string,
  x: number,
  y: number,
  size = 11,
  extra: Partial<PositionedToken> = {},
): PositionedToken {
  return {
    text,
    x,
    y,
    width: text.length * size * 0.5,
    height: size,
    fontSize: size,
    fontName: 'F1',
    direction: 'ltr',
    bold: false,
    italic: false,
    hasEOL: false,
    ...extra,
  };
}

function analyze(tokens: PositionedToken[], structureRoles: string[] = []) {
  return analyzePageLayout({ pageWidth: 600, pageHeight: 800, structureRoles, tokens });
}

describe('page layout analysis', () => {
  it('reads a larger bold line as a heading above body text', () => {
    expect(
      analyzePageLayout({
        pageWidth: 600,
        pageHeight: 800,
        structureRoles: [],
        tokens: [
          token('Introduction', 50, 740, 22, { bold: true }),
          token('First wrapped', 50, 700, 11),
          token('paragraph line.', 50, 684, 11),
        ],
      }),
    ).toEqual([
      {
        kind: 'heading',
        level: 1,
        runs: [{ text: 'Introduction', bold: true }],
      },
      {
        kind: 'paragraph',
        runs: [{ text: 'First wrapped paragraph line.' }],
      },
    ]);
  });

  it('gives three heading sizes three descending levels and stops there', () => {
    const blocks = analyze([
      token('Part One', 50, 760, 24, { bold: true }),
      token('Chapter', 50, 720, 18, { bold: true }),
      token('Section', 50, 690, 14, { bold: true }),
      token('Sub-section', 50, 660, 13, { bold: true }),
      token('Body copy for the page.', 50, 620, 11),
    ]);

    expect(blocks.filter((b) => b.kind === 'heading').map((b) => b.kind === 'heading' && b.level)).toEqual(
      [1, 2, 3, 3],
    );
  });

  it('prefers tagged heading roles when they map cleanly onto detected headings', () => {
    const blocks = analyze(
      [
        token('Overview', 50, 740, 16, { bold: true }),
        token('Body copy for the page.', 50, 700, 11),
        token('Details', 50, 640, 13, { bold: true }),
      ],
      ['H2', 'P', 'H3'],
    );

    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : b.kind))).toEqual([2, 'paragraph', 3]);
  });

  it('merges wrapped lines into a single paragraph and splits on a wider gap', () => {
    const blocks = analyze([
      token('The first paragraph starts', 50, 700, 11),
      token('and wraps onto a second line.', 50, 686, 11),
      token('A second paragraph begins here.', 50, 640, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'The first paragraph starts and wraps onto a second line.' }],
      },
      {
        kind: 'paragraph',
        runs: [{ text: 'A second paragraph begins here.' }],
      },
    ]);
  });

  it('joins a hyphenated word split across lines and drops the hyphen', () => {
    const blocks = analyze([
      token('The report covers inter-', 50, 700, 11),
      token('national shipping rules.', 50, 686, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'The report covers international shipping rules.' }],
      },
    ]);
  });

  it('keeps a trailing em dash intact', () => {
    const blocks = analyze([
      token('The decision was final—', 50, 700, 11),
      token('nobody objected.', 50, 686, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'The decision was final—nobody objected.' }],
      },
    ]);
  });

  it('does not join a hyphenated line when the next line starts a new sentence', () => {
    const blocks = analyze([
      token('A well-known trade-', 50, 700, 11),
      token('Off was accepted.', 50, 686, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [{ text: 'A well-known trade- Off was accepted.' }],
      },
    ]);
  });

  it('turns bullet markers into an unordered list', () => {
    const blocks = analyze([
      token('Shipping options:', 50, 700, 11),
      token('• Standard delivery', 60, 670, 11),
      token('• Express delivery', 60, 654, 11),
      token('• Collection in store', 60, 638, 11),
    ]);

    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Shipping options:' }] },
      {
        kind: 'list',
        ordered: false,
        items: [
          [{ text: 'Standard delivery' }],
          [{ text: 'Express delivery' }],
          [{ text: 'Collection in store' }],
        ],
      },
    ]);
  });

  it('turns numeric markers into an ordered list', () => {
    const blocks = analyze([
      token('1. Open the file', 60, 700, 11),
      token('2. Choose a range', 60, 684, 11),
      token('3. Download the result', 60, 668, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'list',
        ordered: true,
        items: [
          [{ text: 'Open the file' }],
          [{ text: 'Choose a range' }],
          [{ text: 'Download the result' }],
        ],
      },
    ]);
  });

  // Two columns of ordinary prose: each band is wide enough to be a column of
  // text rather than a label, and the two flows do not share baselines.
  const COLUMN_TOKENS = [
    token('Left column first paragraph.', 50, 700, 11),
    token('Right column first paragraph.', 330, 690, 11),
    token('Left column second paragraph.', 50, 660, 11),
    token('Right column second paragraph.', 330, 650, 11),
    token('Left column third paragraph.', 50, 620, 11),
    token('Right column third paragraph.', 330, 610, 11),
  ];

  const COLUMN_ORDER = [
    'Left column first paragraph.',
    'Left column second paragraph.',
    'Left column third paragraph.',
    'Right column first paragraph.',
    'Right column second paragraph.',
    'Right column third paragraph.',
  ];

  it('reads two persistent text bands as columns, left column first', () => {
    const blocks = analyze(COLUMN_TOKENS);

    expect(blocks.map((b) => (b.kind === 'paragraph' ? b.runs[0].text : b.kind))).toEqual(COLUMN_ORDER);
  });

  it('keeps a full-width heading above the columns it introduces', () => {
    const blocks = analyze([
      token('Quarterly Results Across Both Columns', 50, 760, 20, { bold: true }),
      ...COLUMN_TOKENS,
    ]);

    expect(blocks[0]).toEqual({
      kind: 'heading',
      level: 1,
      runs: [{ text: 'Quarterly Results Across Both Columns', bold: true }],
    });
    expect(blocks.slice(1).map((b) => b.kind === 'paragraph' && b.runs[0].text)).toEqual(COLUMN_ORDER);
  });

  it('builds a table from stable column anchors across three rows', () => {
    const blocks = analyze([
      token('Region', 50, 700, 11, { bold: true }),
      token('Units', 250, 700, 11, { bold: true }),
      token('Revenue', 430, 700, 11, { bold: true }),
      token('North', 50, 684, 11),
      token('120', 250, 684, 11),
      token('4,800', 430, 684, 11),
      token('South', 50, 668, 11),
      token('95', 250, 668, 11),
      token('3,700', 430, 668, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'table',
        rows: [
          [[{ text: 'Region', bold: true }], [{ text: 'Units', bold: true }], [{ text: 'Revenue', bold: true }]],
          [[{ text: 'North' }], [{ text: '120' }], [{ text: '4,800' }]],
          [[{ text: 'South' }], [{ text: '95' }], [{ text: '3,700' }]],
        ],
      },
    ]);
  });

  it('leaves a two-row aligned layout as paragraphs rather than inventing a table', () => {
    const blocks = analyze([
      token('Region', 50, 700, 11),
      token('Units', 250, 700, 11),
      token('North', 50, 684, 11),
      token('120', 250, 684, 11),
    ]);

    expect(blocks.every((block) => block.kind === 'paragraph')).toBe(true);
  });

  it('keeps a right-aligned numeric column together with its header row', () => {
    // Real reports right-align numbers, so a cell's left edge moves with the
    // width of its text while its right edge stays put. Anchoring on the left
    // edge alone drops whichever row's text lengths differ most — usually the
    // header, whose words are longer than the figures below it.
    const rows = [
      ['Region', 'Revenue', 'Growth'],
      ['North', '1,240', '12%'],
      ['South', '980', '7%'],
      ['East', '12,500', '3%'],
    ];
    const tokens = rows.flatMap((row, index) => {
      const y = 700 - index * 20;
      return [
        token(row[0], 72, y),
        token(row[1], 320 - row[1].length * 5.5, y),
        token(row[2], 470 - row[2].length * 5.5, y),
      ];
    });

    const blocks = analyze(tokens);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'table' });
    const table = blocks[0] as { kind: 'table'; rows: Array<Array<Array<{ text: string }>>> };
    expect(table.rows.map((row) => row.map((cell) => cell.map((run) => run.text).join('')))).toEqual([
      ['Region', 'Revenue', 'Growth'],
      ['North', '1,240', '12%'],
      ['South', '980', '7%'],
      ['East', '12,500', '3%'],
    ]);
  });

  it('absorbs a wrapped cell into the row it continues', () => {
    // A cell whose text wraps puts a short line under one column. Treating that
    // as the end of the table left the rows below it as prose, which is how a
    // real table came out as paragraphs.
    const blocks = analyze([
      token('Region', 72, 700),
      token('Notes', 252, 700),
      token('North', 72, 680),
      token('Grew on renewals and', 252, 680),
      token('a pricing change', 252, 664),
      token('South', 72, 644),
      token('Flat year over year', 252, 644),
    ]);

    expect(blocks).toHaveLength(1);
    const table = blocks[0] as { kind: 'table'; rows: Array<Array<Array<{ text: string }>>> };
    expect(table.rows.map((row) => row.map((cell) => cell.map((run) => run.text).join('')))).toEqual([
      ['Region', 'Notes'],
      ['North', 'Grew on renewals and a pricing change'],
      ['South', 'Flat year over year'],
    ]);
  });

  it('keeps only http, https, and mailto link targets', () => {
    const blocks = analyze([
      token('Safe site', 50, 700, 11, { href: 'https://example.com/report' }),
      token('Plain site', 50, 670, 11, { href: 'http://example.test' }),
      token('Contact', 50, 640, 11, { href: 'mailto:team@example.com' }),
      token('Script', 50, 610, 11, { href: 'javascript:alert(1)' }),
      token('Local file', 50, 580, 11, { href: 'file:///etc/passwd' }),
    ]);

    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Safe site', href: 'https://example.com/report' }] },
      { kind: 'paragraph', runs: [{ text: 'Plain site', href: 'http://example.test' }] },
      { kind: 'paragraph', runs: [{ text: 'Contact', href: 'mailto:team@example.com' }] },
      { kind: 'paragraph', runs: [{ text: 'Script' }] },
      { kind: 'paragraph', runs: [{ text: 'Local file' }] },
    ]);

    expect(isSafeHref('HTTPS://example.com')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('not a url at all')).toBe(false);
    expect(isSafeHref(undefined)).toBe(false);
  });

  it('keeps the space between two adjacent links out of both of them', () => {
    const blocks = analyze([
      token('Full site', 50, 700, 11, { href: 'https://example.com/report' }),
      token('Email us', 140, 700, 11, { href: 'mailto:team@example.com' }),
    ]);

    // A space absorbed into a link becomes part of the link text: underlined in
    // Word, inside the brackets in Markdown. It belongs to neither target.
    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { text: 'Full site', href: 'https://example.com/report' },
          { text: ' ' },
          { text: 'Email us', href: 'mailto:team@example.com' },
        ],
      },
    ]);
  });

  it('splits differently styled tokens into separate runs on one line', () => {
    const blocks = analyze([
      token('Please read the ', 50, 700, 11),
      token('terms', 140, 700, 11, { bold: true, italic: true }),
      token(' before continuing.', 175, 700, 11),
    ]);

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        runs: [
          { text: 'Please read the ' },
          { text: 'terms', bold: true, italic: true },
          { text: ' before continuing.' },
        ],
      },
    ]);
  });

  it('preserves right-to-left text and reads it right to left', () => {
    const blocks = analyze([
      token('שלום', 400, 700, 11, { direction: 'rtl' }),
      token('עולם', 340, 700, 11, { direction: 'rtl' }),
    ]);

    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'שלום עולם' }] }]);
  });

  it('returns no blocks for a page whose tokens are only whitespace', () => {
    expect(analyze([token('   ', 50, 700, 11), token('', 90, 700, 11)])).toEqual([]);
  });
});
