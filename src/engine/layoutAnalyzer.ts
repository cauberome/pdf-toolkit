/**
 * Reconstructs editable structure from positioned PDF text.
 *
 * A PDF stores glyphs at coordinates, not paragraphs, so structure has to be
 * inferred. Every rule here is deterministic and geometric, and every rule is
 * biased the same way: when a structure is not clearly present, the text comes
 * out as a paragraph. Inventing a table or a heading level costs a person more
 * work to undo than a missed one costs to add.
 *
 * The module deliberately knows nothing about React or pdf.js. It takes plain
 * numbers and returns plain blocks, which is what makes each rule testable
 * without a PDF.
 */

import type { DocumentBlock, InlineRun } from './documentModel';

export type PositionedToken = {
  text: string;
  /** Left edge in PDF user space. */
  x: number;
  /** Baseline in PDF user space, increasing upward. */
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  direction: 'ltr' | 'rtl' | 'ttb';
  bold: boolean;
  italic: boolean;
  hasEOL: boolean;
  href?: string;
};

export type PageLayoutInput = {
  pageWidth: number;
  pageHeight: number;
  tokens: PositionedToken[];
  /** Structure-tree roles for the page, in document order (`H1`, `P`, ...). */
  structureRoles: string[];
};

// --- Tuning constants -------------------------------------------------------
// Named and exported so a test can state the rule it is exercising rather than
// repeating a magic number.

/** Baseline spread, as a share of median token height, still counted as one line. */
export const LINE_BASELINE_TOLERANCE_RATIO = 0.35;
/** Word-gap threshold, as a share of font size, above which a space is inferred. */
export const WORD_GAP_RATIO = 0.25;
/** Minimum column-separator width, as a share of page width. */
export const COLUMN_GAP_MIN_WIDTH_RATIO = 0.08;
/** Minimum uninterrupted height of a column separator, as a share of text height. */
export const COLUMN_GAP_MIN_HEIGHT_RATIO = 0.5;
/** Minimum width of each detected column, as a share of page width. */
export const COLUMN_MIN_WIDTH_RATIO = 0.15;
/** Font size above the body size, as a ratio, that marks a heading. */
export const HEADING_SIZE_RATIO = 1.15;
/** Only three heading levels are ever produced. */
export const MAX_HEADING_LEVEL = 3;
/** Line spacing, as a multiple of font size, above which a paragraph ends. */
export const PARAGRAPH_BREAK_RATIO = 1.6;
/** Gap inside a line, as a share of page width, that separates table cells. */
export const TABLE_CELL_GAP_RATIO = 0.035;
/** Horizontal tolerance for a shared column anchor, as a share of page width. */
export const TABLE_ANCHOR_TOLERANCE_RATIO = 0.02;
export const TABLE_MIN_ROWS = 3;
export const TABLE_MIN_COLUMNS = 2;
/** Left-edge tolerance for "stable indentation", as a share of page width. */
export const LIST_INDENT_TOLERANCE_RATIO = 0.02;

const SAFE_LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

const UNORDERED_MARKER = /^([•▪◦‣·∙●○*+-])\s+(\S.*)$/u;
const ORDERED_MARKER = /^(\d{1,3}|[A-Za-z]|[ivxlcIVXLC]{1,5})[.)]\s+(\S.*)$/;

/**
 * Only these schemes ever reach a document. Anything else keeps its visible
 * text and loses the target, because an exported file is opened later, outside
 * this tool, where a `javascript:` or `file:` target is someone else's problem.
 */
export function isSafeHref(href: string | undefined): boolean {
  if (!href) return false;
  try {
    return SAFE_LINK_SCHEMES.has(new URL(href).protocol);
  } catch {
    return false;
  }
}

// --- Internal shapes --------------------------------------------------------

type Style = { bold: boolean; italic: boolean; href?: string };

type NormalizedToken = {
  text: string;
  spaceBefore: boolean;
  spaceAfter: boolean;
  left: number;
  right: number;
  baseline: number;
  top: number;
  fontSize: number;
  direction: PositionedToken['direction'];
  style: Style;
  hasEOL: boolean;
};

type Line = {
  tokens: NormalizedToken[];
  runs: InlineRun[];
  text: string;
  baseline: number;
  top: number;
  left: number;
  right: number;
  fontSize: number;
};

