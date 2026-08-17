import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { exportMarkdown } from '../engine/markdownExporter';
import { exportDocx } from '../engine/docxExporter';
import type { ExtractedDocument } from '../engine/documentModel';

function decode(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function documentOf(pages: ExtractedDocument['pages']): ExtractedDocument {
  return { sourceName: 'report.pdf', scope: { mode: 'all' }, pages, warnings: [] };
}

function page(sourcePageIndex: number, blocks: ExtractedDocument['pages'][number]['blocks']) {
  return { sourcePageIndex, hasExtractableText: blocks.length > 0, blocks };
}

describe('Markdown export', () => {
  it('serializes every block kind in source order with page markers', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            { kind: 'heading', level: 1, runs: [{ text: 'Annual Report' }] },
            { kind: 'heading', level: 3, runs: [{ text: 'Scope' }] },
            { kind: 'paragraph', runs: [{ text: 'First paragraph.' }] },
            { kind: 'paragraph', runs: [{ text: 'Second paragraph.' }] },
            {
              kind: 'list',
              ordered: false,
              items: [[{ text: 'Alpha' }], [{ text: 'Beta' }]],
            },
            {
              kind: 'list',
              ordered: true,
              items: [[{ text: 'First' }], [{ text: 'Second' }]],
            },
            {
              kind: 'table',
              rows: [
                [[{ text: 'Region' }], [{ text: 'Units' }]],
                [[{ text: 'North' }], [{ text: '120' }]],
              ],
            },
          ]),
          page(1, [{ kind: 'paragraph', runs: [{ text: 'Second page body.' }] }]),
        ]),
      ),
    );

    expect(markdown).toBe(
      [
        '<!-- Page 1 -->',
        '',
        '# Annual Report',
        '',
        '### Scope',
        '',
        'First paragraph.',
        '',
        'Second paragraph.',
        '',
        '- Alpha',
        '- Beta',
        '',
        '1. First',
        '2. Second',
        '',
        '| Region | Units |',
        '| --- | --- |',
        '| North | 120 |',
        '',
        '<!-- Page 2 -->',
        '',
        'Second page body.',
        '',
      ].join('\n'),
    );
  });

  it('marks an empty source page with its page comment alone', () => {
    const markdown = decode(
      exportMarkdown(documentOf([page(0, []), page(1, [{ kind: 'paragraph', runs: [{ text: 'Text.' }] }])])),
    );

    expect(markdown).toBe('<!-- Page 1 -->\n\n<!-- Page 2 -->\n\nText.\n');
  });

  it('emphasises runs without trapping spaces inside the markers', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            {
              kind: 'paragraph',
              runs: [
                { text: 'Please read the ' },
                { text: 'terms', bold: true },
                { text: ' and the ' },
                { text: 'notes', italic: true },
                { text: ' and the ' },
                { text: 'appendix', bold: true, italic: true },
                { text: '.' },
              ],
            },
          ]),
        ]),
      ),
    );

    expect(markdown).toBe(
      '<!-- Page 1 -->\n\nPlease read the **terms** and the *notes* and the ***appendix***.\n',
    );
  });

  it('writes safe links and leaves unsafe targets as plain text', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            {
              kind: 'paragraph',
              runs: [
                { text: 'Handbook', href: 'https://example.com/a(b)' },
                { text: ' and ' },
                { text: 'Team', href: 'mailto:team@example.com' },
                { text: ' and ' },
                { text: 'Script', href: 'javascript:alert(1)' },
              ],
            },
          ]),
        ]),
      ),
    );

    expect(markdown).toBe(
      '<!-- Page 1 -->\n\n[Handbook](<https://example.com/a(b)>) and [Team](mailto:team@example.com) and Script\n',
    );
  });

  it('escapes Markdown syntax without touching the words themselves', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            { kind: 'paragraph', runs: [{ text: 'costs a|b and c\\d and [ref] and *star*' }] },
            {
              kind: 'table',
              rows: [
                [[{ text: 'a|b' }], [{ text: 'plain' }]],
                [[{ text: 'x' }], [{ text: 'y' }]],
                [[{ text: 'p' }], [{ text: 'q' }]],
              ],
            },
          ]),
        ]),
      ),
    );

    expect(markdown).toContain('costs a\\|b and c\\\\d and \\[ref\\] and \\*star\\*');
    expect(markdown).toContain('| a\\|b | plain |');
  });

  it('flattens a newline inside a run so a block cannot break apart', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([page(0, [{ kind: 'paragraph', runs: [{ text: 'one\ntwo\r\nthree' }] }])]),
      ),
    );

    expect(markdown).toBe('<!-- Page 1 -->\n\none two three\n');
  });

  it('keeps Unicode text byte-for-byte through UTF-8 encoding', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            { kind: 'heading', level: 2, runs: [{ text: '年度報告' }] },
            { kind: 'paragraph', runs: [{ text: 'Ελληνικά κείμενα — καλά.' }] },
          ]),
        ]),
      ),
    );

    expect(markdown).toBe('<!-- Page 1 -->\n\n## 年度報告\n\nΕλληνικά κείμενα — καλά.\n');
  });

  it('uses the first table row as the header row and pads short rows', () => {
    const markdown = decode(
      exportMarkdown(
        documentOf([
          page(0, [
            {
              kind: 'table',
              rows: [
                [[{ text: 'A' }], [{ text: 'B' }], [{ text: 'C' }]],
                [[{ text: '1' }], [], [{ text: '3' }]],
              ],
            },
          ]),
        ]),
      ),
    );

    expect(markdown).toBe(
      '<!-- Page 1 -->\n\n| A | B | C |\n| --- | --- | --- |\n| 1 |  | 3 |\n',
    );
  });

  it('ends with exactly one trailing newline', () => {
    const bytes = exportMarkdown(documentOf([page(0, [{ kind: 'paragraph', runs: [{ text: 'Body.' }] }])]));

    expect(decode(bytes).endsWith('Body.\n')).toBe(true);
    expect(bytes[bytes.length - 1]).toBe(0x0a);
    expect(bytes[bytes.length - 2]).not.toBe(0x0a);
  });
});

