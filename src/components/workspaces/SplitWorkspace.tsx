import React, { useState, useEffect } from 'react';
import { Scissors, Download, RotateCcw, FileText, CheckCircle, AlertCircle, FolderArchive } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { PdfSource, SplitParseResult } from '../../engine/types';
import { readFileAsUint8Array, assertValidPdfBytes, urlTracker } from '../../engine/validation';
import { getPdfPageCount } from '../../engine/pdfRenderer';
import { splitPdf } from '../../engine/pdfEngine';
import { parseSplitExpression, generateEveryPageGroups } from '../../engine/splitParser';
import { deliverOutputs, ZipEntry } from '../../engine/download';
import { splitPartFilename, splitZipFilename } from '../../engine/naming';
import { ProcessingError, toUserMessage } from '../../engine/errors';

export const SplitWorkspace: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [splitMode, setSplitMode] = useState<'every-page' | 'custom'>('every-page');
  const [customExpression, setCustomExpression] = useState<string>('');
  const [parseResult, setParseResult] = useState<SplitParseResult>({
    isValid: true,
    groups: [],
    userGroups: [],
  });

  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleFileSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoadingDoc(true);
    setProgressPercent(20);
    setProgressMessage(`Loading "${file.name}"...`);

    try {
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);

      const pdfSource: PdfSource = {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        bytes,
      };

      const numPages = await getPdfPageCount(pdfSource);
      if (numPages === 0) {
        throw new ProcessingError('NO_PAGES', 'document has zero pages', { fileName: file.name });
      }

      setSource(pdfSource);
      setTotalPages(numPages);

      // Default custom expression e.g. "1-2; 3-4" or similar
      if (numPages > 1) {
        const mid = Math.ceil(numPages / 2);
        setCustomExpression(`1-${mid}; ${mid + 1}-${numPages}`);
      } else {
        setCustomExpression('1');
      }

      setProgressPercent(100);
    } catch (err) {
      setErrorMessage(toUserMessage(err));
      setProgressPercent(0);
      setProgressMessage('');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Re-calculate parse result whenever expression, mode, or totalPages changes
  useEffect(() => {
    if (!source || totalPages === 0) return;

    if (splitMode === 'every-page') {
      setParseResult(generateEveryPageGroups(totalPages));
    } else {
      setParseResult(parseSplitExpression(customExpression, totalPages));
    }
  }, [source, totalPages, splitMode, customExpression]);

  const handleSplit = async () => {
    if (!source || !parseResult.isValid || parseResult.groups.length === 0) {
      setErrorMessage('Please provide a valid split configuration.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setProgressPercent(25);
    setProgressMessage(`Splitting PDF into ${parseResult.groups.length} documents...`);

    try {
      const splitBuffers = await splitPdf(source, parseResult.groups);
      setProgressPercent(80);

      const entries: ZipEntry[] = splitBuffers.map((buf, idx) => ({
        name: splitPartFilename(source.name, idx + 1, splitBuffers.length),
        data: buf,
      }));

      setProgressMessage(
        entries.length === 1
          ? 'Downloading PDF...'
          : 'Packaging documents into ZIP archive...'
      );

      // One output downloads directly; two or more are archived.
      const plan = await deliverOutputs(entries, splitZipFilename(source.name));

      setSuccessMessage(
        plan.kind === 'file'
          ? `Successfully extracted 1 file: "${plan.name}"!`
          : `Successfully split into ${entries.length} documents and downloaded "${plan.name}"!`
      );

      setProgressPercent(100);
    } catch (err) {
      // Recoverable: the document and split expression stay loaded.
      setErrorMessage(toUserMessage(err));
      setProgressPercent(0);
      setProgressMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSource(null);
    setTotalPages(0);
    setCustomExpression('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetModal(false);
    setProgressPercent(0);
    urlTracker.revokeAll();
  };

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <Scissors size={24} />
          </div>
          <div>
            <h1 className="workspace-title">Split PDF Document</h1>
            <p className="workspace-subtitle">
              Separate every page or specify custom ranges and groups.
            </p>
          </div>
        </div>

        {source && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetModal(true)}
            disabled={isProcessing || isLoadingDoc}
          >
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main Workspace content */}
      <div className="workspace-content">
        {!source ? (
          <Dropzone
            onFilesSelected={handleFileSelected}
            accept=".pdf,application/pdf"
            multiple={false}
            title="Drop a PDF file here or click to browse"
            subtitle="Select a PDF to split into separate documents"
            disabled={isLoadingDoc}
          />
        ) : (
          <div className="split-panel glass-panel">
            {/* Document Info Header */}
            <div className="split-doc-bar">
              <div className="doc-info">
                <span className="doc-name">{source.name}</span>
                <span className="doc-meta">Total Pages: {totalPages}</span>
              </div>

              {/* Mode Switcher */}
              <div className="split-mode-tabs" role="tablist" aria-label="Split Mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={splitMode === 'every-page'}
                  className={`mode-tab ${splitMode === 'every-page' ? 'active' : ''}`}
                  onClick={() => setSplitMode('every-page')}
                >
                  Split Every Page
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={splitMode === 'custom'}
                  className={`mode-tab ${splitMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setSplitMode('custom')}
                >
                  Custom Groups
                </button>
              </div>
            </div>

            {/* Custom Expression Editor (if custom mode) */}
            {splitMode === 'custom' && (
              <div className="expression-editor-section">
                <label htmlFor="split-expression-input" className="input-label">
                  Split Expression
                </label>
                <div className="input-row">
                  <input
                    id="split-expression-input"
                    type="text"
                    className={`expression-input ${!parseResult.isValid ? 'input-error' : ''}`}
                    placeholder="e.g. 1-3; 4,6; 7-9"
                    value={customExpression}
                    onChange={(e) => setCustomExpression(e.target.value)}
                    aria-invalid={!parseResult.isValid}
                    aria-describedby="expression-feedback"
                  />
                </div>

                <div id="expression-feedback" className="expression-guidance">
                  {!parseResult.isValid ? (
                    <span className="feedback-error">
                      <AlertCircle size={14} />
                      {parseResult.error}
                    </span>
                  ) : (
                    <span className="feedback-valid">
                      <CheckCircle size={14} />
                      Valid syntax: Semicolons separate output files, commas or dashes define pages (e.g. <code>1-3; 4,6; 7-9</code>).
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Planned Output Summary Cards */}
            {parseResult.isValid && parseResult.userGroups.length > 0 && (
              <div className="output-preview-section">
                <h4 className="preview-heading">
                  Planned Outputs ({parseResult.userGroups.length} {parseResult.userGroups.length === 1 ? 'file' : 'files'})
                </h4>

                <div className="output-cards-grid">
                  {parseResult.userGroups.map((group, idx) => {
                    const padded = String(idx + 1).padStart(2, '0');
                    return (
                      <div key={idx} className="output-card">
                        <div className="output-card-header">
                          <FileText size={16} className="text-cyan" />
                          <span className="output-title">Part {padded}</span>
                          <span className="output-page-count">{group.length} {group.length === 1 ? 'page' : 'pages'}</span>
                        </div>
                        <div className="output-pages-list">
                          <span>Pages: {group.join(', ')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="split-action-bar">
              <div className="download-format-badge">
                {parseResult.userGroups.length > 1 ? (
                  <>
                    <FolderArchive size={16} className="text-amber" />
                    <span>Multiple files will be packaged in a <strong>.ZIP</strong> archive</span>
                  </>
                ) : (
                  <>
                    <FileText size={16} className="text-emerald" />
                    <span>Single <strong>.PDF</strong> download</span>
                  </>
                )}
              </div>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleSplit}
                disabled={!parseResult.isValid || parseResult.userGroups.length === 0 || isProcessing}
              >
                <Download size={18} />
                <span>Extract {parseResult.userGroups.length} {parseResult.userGroups.length === 1 ? 'Document' : 'Documents'}</span>
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <StatusAlert
            type="error"
            title="Error"
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        {successMessage && (
          <StatusAlert
            type="success"
            title="Success"
            message={successMessage}
            onDismiss={() => setSuccessMessage(null)}
          />
        )}

        {(isLoadingDoc || isProcessing) && (
          <ProgressBar
            percentage={progressPercent}
            message={progressMessage}
          />
        )}
      </div>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        title="Discard document?"
        description="This will clear the current PDF document and all split settings."
        confirmLabel="Clear Document"
        cancelLabel="Keep Editing"
        isDestructive={true}
        onConfirm={handleReset}
        onCancel={() => setShowResetModal(false)}
      />

      <style>{`
        .workspace-root {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .workspace-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .workspace-title-box {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .workspace-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .workspace-title {
          font-size: 1.75rem;
          font-weight: 700;
        }
        .workspace-subtitle {
          font-size: 0.9rem;
          color: var(--text-muted);
        }
        .workspace-content {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .split-panel {
          padding: 1.75rem;
          display: flex;
          flex-direction: column;
          gap: 1.75rem;
        }
        .split-doc-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-bottom: 1.25rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .doc-info {
          display: flex;
          flex-direction: column;
        }
        .doc-name {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-primary);
        }
        .doc-meta {
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .split-mode-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 0.25rem;
        }
        .mode-tab {
          padding: 0.45rem 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          border-radius: var(--radius-sm);
          transition: all var(--transition-fast);
        }
        .mode-tab:hover {
          color: var(--text-primary);
        }
        .mode-tab.active {
          color: #ffffff;
          background: rgba(16, 185, 129, 0.25);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }
        .expression-editor-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .input-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .expression-input {
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          font-family: var(--font-mono);
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          outline: none;
          transition: border-color var(--transition-fast);
        }
        .expression-input:focus {
          border-color: var(--accent-emerald);
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.25);
        }
        .expression-input.input-error {
          border-color: var(--accent-rose);
        }
        .expression-guidance {
          font-size: 0.82rem;
        }
        .feedback-error {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: #fda4af;
        }
        .feedback-valid {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          color: var(--text-muted);
        }
        .feedback-valid code {
          color: var(--accent-emerald);
          background: rgba(16, 185, 129, 0.1);
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
        }
        .output-preview-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .preview-heading {
          font-size: 0.92rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .output-cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 0.75rem;
          max-height: 280px;
          overflow-y: auto;
          padding: 0.25rem;
        }
        .output-card {
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          padding: 0.75rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .output-card-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .output-title {
          font-size: 0.88rem;
          font-weight: 700;
          color: var(--text-primary);
          flex: 1;
        }
        .output-page-count {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .output-pages-list {
          font-size: 0.8rem;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .split-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-subtle);
        }
        .download-format-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
};