type Cell = { left: number; runs: InlineRun[] };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function normalizeTokens(tokens: PositionedToken[]): NormalizedToken[] {
  const normalized: NormalizedToken[] = [];

  for (const token of tokens) {
    const raw = token.text ?? '';
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const fontSize = token.fontSize > 0 ? token.fontSize : token.height;
    normalized.push({
      text,
      // A token whose own text carried an edge space keeps that space even when
      // the glyph advance leaves no measurable gap.
      spaceBefore: /^\s/.test(raw),
      spaceAfter: /\s$/.test(raw),
      left: token.x,
      right: token.x + Math.max(token.width, 0),
      baseline: token.y,
      top: token.y + Math.max(token.height, fontSize),
      fontSize,
      direction: token.direction,
      style: {
        bold: token.bold === true,
        italic: token.italic === true,
        href: isSafeHref(token.href) ? token.href : undefined,
      },
      hasEOL: token.hasEOL === true,
    });
  }

  return normalized;
}

function sameStyle(a: Style, b: Style): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

/** A run omits its false flags, so comparing one needs them put back. */
function styleOf(run: InlineRun): Style {
  return { bold: run.bold === true, italic: run.italic === true, href: run.href };
}

function makeRun(text: string, style: Style): InlineRun {
  const run: InlineRun = { text };
  if (style.bold) run.bold = true;
  if (style.italic) run.italic = true;
  if (style.href) run.href = style.href;
  return run;
}

function isPlain(run: InlineRun): boolean {
  return !run.bold && !run.italic && !run.href;
}

function isPlainStyle(style: Style): boolean {
  return !style.bold && !style.italic && !style.href;
}

/**
 * Attaches a separator to whichever side is unstyled. A space trapped inside a
 * bold or linked run is both wrong to read and, in Markdown, enough to stop
 * `**bold**` from rendering at all.
 */
function joinRuns(left: InlineRun[], right: InlineRun[], separator: string): InlineRun[] {
  if (left.length === 0) return [...right];
  if (right.length === 0) return [...left];

  const merged = left.map((run) => ({ ...run }));
  const tail = merged[merged.length - 1];
  const incoming = right.map((run) => ({ ...run }));

  if (separator) {
    if (isPlain(tail)) tail.text += separator;
    else if (isPlain(incoming[0])) incoming[0].text = separator + incoming[0].text;
    else tail.text += separator;
  }

  const head = incoming[0];
  if (!sameStyle(styleOf(tail), styleOf(head))) return [...merged, ...incoming];

  tail.text += head.text;
  return [...merged, ...incoming.slice(1)];
}

/** Builds the runs of one line, inferring spaces from glyph geometry. */
function runsForTokens(tokens: NormalizedToken[]): InlineRun[] {
  const runs: InlineRun[] = [];

  tokens.forEach((token, index) => {
    let separator = '';
    if (index > 0) {
      const previous = tokens[index - 1];
      const gap =
        token.direction === 'rtl'
          ? previous.left - token.right
          : token.left - previous.right;
      const threshold = WORD_GAP_RATIO * Math.max(previous.fontSize, token.fontSize);
      if (previous.spaceAfter || token.spaceBefore || gap > threshold) separator = ' ';
    }

    const previousRun = runs[runs.length - 1];
    if (previousRun && sameStyle(styleOf(previousRun), token.style)) {
      previousRun.text += separator + token.text;
      return;
    }

    if (separator && previousRun) {
      // The separator goes to whichever side is unstyled, as in `joinRuns`.
      // When neither side is — two links side by side — it becomes a run of its
      // own rather than part of a link, where it would read as linked text.
      if (isPlain(previousRun)) previousRun.text += separator;
      else if (!isPlainStyle(token.style)) runs.push({ text: separator });
      else {
        runs.push(makeRun(separator + token.text, token.style));
        return;
      }
      runs.push(makeRun(token.text, token.style));
      return;
    }

    runs.push(makeRun(separator + token.text, token.style));
  });

  return runs;
}