const RICH_DOCUMENT = documentOf([
  page(0, [
    { kind: 'heading', level: 1, runs: [{ text: 'Annual Report' }] },
    { kind: 'heading', level: 3, runs: [{ text: 'Scope' }] },
    {
      kind: 'paragraph',
      runs: [
        { text: 'Body with ' },
        { text: 'bold', bold: true },
        { text: ' and ' },
        { text: 'italic', italic: true },
        { text: ' words.' },
      ],
    },
    { kind: 'list', ordered: true, items: [[{ text: 'First step' }], [{ text: 'Second step' }]] },
    { kind: 'list', ordered: false, items: [[{ text: 'Alpha point' }], [{ text: 'Beta point' }]] },
    {
      kind: 'paragraph',
      runs: [
        { text: 'Handbook', href: 'https://example.com/handbook' },
        { text: ' and ' },
        { text: 'Script', href: 'javascript:alert(1)' },
      ],
    },
    {
      kind: 'table',
      rows: [
        [[{ text: 'Region' }], [{ text: 'Units' }]],
        [[{ text: 'North' }], [{ text: '120' }]],
      ],
    },
    { kind: 'paragraph', runs: [{ text: '年度報告 Ελληνικά' }] },
  ]),
  page(1, [{ kind: 'paragraph', runs: [{ text: 'Second page body.' }] }]),
]);

async function openDocx(document: ExtractedDocument) {
  const blob = await exportDocx(document);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return {
    zip,
    xml: await zip.file('word/document.xml')!.async('string'),
    relationships: await zip.file('word/_rels/document.xml.rels')!.async('string'),
    numbering: (await zip.file('word/numbering.xml')?.async('string')) ?? '',
  };
}

describe('DOCX export', () => {
  it('packages a real Word document with every supported structure', async () => {
    const { zip, xml, numbering } = await openDocx(RICH_DOCUMENT);

    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(xml).toContain('Heading1');
    expect(xml).toContain('Heading3');
    expect(xml).toContain('Annual Report');
    expect(xml).toContain('Second page body.');

    // Styled runs carry real run properties, not just text.
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');

    // Both list shapes are defined and referenced.
    expect(xml).toContain('<w:numPr>');
    expect(numbering).toContain('decimal');
    expect(numbering).toContain('bullet');

    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('Region');
    expect(xml).toContain('年度報告 Ελληνικά');

    // A page break separates each extracted page after the first.
    expect(xml).toContain('w:type="page"');
  });

  it('links only safe targets, as external relationships', async () => {
    const { xml, relationships } = await openDocx(RICH_DOCUMENT);

    expect(relationships).toContain('https://example.com/handbook');
    expect(relationships).toContain('TargetMode="External"');
    expect(relationships).not.toContain('javascript:');
    expect(xml).toContain('<w:hyperlink');
    // The unsafe target keeps its visible text.
    expect(xml).toContain('Script');
  });

  it('ships no macros, embedded fonts, or media', async () => {
    const { zip } = await openDocx(RICH_DOCUMENT);
    const names = Object.keys(zip.files);

    expect(zip.file('word/vbaProject.bin')).toBeNull();
    expect(names.some((name) => name.startsWith('word/media/'))).toBe(false);
    expect(names.some((name) => name.startsWith('word/fonts/'))).toBe(false);
    expect(names.some((name) => name.endsWith('.odttf'))).toBe(false);
  });

  it('inserts one page break per page boundary and none before the first page', async () => {
    const { xml } = await openDocx(RICH_DOCUMENT);
    const breaks = xml.match(/w:type="page"/g) ?? [];

    expect(breaks).toHaveLength(1);
    expect(xml.indexOf('Annual Report')).toBeLessThan(xml.indexOf('w:type="page"'));
  });

  it('produces a Word MIME type blob for a single-page document', async () => {
    const blob = await exportDocx(
      documentOf([page(0, [{ kind: 'paragraph', runs: [{ text: 'Only page.' }] }])]),
    );

    expect(blob.type).toContain('wordprocessingml.document');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('reports a library failure as a recoverable processing error', async () => {
    const broken = {
      ...RICH_DOCUMENT,
      pages: [{ sourcePageIndex: 0, hasExtractableText: true, blocks: [{ kind: 'table', rows: null }] }],
    } as unknown as ExtractedDocument;

    await expect(exportDocx(broken)).rejects.toMatchObject({
      name: 'ProcessingError',
      recoverable: true,
      fileName: 'report.pdf',
    });
  });
});
