import React, { useState } from 'react';
import { FileCode2, FileType2, Package, RotateCcw, Search } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { PdfSource } from '../../engine/types';
import {
  summarizeDocument,
  type ExtractedDocument,
  type ExtractionReport,
  type ExtractionScope,
} from '../../engine/documentModel';
import { extractPdfDocument } from '../../engine/pdfTextExtractor';
import { exportMarkdown } from '../../engine/markdownExporter';
import { exportDocx } from '../../engine/docxExporter';
import { documentOutputNames } from '../../engine/naming';
import { deliverOutputs, downloadFile, ZipEntry } from '../../engine/download';
import { getPdfPageCount } from '../../engine/pdfRenderer';
import {
  assertValidPdfBytes,
  formatFileSize,
  readFileAsUint8Array,
  urlTracker,
} from '../../engine/validation';
import { ProcessingError, toUserMessage } from '../../engine/errors';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MARKDOWN_MIME = 'text/markdown;charset=utf-8';

/**
 * The asynchronous lifecycle, named rather than inferred from a set of
 * booleans: which controls are usable depends on what is running, and one
 * value makes that decidable in one place.
 */
type AnalysisStatus = 'idle' | 'loading' | 'analyzing' | 'exporting' | 'ready';

/** The analysis a download is generated from, kept whole so it can be reused. */
type Analysis = {
  document: ExtractedDocument;
  report: ExtractionReport;
  scope: ExtractionScope;
};

/**
 * Converts one text-based PDF into editable Word and Markdown files.
 *
 * The panel analyzes once and serializes from the cached model, so choosing
 * both formats never re-reads the PDF. It owns its own file, range, and
 * asynchronous state — including its reset control — because the surrounding
 * Convert workspace cannot know when an analysis is in flight here.
 *
 * Page numbers are one-based in every control and message on screen, and are
 * converted to engine indexes at the single point where a scope is built.
 */