function buildLine(tokens: NormalizedToken[]): Line {
  const rtl = tokens.filter((t) => t.direction === 'rtl').length > tokens.length / 2;
  const ordered = [...tokens].sort((a, b) => (rtl ? b.left - a.left : a.left - b.left));
  const runs = runsForTokens(ordered);

  // The dominant size is the one most characters are set in, so a superscript
  // or a drop cap cannot turn a body line into a heading.
  const sizeWeights = new Map<number, number>();
  for (const token of ordered) {
    sizeWeights.set(token.fontSize, (sizeWeights.get(token.fontSize) ?? 0) + token.text.length);
  }
  let fontSize = ordered[0].fontSize;
  let bestWeight = -1;
  for (const [size, weight] of sizeWeights) {
    if (weight > bestWeight || (weight === bestWeight && size > fontSize)) {
      fontSize = size;
      bestWeight = weight;
    }
  }

  return {
    tokens: ordered,
    runs,
    text: runs.map((run) => run.text).join(''),
    baseline: median(ordered.map((t) => t.baseline)),
    top: Math.max(...ordered.map((t) => t.top)),
    left: Math.min(...ordered.map((t) => t.left)),
    right: Math.max(...ordered.map((t) => t.right)),
    fontSize,
  };
}

/**
 * Groups tokens into lines by baseline proximity, scaled to the page's own
 * median token height so a 6-point footnote page and a 24-point poster both
 * work.
 */
function groupLines(tokens: NormalizedToken[]): Line[] {
  if (tokens.length === 0) return [];

  const heights = tokens.map((token) => token.top - token.baseline).filter((value) => value > 0);
  const tolerance = LINE_BASELINE_TOLERANCE_RATIO * (median(heights) || 1);

  const sorted = [...tokens].sort((a, b) => b.baseline - a.baseline || a.left - b.left);
  const lines: Line[] = [];
  let current: NormalizedToken[] = [];
  let anchor = sorted[0].baseline;
  let closed = false;

  for (const token of sorted) {
    const belongs =
      current.length > 0 &&
      !closed &&
      Math.abs(token.baseline - anchor) <= tolerance &&
      token.top > Math.min(...current.map((t) => t.baseline));

    if (!belongs && current.length > 0) {
      lines.push(buildLine(current));
      current = [];
    }
    if (current.length === 0) {
      anchor = token.baseline;
      closed = false;
    }
    current.push(token);
    // pdf.js marks the token a line break follows; honouring it keeps two
    // visually adjacent lines apart when their baselines nearly coincide.
    if (token.hasEOL) closed = true;
  }

  if (current.length > 0) lines.push(buildLine(current));
  return lines;
}

// --- Columns ----------------------------------------------------------------

type Band = { start: number; end: number };

function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function occupiedWidth(tokens: NormalizedToken[]): number {
  return mergeIntervals(tokens.map((t) => [t.left, t.right] as [number, number])).reduce(
    (total, [start, end]) => total + (end - start),
    0,
  );
}

/**
 * Finds at most one column separator: a vertical whitespace band wide enough
 * to be a gutter and tall enough to be persistent, with a real column of text
 * on each side.
 *
 * Tokens wider than half the page are ignored when locating the band, because
 * a full-width title crosses every gutter; they are put back when checking that
 * the band survives vertically.
 */
function detectColumnBand(tokens: NormalizedToken[], pageWidth: number): Band | null {
  const narrow = tokens.filter((token) => token.right - token.left <= pageWidth * 0.5);
  if (narrow.length < 4) return null;

  const merged = mergeIntervals(narrow.map((t) => [t.left, t.right] as [number, number]));
  if (merged.length < 2) return null;

  const minWidth = COLUMN_GAP_MIN_WIDTH_RATIO * pageWidth;
  const candidates: Band[] = [];
  for (let index = 1; index < merged.length; index++) {
    const start = merged[index - 1][1];
    const end = merged[index][0];
    if (end - start >= minWidth) candidates.push({ start, end });
  }
  if (candidates.length === 0) return null;

  const pageTop = Math.max(...tokens.map((t) => t.top));
  const pageBottom = Math.min(...tokens.map((t) => t.baseline));
  const textHeight = pageTop - pageBottom;
  if (textHeight <= 0) return null;

  const qualifying = candidates
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .filter((band) => {
      const straddling = tokens.filter((token) => token.left < band.end && token.right > band.start);
      const blocked = mergeIntervals(
        straddling.map((token) => [token.baseline, token.top] as [number, number]),
      );

      let freeRun = 0;
      let cursor = pageBottom;
      for (const [start, end] of blocked) {
        freeRun = Math.max(freeRun, start - cursor);
        cursor = Math.max(cursor, end);
      }
      freeRun = Math.max(freeRun, pageTop - cursor);
      if (freeRun < COLUMN_GAP_MIN_HEIGHT_RATIO * textHeight) return false;

      const left = narrow.filter((token) => token.right <= band.start);
      const right = narrow.filter((token) => token.left >= band.end);
      if (left.length < 2 || right.length < 2) return false;

      const minColumnWidth = COLUMN_MIN_WIDTH_RATIO * pageWidth;
      return occupiedWidth(left) >= minColumnWidth && occupiedWidth(right) >= minColumnWidth;
    });

  return qualifying[0] ?? null;
}

