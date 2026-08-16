import React, { useState } from 'react';
import { Download, FilePlus2, FileText, Image as ImageIcon, Plus, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { OrderedFileList, FileListItem } from '../common/OrderedFileList';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { BlankPageSize, PageAddition, PdfSource } from '../../engine/types';
import { addPagesToPdf } from '../../engine/advancedPdfEngine';
import { pagesAddedFilename } from '../../engine/naming';
import { downloadFile } from '../../engine/download';
import {
  assertValidPdfBytes,
  formatFileSize,
  readFileAsUint8Array,
  urlTracker,
} from '../../engine/validation';
import { getPdfPageCount } from '../../engine/pdfRenderer';
import { toUserMessage } from '../../engine/errors';

type AdditionKind = 'blank' | 'pdf' | 'images';

export const AddPagesWorkspace: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [insertionIndex, setInsertionIndex] = useState(0); // 0 = before page 1, pageCount = after page N

  // Addition mode state
  const [additionKind, setAdditionKind] = useState<AdditionKind>('blank');
  const [blankCount, setBlankCount] = useState(1);
  const [blankSize, setBlankSize] = useState<BlankPageSize>('match');

  // PDF addition state
  const [addPdfSource, setAddPdfSource] = useState<PdfSource | null>(null);
  const [addPdfPageCount, setAddPdfPageCount] = useState(0);

  // Images addition state
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // UI status state
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleBaseFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(15);
    setProgressMessage('Reading base PDF document...');

    try {
      const file = files[0];
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);
      const next: PdfSource = { id: `${file.name}-${Date.now()}`, name: file.name, bytes };
      const pages = await getPdfPageCount(next);
      setSource(next);
      setPageCount(pages);
      setInsertionIndex(pages); // default to append after last page
      setProgress(100);
    } catch (caught) {
      setError(toUserMessage(caught));
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const handleAdditionPdfSelected = async (files: File[]) => {
    if (!files[0]) return;
    setBusy(true);
    setError(null);
    try {
      const file = files[0];
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);
      const next: PdfSource = { id: `${file.name}-${Date.now()}`, name: file.name, bytes };
      const pages = await getPdfPageCount(next);
      setAddPdfSource(next);
      setAddPdfPageCount(pages);
    } catch (caught) {
      setError(toUserMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const handleImagesSelected = (files: File[]) => {
    setError(null);
    const validImages: File[] = [];
    for (const file of files) {
      const ext = file.name.toLowerCase();
      if (
        ext.endsWith('.jpg') ||
        ext.endsWith('.jpeg') ||
        ext.endsWith('.png') ||
        ext.endsWith('.webp') ||
        file.type.startsWith('image/')
      ) {
        validImages.push(file);
      }
    }

    if (validImages.length === 0) {
      setError('Please select valid JPG, PNG, or WebP image files.');
      return;
    }

    setImageFiles((prev) => [...prev, ...validImages]);
  };

  const handleImageReorder = (newItems: FileListItem[]) => {
    const reordered: File[] = [];
    newItems.forEach((item) => {
      const found = imageFiles.find((f) => f.name === item.name);
      if (found) reordered.push(found);
    });
    setImageFiles(reordered);
  };

  const handleRemoveImage = (id: string) => {
    setImageFiles((prev) => prev.filter((f) => f.name !== id));
  };

  const handleAddPages = async () => {
    if (!source) return;

    let addition: PageAddition;
    if (additionKind === 'blank') {
      if (!Number.isInteger(blankCount) || blankCount < 1 || blankCount > 100) {
        setError('Blank page count must be between 1 and 100.');
        return;
      }
      addition = { kind: 'blank', count: blankCount, size: blankSize };
    } else if (additionKind === 'pdf') {
      if (!addPdfSource) {
        setError('Please select a PDF document to insert.');
        return;
      }
      addition = { kind: 'pdf', source: addPdfSource };
    } else {
      if (imageFiles.length === 0) {
        setError('Please select at least one image to insert.');
        return;
      }
      addition = { kind: 'images', files: imageFiles };
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(20);
    setProgressMessage('Inserting new pages into PDF...');

    try {
      const outputBytes = await addPagesToPdf(source, insertionIndex, addition);
      setProgress(85);
      setProgressMessage('Generating output document...');

      const name = pagesAddedFilename(source.name);
      await new Promise((r) => setTimeout(r, 100));
      downloadFile(outputBytes, name);

      setProgress(100);
      setProgressMessage('Done!');

      const insertedSummary =
        additionKind === 'blank'
          ? `${blankCount} blank page${blankCount === 1 ? '' : 's'}`
          : additionKind === 'pdf'
            ? `${addPdfPageCount} pages from "${addPdfSource?.name}"`
            : `${imageFiles.length} image page${imageFiles.length === 1 ? '' : 's'}`;

      setSuccess(`Successfully inserted ${insertedSummary} and downloaded "${name}".`);
    } catch (caught) {
      setError(toUserMessage(caught));
      setProgress(0);
      setProgressMessage('');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSource(null);
    setPageCount(0);
    setInsertionIndex(0);
    setAdditionKind('blank');
    setBlankCount(1);
    setBlankSize('match');
    setAddPdfSource(null);
    setAddPdfPageCount(0);
    setImageFiles([]);
    setError(null);
    setSuccess(null);
    setProgress(0);
    setProgressMessage('');
    setShowResetModal(false);
    urlTracker.revokeAll();
  };

  const imageListItems: FileListItem[] = imageFiles.map((f) => ({
    id: f.name,
    name: f.name,
    size: f.size,
    status: 'ready',
  }));

  const canProcess =
    !!source &&
    !busy &&
    (additionKind === 'blank'
      ? blankCount >= 1 && blankCount <= 100
      : additionKind === 'pdf'
        ? !!addPdfSource
        : imageFiles.length > 0);

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon add-pages-icon">
            <FilePlus2 size={24} />
          </div>
          <div>
            <h1 className="workspace-title">Add Pages to PDF</h1>
            <p className="workspace-subtitle">
              Insert blank pages, imported PDF documents, or ordered images anywhere in your file.
            </p>
          </div>
        </div>
        {source && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetModal(true)}
            disabled={busy}
          >
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="workspace-content">
        {!source ? (
          <Dropzone
            onFilesSelected={handleBaseFileSelected}
            accept=".pdf,application/pdf"
            title="Drop base PDF here or click to browse"
            subtitle="Select the PDF document to insert pages into"
            disabled={busy}
          />
        ) : (
          <section className="advanced-panel glass-panel" aria-labelledby="add-pages-config">
            {/* Document summary header */}
            <div className="advanced-doc-row">
              <div>
                <strong>{source.name}</strong>
                <span>
                  Current length: {pageCount} {pageCount === 1 ? 'page' : 'pages'} •{' '}
                  {formatFileSize(source.bytes.length)}
                </span>
              </div>
            </div>

            <h2 id="add-pages-config" className="section-title">
              1. Choose Insertion Position
            </h2>

            <div className="position-selector-row">
              <label className="field-label" htmlFor="insertion-position-select">
                Insert content:
                <select
                  id="insertion-position-select"
                  value={insertionIndex}
                  onChange={(e) => setInsertionIndex(Number(e.target.value))}
                  disabled={busy}
                >
                  <option value={0}>At the beginning (Before page 1)</option>
                  {Array.from({ length: pageCount - 1 }, (_, i) => i + 1).map((idx) => (
                    <option key={idx} value={idx}>
                      Between page {idx} and page {idx + 1}
                    </option>
                  ))}
                  {pageCount >= 1 && (
                    <option value={pageCount}>At the end (After page {pageCount})</option>
                  )}
                </select>
              </label>
            </div>

            <h2 className="section-title">2. Choose What to Insert</h2>

            {/* Addition Type Tabs */}
            <div className="addition-nav-tabs" role="tablist" aria-label="Addition Type">
              <button
                type="button"
                role="tab"
                aria-selected={additionKind === 'blank'}
                className={`addition-tab ${additionKind === 'blank' ? 'active' : ''}`}
                onClick={() => setAdditionKind('blank')}
              >
                <Plus size={16} />
                <span>Blank Pages</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={additionKind === 'pdf'}
                className={`addition-tab ${additionKind === 'pdf' ? 'active' : ''}`}
                onClick={() => setAdditionKind('pdf')}
              >
                <FileText size={16} />
                <span>Import PDF</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={additionKind === 'images'}
                className={`addition-tab ${additionKind === 'images' ? 'active' : ''}`}
                onClick={() => setAdditionKind('images')}
              >
                <ImageIcon size={16} />
                <span>Import Images</span>
              </button>
            </div>

            {/* Mode 1: Blank Pages */}
            {additionKind === 'blank' && (
              <div className="mode-details-box">
                <div className="blank-controls-row">
                  <label className="field-label">
                    Number of blank pages
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={blankCount}
                      onChange={(e) => setBlankCount(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={busy}
                    />
                  </label>

                  <label className="field-label">
                    Page size
                    <select
                      value={blankSize}
                      onChange={(e) => setBlankSize(e.target.value as BlankPageSize)}
                      disabled={busy}
                    >
                      <option value="match">Match neighboring page</option>
                      <option value="a4">Standard A4</option>
                      <option value="letter">US Letter</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            {/* Mode 2: Import PDF */}
            {additionKind === 'pdf' && (
              <div className="mode-details-box">
                {!addPdfSource ? (
                  <Dropzone
                    onFilesSelected={handleAdditionPdfSelected}
                    accept=".pdf,application/pdf"
                    title="Drop PDF to insert here or click to browse"
                    subtitle="All pages from this document will be inserted"
                    disabled={busy}
                    id="add-pdf-dropzone"
                  />
                ) : (
                  <div className="imported-doc-card">
                    <div className="imported-doc-info">
                      <FileText size={20} className="text-cyan" />
                      <div>
                        <p className="imported-title">{addPdfSource.name}</p>
                        <p className="imported-meta">
                          {addPdfPageCount} {addPdfPageCount === 1 ? 'page' : 'pages'} •{' '}
                          {formatFileSize(addPdfSource.bytes.length)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setAddPdfSource(null);
                        setAddPdfPageCount(0);
                      }}
                      disabled={busy}
                    >
                      Change File
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mode 3: Import Images */}
            {additionKind === 'images' && (
              <div className="mode-details-box">
                <Dropzone
                  onFilesSelected={handleImagesSelected}
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  multiple={true}
                  title="Drop JPG, PNG, or WebP images here"
                  subtitle="Each image will become a formatted page"
                  disabled={busy}
                  id="add-images-dropzone"
                />

                {imageFiles.length > 0 && (
                  <OrderedFileList
                    files={imageListItems}
                    onReorder={handleImageReorder}
                    onRemove={handleRemoveImage}
                  />
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="add-pages-action-bar">
              <div className="output-summary-stat">
                <span>
                  Result document will have{' '}
                  <strong>
                    {pageCount +
                      (additionKind === 'blank'
                        ? blankCount
                        : additionKind === 'pdf'
                          ? addPdfPageCount
                          : imageFiles.length)}
                  </strong>{' '}
                  pages.
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-lg action-button"
                onClick={handleAddPages}
                disabled={!canProcess}
              >
                <Download size={18} />
                <span>Save & Download PDF</span>
              </button>
            </div>
          </section>
        )}

        {error && (
          <StatusAlert
            type="error"
            title="Error adding pages"
            message={error}
            onDismiss={() => setError(null)}
          />
        )}

        {success && (
          <StatusAlert
            type="success"
            title="Document updated"
            message={success}
            onDismiss={() => setSuccess(null)}
          />
        )}

        {busy && <ProgressBar percentage={progress} message={progressMessage} />}
      </div>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        title="Discard workspace changes?"
        description="This will clear the base document and all inserted content."
        confirmLabel="Clear Document"
        cancelLabel="Keep Editing"
        isDestructive={true}
        onConfirm={reset}
        onCancel={() => setShowResetModal(false)}
      />

      <style>{`
        .workspace-root {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .workspace-header,
        .workspace-title-box {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .workspace-header {
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .workspace-icon {
          width: 48px;
          height: 48px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .add-pages-icon {
          background: rgba(20, 184, 166, 0.15);
          color: #2dd4bf;
        }
        .workspace-title {
          font-size: 1.75rem;
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
        .advanced-panel {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .advanced-doc-row {
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-subtle);
        }
        .advanced-doc-row div {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .advanced-doc-row span {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .section-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .position-selector-row {
          max-width: 480px;
        }
        .addition-nav-tabs {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(15, 23, 42, 0.6);
          padding: 0.35rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          width: fit-content;
          flex-wrap: wrap;
        }
        .addition-tab {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          transition: all var(--transition-fast);
        }
        .addition-tab:hover {
          color: var(--text-primary);
        }
        .addition-tab.active {
          color: #ffffff;
          background: rgba(20, 184, 166, 0.25);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        .mode-details-box {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1.25rem;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .blank-controls-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }
        .field-label {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          font-weight: 600;
          font-size: 0.88rem;
          color: var(--text-secondary);
        }
        .field-label select,
        .field-label input {
          background: rgba(15, 23, 42, 0.8);
          color: var(--text-primary);
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-md);
          padding: 0.75rem;
          font-size: 0.92rem;
          outline: none;
        }
        .field-label select:focus,
        .field-label input:focus {
          border-color: #2dd4bf;
        }
        .imported-doc-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .imported-doc-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .imported-title {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--text-primary);
        }
        .imported-meta {
          font-size: 0.82rem;
          color: var(--text-muted);
        }
        .add-pages-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-subtle);
        }
        .output-summary-stat {
          font-size: 0.92rem;
          color: var(--text-secondary);
        }
        .action-button {
          align-self: flex-start;
        }
        @media (max-width: 640px) {
          .action-button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};
