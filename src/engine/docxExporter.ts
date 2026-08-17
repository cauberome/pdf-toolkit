/**
 * Serializes an extracted document to a Word DOCX file, in the browser.
 *
 * The `docx` package is imported dynamically so it stays out of the initial
 * application chunk: someone merging two PDFs should never download a Word
 * writer. Everything is generated locally — no service, no template fetch, no
 * embedded font — which is what keeps the conversion as private as the rest of
 * the toolkit.
 */

import type * as DocxLibrary from 'docx';
import type { DocumentBlock, ExtractedDocument, InlineRun } from './documentModel';
import { toProcessingError } from './errors';
import { isSafeHref } from './layoutAnalyzer';

type Docx = typeof DocxLibrary;

/** Stable numbering references, so list shapes survive a round trip in Word. */
export const ORDERED_NUMBERING_REFERENCE = 'pdf-convert-ordered';
export const UNORDERED_NUMBERING_REFERENCE = 'pdf-convert-unordered';

const INDENT_PER_LEVEL = { left: 720, hanging: 360 };

function headingLevelFor(docx: Docx, level: 1 | 2 | 3) {
  if (level === 1) return docx.HeadingLevel.HEADING_1;
  if (level === 2) return docx.HeadingLevel.HEADING_2;
  return docx.HeadingLevel.HEADING_3;
}

/**
 * Builds the runs of one block. A run with an approved link target becomes a
 * real Word hyperlink; anything else keeps its text and loses the target, and
 * the scheme is checked here as well as during extraction because this is the
 * last point before the target is written into a file.
 */
function childrenForRuns(docx: Docx, runs: InlineRun[]) {
  return runs.map((run) => {
    const textRun = new docx.TextRun({
      text: run.text,
      bold: run.bold === true,
      italics: run.italic === true,
    });

    if (!isSafeHref(run.href)) return textRun;

    return new docx.ExternalHyperlink({
      link: run.href!,
      children: [
        new docx.TextRun({
          text: run.text,
          bold: run.bold === true,
          italics: run.italic === true,
          style: 'Hyperlink',
        }),
      ],
    });
  });
}

function paragraphsForBlock(docx: Docx, block: DocumentBlock): DocxLibrary.Paragraph[] {
  switch (block.kind) {
    case 'heading':
      return [
        new docx.Paragraph({
          heading: headingLevelFor(docx, block.level),
          children: childrenForRuns(docx, block.runs),
        }),
      ];

    case 'paragraph':
      return [new docx.Paragraph({ children: childrenForRuns(docx, block.runs) })];

    case 'list':
      return block.items.map(
        (item) =>
          new docx.Paragraph({
            numbering: {
              reference: block.ordered ? ORDERED_NUMBERING_REFERENCE : UNORDERED_NUMBERING_REFERENCE,
              level: 0,
            },
            children: childrenForRuns(docx, item),
          }),
      );

    case 'table':
      return [];
  }
}

function tableForBlock(docx: Docx, rows: InlineRun[][][]) {
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);

  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    rows: rows.map(
      (row) =>
        new docx.TableRow({
          children: Array.from({ length: columns }, (_, index) => {
            const cell = row[index] ?? [];
            return new docx.TableCell({
              children: [new docx.Paragraph({ children: childrenForRuns(docx, cell) })],
            });
          }),
        }),
    ),
  });
}

/**
 * Flattens the document into section children, inserting a page break before
 * every extracted page after the first so the source pagination is still
 * visible in an editable file.
 */
function buildDocxChildren(docx: Docx, document: ExtractedDocument) {
  const children: Array<DocxLibrary.Paragraph | DocxLibrary.Table> = [];

  document.pages.forEach((page, index) => {
    if (index > 0) {
      children.push(new docx.Paragraph({ children: [new docx.PageBreak()] }));
    }

    for (const block of page.blocks) {
      if (block.kind === 'table') {
        children.push(tableForBlock(docx, block.rows));
        // Word merges consecutive tables that are not separated by a paragraph.
        children.push(new docx.Paragraph({ children: [] }));
        continue;
      }
      children.push(...paragraphsForBlock(docx, block));
    }
  });

  return children;
}

function numberingConfig(docx: Docx) {
  return [
    {
      reference: ORDERED_NUMBERING_REFERENCE,
      levels: [
        {
          level: 0,
          format: docx.LevelFormat.DECIMAL,
          text: '%1.',
          alignment: docx.AlignmentType.START,
          style: { paragraph: { indent: INDENT_PER_LEVEL } },
        },
      ],
    },
    {
      reference: UNORDERED_NUMBERING_REFERENCE,
      levels: [
        {
          level: 0,
          format: docx.LevelFormat.BULLET,
          text: '•',
          alignment: docx.AlignmentType.START,
          style: { paragraph: { indent: INDENT_PER_LEVEL } },
        },
      ],
    },
  ];
}

/**
 * Generates the DOCX file for an already extracted document.
 *
 * @throws ProcessingError classified from whatever the library or the browser
 * raises, so an allocation failure still reads as `OUT_OF_MEMORY` rather than
 * an unexplained crash.
 */
export async function exportDocx(document: ExtractedDocument): Promise<Blob> {
  try {
    const docx = await import('docx');

    const output = new docx.Document({
      numbering: { config: numberingConfig(docx) },
      sections: [{ children: buildDocxChildren(docx, document) }],
    });

    return await docx.Packer.toBlob(output);
  } catch (error) {
    throw toProcessingError(error, 'UNKNOWN', document.sourceName);
  }
}