/**
 * Orders lines for reading: full-width lines in place, and between them the
 * left column in full before the right column.
 */
function orderLinesWithColumns(tokens: NormalizedToken[], band: Band): Line[] {
  const full: NormalizedToken[] = [];
  const left: NormalizedToken[] = [];
  const right: NormalizedToken[] = [];

  for (const token of tokens) {
    if (token.left < band.start && token.right > band.end) full.push(token);
    else if (token.right <= band.start + (band.end - band.start) / 2) left.push(token);
    else right.push(token);
  }

  const fullLines = groupLines(full);
  const ordered: Line[] = [];
  let leftPending = left;
  let rightPending = right;

  for (const fullLine of fullLines) {
    const cut = fullLine.baseline;
    ordered.push(...groupLines(leftPending.filter((token) => token.baseline > cut)));
    ordered.push(...groupLines(rightPending.filter((token) => token.baseline > cut)));
    ordered.push(fullLine);
    leftPending = leftPending.filter((token) => token.baseline <= cut);
    rightPending = rightPending.filter((token) => token.baseline <= cut);
  }

  ordered.push(...groupLines(leftPending));
  ordered.push(...groupLines(rightPending));
  return ordered;
}

// --- Tables -----------------------------------------------------------------

/** Splits a line at gaps far wider than word spacing; those are cell borders. */
function cellsForLine(line: Line, pageWidth: number): Cell[] {
  const threshold = TABLE_CELL_GAP_RATIO * pageWidth;
  const groups: NormalizedToken[][] = [];
  let current: NormalizedToken[] = [];

  for (const token of line.tokens) {
    const previous = current[current.length - 1];
    if (previous && token.left - previous.right > threshold) {
      groups.push(current);
      current = [];
    }
    current.push(token);
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group) => ({
    left: Math.min(...group.map((token) => token.left)),
    runs: runsForTokens(group),
  }));
}

type TableRun = { start: number; end: number; anchors: number[]; rows: Cell[][] };

/**
 * Finds runs of consecutive lines that share at least two stable column
 * anchors over at least three rows. Two aligned rows are an accident; three
 * are a table.
 */
function detectTables(lines: Line[], pageWidth: number): TableRun[] {
  const tolerance = TABLE_ANCHOR_TOLERANCE_RATIO * pageWidth;
  const rowCells = lines.map((line) => cellsForLine(line, pageWidth));
  const tables: TableRun[] = [];

  let index = 0;
  while (index < lines.length) {
    if (rowCells[index].length < TABLE_MIN_COLUMNS) {
      index += 1;
      continue;
    }

    const anchors = rowCells[index].map((cell) => cell.left);
    const rows: Cell[][] = [rowCells[index]];
    let end = index + 1;

    while (end < lines.length && rowCells[end].length >= TABLE_MIN_COLUMNS) {
      const matched = rowCells[end].filter((cell) =>
        anchors.some((anchor) => Math.abs(anchor - cell.left) <= tolerance),
      );
      if (matched.length < TABLE_MIN_COLUMNS || matched.length !== rowCells[end].length) break;
      rows.push(rowCells[end]);
      end += 1;
    }

    if (rows.length >= TABLE_MIN_ROWS) {
      tables.push({ start: index, end, anchors, rows });
      index = end;
    } else {
      index += 1;
    }
  }

  return tables;
}

