/**
 * Serializes an extracted document to GitHub-flavored Markdown.
 *
 * Pure and deterministic: the same model always produces the same bytes, so
 * the output can be asserted exactly rather than approximately. Nothing is
 * invented — no title from the filename, no header row a table did not have —
 * because a Markdown file is read as the document itself, not as a report
 * about one.
 */

import type { DocumentBlock, ExtractedDocument, InlineRun } from './documentModel';
import { isSafeHref } from './layoutAnalyzer';

/**
 * Characters that change meaning anywhere in a line: emphasis, code, links,
 * table cells, and inline HTML. Deliberately narrow — escaping every `.` and
 * `-` would leave prose unreadable to the person editing the file, and neither
 * can start anything except at the beginning of a line, which is handled
 * separately.
 */
const INLINE_SYNTAX = /([\\`*_[\]|<])/g;

/** Constructs that only take effect at the start of a line. */
const LINE_START_SYNTAX = /^(\s*)([#>+-]|\d{1,9}[.)])(\s)/;

/**
 * Escapes syntax without altering the words themselves: every replacement is a
 * backslash in front of an existing character, so Unicode content passes
 * through untouched.
 */
function escapeText(text: string): string {
  // A run holds one line of prose; a stray newline would split the block it
  // belongs to, so it collapses to a space before anything else happens.
  return text.replace(/\r\n|\r|\n/g, ' ').replace(INLINE_SYNTAX, '\\$1');
}

/** Stops body text that begins like a heading, quote, or list from becoming one. */
function escapeLineStart(text: string): string {
  return text.replace(LINE_START_SYNTAX, (_match, space: string, marker: string, trailing: string) =>
    `${space}\\${marker}${trailing}`,
  );
}

/**
 * Wraps a URL in angle brackets when it contains characters that would end the
 * link target early.
 */
function serializeHref(href: string): string {
  return /[()\s<>]/.test(href) ? `<${href}>` : href;
}

/**
 * Applies emphasis to the trimmed core of a run.
 *
 * A space inside the markers is not cosmetic: `**bold **` is not emphasis at
 * all in GFM, so the surrounding whitespace has to stay outside them.
 */
function emphasise(text: string, run: InlineRun): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  const [, leading = '', core = '', trailing = ''] = match ?? [];
  if (!core) return text;

  const marker = run.bold && run.italic ? '***' : run.bold ? '**' : run.italic ? '*' : '';
  return `${leading}${marker}${core}${marker}${trailing}`;
}

/**
 * @param emphasis whether emphasis markers are worth writing. A heading and a
 * GFM header row are already rendered bold, so repeating the markers there adds
 * nothing but clutter to the file someone will edit.
 */
function serializeRun(run: InlineRun, emphasis: boolean): string {
  const escaped = escapeText(run.text);
  const styled = emphasis ? emphasise(escaped, run) : escaped;
  // Extraction already drops unsafe schemes. The check is repeated here because
  // this is the last point before a target is written into a file that will be
  // opened somewhere else entirely.
  return isSafeHref(run.href) ? `[${styled}](${serializeHref(run.href!)})` : styled;
}

function serializeRuns(runs: InlineRun[], emphasis = true): string {
  return runs.map((run) => serializeRun(run, emphasis)).join('');
}

function serializeTable(rows: InlineRun[][][]): string {
  const columns = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  if (columns === 0) return '';

  const line = (cells: InlineRun[][], emphasis = true) => {
    const padded = Array.from({ length: columns }, (_, index) =>
      serializeRuns(cells[index] ?? [], emphasis),
    );
    return `| ${padded.join(' | ')} |`;
  };

  // The first row becomes the header because GFM has no headerless table. The
  // model does not claim to know which row is a header, and this is the one
  // place that limitation shows.
  const [header, ...body] = rows;
  const separator = `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;

  return [line(header, false), separator, ...body.map((row) => line(row))].join('\n');
}

function serializeBlock(block: DocumentBlock): string {
  switch (block.kind) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${serializeRuns(block.runs, false)}`;
    case 'paragraph':
      return escapeLineStart(serializeRuns(block.runs));
    case 'list':
      return block.items
        .map((item, index) => {
          const text = escapeLineStart(serializeRuns(item));
          return block.ordered ? `${index + 1}. ${text}` : `- ${text}`;
        })
        .join('\n');
    case 'table':
      return serializeTable(block.rows);
  }
}

/**
 * Encodes the document as UTF-8 Markdown.
 *
 * Page boundaries survive as HTML comments, which every Markdown renderer
 * ignores and every text editor shows, so a person can still tell which source
 * page text came from.
 */
export function exportMarkdown(document: ExtractedDocument): Uint8Array {
  const pages = document.pages.map((page) => {
    const marker = `<!-- Page ${String(page.sourcePageIndex + 1)} -->`;
    const body = page.blocks
      .map(serializeBlock)
      .filter((text) => text.length > 0)
      .join('\n\n');
    return body ? `${marker}\n\n${body}` : marker;
  });

  return new TextEncoder().encode(`${pages.join('\n\n')}\n`);
}
