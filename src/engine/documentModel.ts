/**
 * The format-neutral document model shared by every text-conversion path.
 *
 * Extraction produces one `ExtractedDocument`; the Markdown and DOCX
 * serializers consume it without ever touching pdf.js again. Keeping the model
 * free of library types is what lets a single analysis pass feed both formats,
 * and lets the layout rules be tested without a PDF.
 *
 * Page indexes are zero-based everywhere inside the engine. One-based page
 * numbers exist only where a person reads them: report fields and file names.
 */

import { ProcessingError } from './errors';

export type ExtractionScope =
  | { mode: 'all' }
  | { mode: 'range'; startIndex: number; endIndexExclusive: number };

export type InlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  href?: string;
};

export type DocumentBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'list'; ordered: boolean; items: InlineRun[][] }
  | { kind: 'table'; rows: InlineRun[][][] };

export type ExtractedPage = {
  sourcePageIndex: number;
  hasExtractableText: boolean;
  blocks: DocumentBlock[];
};

export type ExtractionWarning =
  | { code: 'EMPTY_PAGE'; pageNumber: number }
  | { code: 'UNTAGGED_LAYOUT' }
  | { code: 'COMPLEX_WRITING_DIRECTION'; pageNumber: number }
  | { code: 'FIGURES_OMITTED' }
  | { code: 'COMPLEX_CONTENT_MAY_FLATTEN' };

export type ExtractionReport = {
  processedPages: number;
  headingCount: number;
  paragraphCount: number;
  listCount: number;
  tableCount: number;
  linkCount: number;
  /** One-based page numbers, because this value is shown to a person. */
  pagesWithoutText: number[];
  warnings: ExtractionWarning[];
};

export type ExtractedDocument = {
  sourceName: string;
  scope: ExtractionScope;
  pages: ExtractedPage[];
  warnings: ExtractionWarning[];
};

function invalidSelection(detail: string): ProcessingError {
  return new ProcessingError('INVALID_SELECTION', detail);
}

/**
 * Expands a scope into the zero-based page indexes to process, and is the only
 * place a range is validated. A range is inclusive at `startIndex` and
 * exclusive at `endIndexExclusive`, so an empty range is always a mistake
 * rather than a silently empty export.
 *
 * @param totalPages page count of the source document.
 */
export function pageIndicesForScope(scope: ExtractionScope, totalPages: number): number[] {
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    throw invalidSelection(`document has no pages to convert (${totalPages})`);
  }

  if (scope.mode === 'all') {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const { startIndex, endIndexExclusive } = scope;

  if (!Number.isInteger(startIndex) || !Number.isInteger(endIndexExclusive)) {
    throw invalidSelection(`range bounds must be whole numbers (${startIndex}, ${endIndexExclusive})`);
  }
  if (startIndex < 0) {
    throw invalidSelection(`range starts before the first page (${startIndex})`);
  }
  if (endIndexExclusive > totalPages) {
    throw invalidSelection(`range ends past the last page (${endIndexExclusive} > ${totalPages})`);
  }
  if (endIndexExclusive <= startIndex) {
    throw invalidSelection(`range selects no pages (${startIndex}, ${endIndexExclusive})`);
  }

  return Array.from({ length: endIndexExclusive - startIndex }, (_, offset) => startIndex + offset);
}

function countLinksInRuns(runs: InlineRun[]): number {
  return runs.reduce((total, run) => (run.href ? total + 1 : total), 0);
}

/**
 * Pure traversal of the block union, used for the analysis report shown before
 * a download. Warnings are passed through rather than re-derived, so the one
 * component that observed a condition stays the one that reports it.
 */
export function summarizeDocument(document: ExtractedDocument): ExtractionReport {
  const report: ExtractionReport = {
    processedPages: document.pages.length,
    headingCount: 0,
    paragraphCount: 0,
    listCount: 0,
    tableCount: 0,
    linkCount: 0,
    pagesWithoutText: [],
    warnings: document.warnings,
  };

  for (const page of document.pages) {
    if (!page.hasExtractableText) {
      report.pagesWithoutText.push(page.sourcePageIndex + 1);
    }

    for (const block of page.blocks) {
      switch (block.kind) {
        case 'heading':
          report.headingCount += 1;
          report.linkCount += countLinksInRuns(block.runs);
          break;
        case 'paragraph':
          report.paragraphCount += 1;
          report.linkCount += countLinksInRuns(block.runs);
          break;
        case 'list':
          report.listCount += 1;
          for (const item of block.items) report.linkCount += countLinksInRuns(item);
          break;
        case 'table':
          report.tableCount += 1;
          for (const row of block.rows) {
            for (const cell of row) report.linkCount += countLinksInRuns(cell);
          }
          break;
      }
    }
  }

  return report;
}