function tableBlock(table: TableRun, tolerance: number): DocumentBlock {
  const rows = table.rows.map((cells) => {
    const row: InlineRun[][] = table.anchors.map(() => []);
    for (const cell of cells) {
      let target = 0;
      let best = Number.POSITIVE_INFINITY;
      table.anchors.forEach((anchor, position) => {
        const distance = Math.abs(anchor - cell.left);
        if (distance < best) {
          best = distance;
          target = position;
        }
      });
      row[target] = best <= tolerance ? cell.runs : row[target];
    }
    return row;
  });

  return { kind: 'table', rows };
}

// --- Blocks -----------------------------------------------------------------

/**
 * The size most characters on the page are set in, bucketed to a half point so
 * near-identical sizes count together.
 *
 * The mode is used rather than the median because a page can be mostly
 * headings — a chapter opener, a table of contents — and a median would then
 * call the headings "body" and flatten the page. Ties go to the smaller size,
 * which errs towards paragraphs.
 */
function bodyFontSize(lines: Line[]): number {
  const weights = new Map<number, number>();
  for (const line of lines) {
    const bucket = Math.round(line.fontSize * 2) / 2;
    weights.set(bucket, (weights.get(bucket) ?? 0) + Math.max(1, line.text.length));
  }

  let body = 11;
  let bestWeight = -1;
  for (const [size, weight] of [...weights.entries()].sort((a, b) => a[0] - b[0])) {
    if (weight > bestWeight) {
      body = size;
      bestWeight = weight;
    }
  }
  return body;
}

type Marker = { ordered: boolean; text: string };

function markerFor(line: Line): Marker | null {
  const unordered = UNORDERED_MARKER.exec(line.text);
  if (unordered) return { ordered: false, text: unordered[2] };
  const ordered = ORDERED_MARKER.exec(line.text);
  if (ordered) return { ordered: true, text: ordered[2] };
  return null;
}

/** Re-runs the line's runs with the marker glyphs removed from the first run. */
function runsWithoutMarker(line: Line, marker: Marker): InlineRun[] {
  const runs = line.runs.map((run) => ({ ...run }));
  let remaining = line.text.length - marker.text.length;

  while (remaining > 0 && runs.length > 0) {
    const consumed = Math.min(remaining, runs[0].text.length);
    runs[0].text = runs[0].text.slice(consumed);
    remaining -= consumed;
    if (runs[0].text.length === 0) runs.shift();
  }

  return runs.length > 0 ? runs : [{ text: marker.text }];
}