export const PdfDocumentConversionPanel: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scopeMode, setScopeMode] = useState<'all' | 'range'>('all');
  const [startPage, setStartPage] = useState('1');
  const [endPage, setEndPage] = useState('1');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const busy = status === 'loading' || status === 'analyzing' || status === 'exporting';

  /**
   * Validates the one-based range as typed. Returns the message to show, so an
   * unusable range explains itself instead of only disabling a button.
   */
  const rangeError = (): string | null => {
    if (scopeMode === 'all') return null;

    const start = Number(startPage);
    const end = Number(endPage);

    if (!Number.isInteger(start) || !Number.isInteger(end) || startPage === '' || endPage === '') {
      return 'Enter whole page numbers for the start and end of the range.';
    }
    if (start < 1) return 'The first page is page 1, so the range cannot start lower.';
    if (end > pageCount) {
      return `This document only has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`;
    }
    if (end < start) return 'The end page cannot come before the start page.';
    return null;
  };

  const invalidRangeMessage = rangeError();

  /** The single crossing from one-based page numbers to engine indexes. */
  const currentScope = (): ExtractionScope =>
    scopeMode === 'all'
      ? { mode: 'all' }
      : { mode: 'range', startIndex: Number(startPage) - 1, endIndexExclusive: Number(endPage) };

  /** Any change to the selection makes the previous report describe the wrong pages. */
  const invalidateAnalysis = () => {
    setAnalysis(null);
    setSuccess(null);
  };

  const handleFileSelected = async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setStatus('loading');
    setError(null);
    setSuccess(null);
    setAnalysis(null);
    setProgress(20);
    setProgressMessage(`Reading "${file.name}"...`);

    try {
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);

      const next: PdfSource = { id: `${file.name}-${Date.now()}`, name: file.name, bytes };
      const pages = await getPdfPageCount(next);
      if (pages < 1) {
        throw new ProcessingError('NO_PAGES', 'document reports no pages', { fileName: file.name });
      }

      setSource(next);
      setPageCount(pages);
      setScopeMode('all');
      setStartPage('1');
      setEndPage(String(pages));
      setProgress(100);
      setStatus('ready');
    } catch (caught) {
      // Nothing is kept from a file that could not be opened; the dropzone
      // stays so the next attempt is one action away.
      setError(toUserMessage(caught));
      setProgress(0);
      setProgressMessage('');
      setStatus('idle');
    }
  };

  const handleAnalyze = async () => {
    if (!source || invalidRangeMessage) return;

    const scope = currentScope();
    setStatus('analyzing');
    setError(null);
    setSuccess(null);
    setAnalysis(null);
    setProgress(5);
    setProgressMessage('Reading the text layer...');

    try {
      const document = await extractPdfDocument(source, scope, (completed, total) => {
        setProgress(Math.round((completed / total) * 100));
        setProgressMessage(`Analyzed page ${completed} of ${total}...`);
      });

      setAnalysis({ document, report: summarizeDocument(document), scope });
      setProgress(100);
      setProgressMessage('Analysis complete.');
    } catch (caught) {
      // Recoverable: the file, the page mode, and the typed range all survive,
      // which is what makes a scanned document a message rather than a dead end.
      setError(toUserMessage(caught));
      setProgress(0);
      setProgressMessage('');
    } finally {
      setStatus('ready');
    }
  };

  /** Runs one export path, keeping the analysis intact when it fails. */
  const runExport = async (label: string, action: () => Promise<string>) => {
    if (!analysis) return;

    setStatus('exporting');
    setError(null);
    setSuccess(null);
    setProgress(35);
    setProgressMessage(`Generating ${label}...`);

    try {
      const name = await action();
      setProgress(100);
      setSuccess(`Downloaded "${name}".`);
    } catch (caught) {
      setError(toUserMessage(caught));
      setProgress(0);
      setProgressMessage('');
    } finally {
      setStatus('ready');
    }
  };

  const outputNames = () => documentOutputNames(source!.name, analysis!.scope);

  const handleDownloadWord = () =>
    runExport('the Word document', async () => {
      const names = outputNames();
      downloadFile(await exportDocx(analysis!.document), names.docx, DOCX_MIME);
      return names.docx;
    });

  const handleDownloadMarkdown = () =>
    runExport('the Markdown file', async () => {
      const names = outputNames();
      downloadFile(exportMarkdown(analysis!.document), names.markdown, MARKDOWN_MIME);
      return names.markdown;
    });

  const handleDownloadBoth = () =>
    runExport('both files', async () => {
      const names = outputNames();
      const entries: ZipEntry[] = [
        { name: names.docx, data: await exportDocx(analysis!.document) },
        { name: names.markdown, data: exportMarkdown(analysis!.document) },
      ];
      const plan = await deliverOutputs(entries, names.zip);
      return plan.name;
    });

  const reset = () => {
    setSource(null);
    setPageCount(0);
    setScopeMode('all');
    setStartPage('1');
    setEndPage('1');
    setAnalysis(null);
    setStatus('idle');
    setProgress(0);
    setProgressMessage('');
    setError(null);
    setSuccess(null);
    setShowResetModal(false);
    urlTracker.revokeAll();
  };

  const report = analysis?.report;
  const emptyPages = report?.pagesWithoutText ?? [];

  return (
    <div className="doc-convert-pane">
      <div className="doc-notices">
        <p>
          The PDF is converted in this browser tab. No page, filename, or byte of the document is
          uploaded anywhere.
        </p>
        <p>
          Figures, page images, and equations are omitted; only text and the structure around it is
          converted.
        </p>
        <p>
          The result is editable text in reading order, not a layout-identical copy of the original
          page.
        </p>
        <p>A scanned PDF has no text layer to read, and needs OCR, which this tool does not do.</p>
      </div>

      {!source ? (
        <Dropzone
          onFilesSelected={handleFileSelected}
          accept=".pdf,application/pdf"
          multiple={false}
          title="Drop a text-based PDF here or click to browse"
          subtitle="Converted to editable Word (DOCX) and Markdown in this tab"
          disabled={busy}
        />
      ) : (
        <section className="doc-panel glass-panel" aria-labelledby="doc-convert-settings">
          <div className="doc-row">
            <div className="doc-identity">
              <strong>{source.name}</strong>
              <span>
                {pageCount} {pageCount === 1 ? 'page' : 'pages'} • {formatFileSize(source.bytes.length)}
              </span>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowResetModal(true)}
              disabled={busy}
            >
              <RotateCcw size={16} />
              <span>Reset</span>
            </button>
          </div>

          <h3 id="doc-convert-settings" className="doc-section-title">
            Pages to convert
          </h3>

          <div className="segmented" role="radiogroup" aria-label="Pages to convert">
            <button
              type="button"
              role="radio"
              aria-checked={scopeMode === 'all'}
              className={scopeMode === 'all' ? 'active' : ''}
              onClick={() => {
                setScopeMode('all');
                invalidateAnalysis();
              }}
              disabled={busy}
            >
              Whole PDF
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scopeMode === 'range'}
              className={scopeMode === 'range' ? 'active' : ''}
              onClick={() => {
                setScopeMode('range');
                invalidateAnalysis();
              }}
              disabled={busy}
            >
              Page range
            </button>
          </div>

          {scopeMode === 'range' && (
            <div className="doc-range">
              <label className="field-label" htmlFor="doc-range-start">
                Start page
                <input
                  id="doc-range-start"
                  type="number"
                  min={1}
                  max={pageCount}
                  step={1}
                  value={startPage}
                  onChange={(event) => {
                    setStartPage(event.target.value);
                    invalidateAnalysis();
                  }}
                  disabled={busy}
                />
              </label>

              <label className="field-label" htmlFor="doc-range-end">
                End page
                <input
                  id="doc-range-end"
                  type="number"
                  min={1}
                  max={pageCount}
                  step={1}
                  value={endPage}
                  onChange={(event) => {
                    setEndPage(event.target.value);
                    invalidateAnalysis();
                  }}
                  disabled={busy}
                />
              </label>

              <p className="doc-range-hint">
                Both page numbers are included in the output.
              </p>
            </div>
          )}

          {invalidRangeMessage && (
            <p className="doc-range-error" role="status">
              {invalidRangeMessage}
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary btn-lg doc-action"
            onClick={handleAnalyze}
            disabled={busy || invalidRangeMessage !== null}
          >
            <Search size={18} />
            <span>Analyze document</span>
          </button>

          {report && (
            <div className="doc-report">
              <h3 className="doc-section-title">What was found</h3>

              <table className="doc-report-table" aria-label="Analysis summary">
                <tbody>
                  <tr>
                    <th scope="row">Pages</th>
                    <td>{report.processedPages}</td>
                  </tr>
                  <tr>
                    <th scope="row">Headings</th>
                    <td>{report.headingCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Paragraphs</th>
                    <td>{report.paragraphCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Lists</th>
                    <td>{report.listCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Tables</th>
                    <td>{report.tableCount}</td>
                  </tr>
                  <tr>
                    <th scope="row">Links</th>
                    <td>{report.linkCount}</td>
                  </tr>
                </tbody>
              </table>

              {emptyPages.length > 0 && (
                <p className="doc-empty-pages">
                  No extractable text on {emptyPages.length === 1 ? 'page' : 'pages'}{' '}
                  {emptyPages.join(', ')}. Those pages are exported empty.
                </p>
              )}

              <div className="doc-downloads">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDownloadWord}
                  disabled={busy}
                >
                  <FileType2 size={16} />
                  <span>Download Word</span>
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDownloadMarkdown}
                  disabled={busy}
                >
                  <FileCode2 size={16} />
                  <span>Download Markdown</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadBoth}
                  disabled={busy}
                >
                  <Package size={16} />
                  <span>Download Both</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {busy && <ProgressBar percentage={progress} message={progressMessage} />}

      {error && (
        <StatusAlert
          type="error"
          title="Conversion error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {success && (
        <StatusAlert
          type="success"
          title="Conversion complete"
          message={success}
          onDismiss={() => setSuccess(null)}
        />
      )}

      <Modal
        isOpen={showResetModal}
        title="Discard this document?"
        description="The selected PDF, the page range, and the analysis will be cleared."
        confirmLabel="Clear"
        cancelLabel="Keep Document"
        isDestructive={true}
        onConfirm={reset}
        onCancel={() => setShowResetModal(false)}
      />

      <style>{`
        .doc-convert-pane{display:flex;flex-direction:column;gap:1.25rem}
        .doc-notices{display:flex;flex-direction:column;gap:.35rem;font-size:.85rem;color:var(--text-muted)}
        .doc-panel{padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem}
        .doc-row{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border-subtle)}
        .doc-identity{display:flex;flex-direction:column;gap:.2rem}
        .doc-identity strong{font-size:1.1rem}
        .doc-identity span{font-size:.85rem;color:var(--text-muted)}
        .doc-section-title{font-size:1.05rem;font-weight:700}
        .segmented{display:flex;gap:.5rem;flex-wrap:wrap}
        .segmented button{padding:.65rem 1rem;border:1px solid var(--border-medium);border-radius:var(--radius-md);color:var(--text-secondary)}
        .segmented button.active{background:rgba(245,158,11,.25);border-color:var(--accent-amber, #f59e0b);color:#fff}
        .doc-range{display:flex;align-items:flex-start;flex-wrap:wrap;gap:1rem}
        .field-label{display:flex;flex-direction:column;gap:.45rem;font-weight:600;font-size:.85rem}
        .field-label input{background:rgba(15,23,42,.8);color:var(--text-primary);border:1px solid var(--border-medium);border-radius:var(--radius-md);padding:.6rem;width:8rem;font-size:.95rem}
        .doc-range-hint{font-size:.8rem;color:var(--text-muted);align-self:flex-end;padding-bottom:.7rem}
        .doc-range-error{font-size:.85rem;color:#fda4af;font-weight:600}
        .doc-action{align-self:flex-start}
        .doc-report{display:flex;flex-direction:column;gap:1rem;padding-top:1.25rem;border-top:1px solid var(--border-subtle)}
        .doc-report-table{border-collapse:collapse;font-size:.9rem;max-width:22rem;width:100%}
        .doc-report-table th{text-align:left;font-weight:600;color:var(--text-secondary);padding:.3rem .75rem .3rem 0}
        .doc-report-table td{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}
        .doc-empty-pages{font-size:.85rem;color:var(--text-muted)}
        .doc-downloads{display:flex;flex-wrap:wrap;gap:.75rem}
        @media(max-width:640px){.doc-action,.doc-downloads button{width:100%}.doc-range{flex-direction:column}.field-label input{width:100%}}
      `}</style>
    </div>
  );
};
