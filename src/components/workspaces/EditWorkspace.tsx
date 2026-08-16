import React, { useState } from 'react';
import { FileEdit, Download, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { ThumbnailGrid, PageItem } from '../common/ThumbnailGrid';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { PdfSource } from '../../engine/types';
import { readFileAsUint8Array, assertValidPdfBytes, urlTracker } from '../../engine/validation';
import { renderPdfThumbnails } from '../../engine/pdfRenderer';
import { editPdf } from '../../engine/pdfEngine';
import { downloadFile } from '../../engine/download';
import { editedFilename } from '../../engine/naming';
import { ProcessingError, toUserMessage } from '../../engine/errors';

export const EditWorkspace: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
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
    setProgressPercent(15);
    setProgressMessage(`Loading "${file.name}"...`);

    try {
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);

      const pdfSource: PdfSource = {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        bytes,
      };

      setProgressPercent(40);
      setProgressMessage('Rendering page thumbnails...');

      const thumbnails = await renderPdfThumbnails(
        pdfSource,
        280,
        (rendered, total) => {
          setProgressPercent(40 + Math.floor((rendered / total) * 50));
          setProgressMessage(`Rendered page ${rendered} of ${total}...`);
        }
      );

      if (thumbnails.length === 0) {
        throw new ProcessingError('NO_PAGES', 'no renderable pages', { fileName: file.name });
      }

      const initialPages: PageItem[] = thumbnails.map((thumb) => ({
        id: `page-${thumb.pageNumber}`,
        originalIndex: thumb.pageIndex,
        pageNumber: thumb.pageNumber,
        thumbnail: thumb,
        selected: true, // all kept by default
      }));

      setSource(pdfSource);
      setPages(initialPages);
      setProgressPercent(100);
    } catch (err) {
      // Loading failed, so leave any previously opened document untouched.
      setErrorMessage(toUserMessage(err));
      setProgressPercent(0);
      setProgressMessage('');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    setPages(prev =>
      prev.map(p => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
    setSuccessMessage(null);
  };

  const handleReorder = (newPages: PageItem[]) => {
    setPages(newPages);
  };

  const handleSelectAll = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: true })));
  };

  const handleDeselectAll = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: false })));
  };

  const handleInvertSelection = () => {
    setPages(prev => prev.map(p => ({ ...p, selected: !p.selected })));
  };

  const handleSave = async () => {
    if (!source) return;

    const keptPages = pages.filter(p => p.selected);
    if (keptPages.length === 0) {
      setErrorMessage('Cannot save document without any pages. Please keep at least one page.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setProgressPercent(20);
    setProgressMessage('Reorganizing PDF pages...');

    try {
      const retainedIndices = keptPages.map(p => p.originalIndex);
      const editedBytes = await editPdf(source, retainedIndices);

      setProgressPercent(90);
      setProgressMessage('Saving modified document...');

      const outName = editedFilename(source.name);

      await new Promise(r => setTimeout(r, 150));
      downloadFile(editedBytes, outName, 'application/pdf');

      setProgressPercent(100);
      setSuccessMessage(`Successfully saved ${keptPages.length} pages as "${outName}"!`);
    } catch (err) {
      // Recoverable: the rendered pages and the current selection remain, so
      // the person can adjust the selection and save again.
      setErrorMessage(toUserMessage(err));
      setProgressPercent(0);
      setProgressMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSource(null);
    setPages([]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetModal(false);
    setProgressPercent(0);
    urlTracker.revokeAll();
  };

  const keptCount = pages.filter(p => p.selected).length;
  const canSave = keptCount > 0 && !isProcessing && !isLoadingDoc;

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
            <FileEdit size={24} />
          </div>
          <div>
            <h1 className="workspace-title">Delete & Reorder Pages</h1>
            <p className="workspace-subtitle">
              Remove unwanted pages and rearrange the remaining pages visually.
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

      {/* Main workspace */}
      <div className="workspace-content">
        {!source ? (
          <Dropzone
            onFilesSelected={handleFileSelected}
            accept=".pdf,application/pdf"
            multiple={false}
            title="Drop a PDF file here or click to browse"
            subtitle="Select a PDF to delete or reorder pages"
            disabled={isLoadingDoc}
          />
        ) : (
          <div className="edit-active-panel glass-panel">
            <div className="edit-doc-bar">
              <div className="doc-info">
                <span className="doc-name">{source.name}</span>
                <span className="doc-meta">
                  Original: {pages.length} pages • Retained: {keptCount} pages
                </span>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!canSave}
              >
                <Download size={16} />
                <span>Save {keptCount} Pages</span>
              </button>
            </div>

            <ThumbnailGrid
              pages={pages}
              onToggleSelect={handleToggleSelect}
              onReorder={handleReorder}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
              onInvertSelection={handleInvertSelection}
              mode="delete-reorder"
            />
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
        title="Discard changes?"
        description="This will clear the current PDF and any page reordering or deletions."
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
        .edit-active-panel {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
        }
        .edit-doc-bar {
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
      `}</style>
    </div>
  );
};