function headingLevels(headingSizes: number[], structureRoles: string[]): Map<number, 1 | 2 | 3> {
  const distinct = [...new Set(headingSizes)].sort((a, b) => b - a);
  const levels = new Map<number, 1 | 2 | 3>();

  // A tagged document already states its heading levels. Trust them only when
  // there is exactly one role per detected heading, which is the case where
  // the mapping is unambiguous.
  const roleLevels = structureRoles
    .map((role) => /^H([1-6])$/.exec(role.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Math.min(Number(match[1]), MAX_HEADING_LEVEL) as 1 | 2 | 3);

  if (roleLevels.length === headingSizes.length && roleLevels.length > 0) {
    headingSizes.forEach((size, index) => {
      if (!levels.has(size)) levels.set(size, roleLevels[index]);
    });
    return levels;
  }

  distinct.forEach((size, index) => {
    levels.set(size, (Math.min(index + 1, MAX_HEADING_LEVEL) as 1 | 2 | 3));
  });
  return levels;
}

/**
 * Decides how two consecutive body lines join: a soft hyphen disappears, a
 * dash stays attached, and anything else takes a space.
 */
function joinSeparatorFor(previous: string, next: string): { separator: string; trim: boolean } {
  if (/-$/.test(previous) && /^[a-zà-öø-ÿ]/.test(next)) return { separator: '', trim: true };
  if (/[—–]$/.test(previous)) return { separator: '', trim: false };
  return { separator: ' ', trim: false };
}

function mergeParagraphLines(lines: Line[]): InlineRun[] {
  let runs: InlineRun[] = [];
  let text = '';

  for (const line of lines) {
    if (runs.length === 0) {
      runs = line.runs.map((run) => ({ ...run }));
      text = line.text;
      continue;
    }

    const { separator, trim } = joinSeparatorFor(text, line.text);
    if (trim) {
      const tail = runs[runs.length - 1];
      tail.text = tail.text.replace(/-$/, '');
      text = text.replace(/-$/, '');
    }
    runs = joinRuns(runs, line.runs, separator);
    text += separator + line.text;
  }

  return runs;
}

function paragraphContinues(previous: Line, next: Line): boolean {
  const spacing = previous.baseline - next.baseline;
  const limit = PARAGRAPH_BREAK_RATIO * Math.max(previous.fontSize, next.fontSize);
  return spacing > 0 && spacing <= limit;
}

/**
 * Turns positioned tokens into a page's blocks.
 *
 * Rules run in a fixed order: normalise, group lines, find columns, then read
 * tables, headings, lists, and paragraphs out of the ordered lines.
 */
export function analyzePageLayout(input: PageLayoutInput): DocumentBlock[] {
  const tokens = normalizeTokens(input.tokens);
  if (tokens.length === 0) return [];

  const pageWidth = input.pageWidth > 0 ? input.pageWidth : 612;
  const singleColumn = groupLines(tokens);
  const anchorTolerance = TABLE_ANCHOR_TOLERANCE_RATIO * pageWidth;

  // A table's columns look exactly like page columns from a distance. The
  // stricter pattern wins: if the page reads as a table, it is not split.
  let tables = detectTables(singleColumn, pageWidth);
  let lines = singleColumn;

  if (tables.length === 0) {
    const band = detectColumnBand(tokens, pageWidth);
    if (band) {
      lines = orderLinesWithColumns(tokens, band);
      tables = detectTables(lines, pageWidth);
    }
  }

  const tableAt = new Map(tables.map((table) => [table.start, table]));
  const body = bodyFontSize(lines);
  const headingSizes = lines
    .filter((line, index) => !tableAt.has(index) && line.fontSize >= body * HEADING_SIZE_RATIO)
    .map((line) => line.fontSize);
  const levels = headingLevels(headingSizes, input.structureRoles);

  const blocks: DocumentBlock[] = [];
  const listTolerance = LIST_INDENT_TOLERANCE_RATIO * pageWidth;
  let index = 0;

  while (index < lines.length) {
    const table = tableAt.get(index);
    if (table) {
      blocks.push(tableBlock(table, anchorTolerance));
      index = table.end;
      continue;
    }

    const line = lines[index];
    const marker = markerFor(line);

    if (!marker && line.fontSize >= body * HEADING_SIZE_RATIO) {
      blocks.push({ kind: 'heading', level: levels.get(line.fontSize) ?? 1, runs: line.runs });
      index += 1;
      continue;
    }

    if (marker) {
      const items: InlineRun[][] = [];
      let cursor = index;

      while (cursor < lines.length && !tableAt.has(cursor)) {
        const candidate = lines[cursor];
        const candidateMarker = markerFor(candidate);
        if (
          candidateMarker &&
          candidateMarker.ordered === marker.ordered &&
          Math.abs(candidate.left - line.left) <= listTolerance
        ) {
          items.push(runsWithoutMarker(candidate, candidateMarker));
          cursor += 1;
          continue;
        }

        // A line indented past the marker and tight against the item above is
        // that item wrapping, not a new block.
        const previous = lines[cursor - 1];
        if (
          !candidateMarker &&
          items.length > 0 &&
          candidate.left > line.left + listTolerance &&
          paragraphContinues(previous, candidate)
        ) {
          items[items.length - 1] = joinRuns(items[items.length - 1], candidate.runs, ' ');
          cursor += 1;
          continue;
        }
        break;
      }

      // A single lettered marker is more often a name or an initial than a
      // list, so it needs company before it counts.
      const alphabetic = /^[A-Za-z][.)]/.test(line.text);
      if (items.length > 1 || (items.length === 1 && !alphabetic)) {
        blocks.push({ kind: 'list', ordered: marker.ordered, items });
        index = cursor;
        continue;
      }
    }

    const paragraph: Line[] = [line];
    let cursor = index + 1;
    while (
      cursor < lines.length &&
      !tableAt.has(cursor) &&
      !markerFor(lines[cursor]) &&
      lines[cursor].fontSize < body * HEADING_SIZE_RATIO &&
      paragraphContinues(lines[cursor - 1], lines[cursor])
    ) {
      paragraph.push(lines[cursor]);
      cursor += 1;
    }

    blocks.push({ kind: 'paragraph', runs: mergeParagraphLines(paragraph) });
    index = cursor;
  }

  return blocks;
}
