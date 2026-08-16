import React, { useState } from 'react';
import { Layers, Download, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { OrderedFileList, FileListItem } from '../common/OrderedFileList';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { PdfSource } from '../../engine/types';
import { readFileAsUint8Array, assertValidPdfBytes, urlTracker } from '../../engine/validation';
import { getPdfPageCount } from '../../engine/pdfRenderer';
import { mergePdfs } from '../../engine/pdfEngine';
import { downloadFile } from '../../engine/download';
import { MERGED_FILENAME } from '../../engine/naming';
import { toUserMessage } from '../../engine/errors';

interface LoadedPdf {
  id: string;
  file: File;
  source: PdfSource;
  pageCount: number;
}

export const MergeWorkspace: React.FC = () => {
  const [loadedPdfs, setLoadedPdfs] = useState<LoadedPdf[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleFilesSelected = async (files: File[]) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const pdfFiles = files.filter(f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf');
    if (pdfFiles.length === 0) {
      setErrorMessage('Please select valid PDF files.');
      return;
    }

    const newPdfs: LoadedPdf[] = [];

    for (const file of pdfFiles) {
      try {
        const bytes = await readFileAsUint8Array(file);
        assertValidPdfBytes(bytes, file.name);

        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const source: PdfSource = {
          id,
          name: file.name,
          bytes,
        };

        let pageCount = 0;
        try {
          pageCount = await getPdfPageCount(source);
        } catch {
          // If thumbnail/page count fails, default to 1
          pageCount = 1;
        }

        newPdfs.push({
          id,
          file,
          source,
          pageCount,
        });
      } catch (err) {
        // Report the bad file but keep loading the rest of the selection.
        setErrorMessage(toUserMessage(err));
      }
    }

    setLoadedPdfs(prev => [...prev, ...newPdfs]);
  };

  const handleReorder = (newItems: FileListItem[]) => {
    const reordered: LoadedPdf[] = [];
    newItems.forEach(item => {
      const found = loadedPdfs.find(p => p.id === item.id);
      if (found) reordered.push(found);
    });
    setLoadedPdfs(reordered);
  };

  const handleRemove = (id: string) => {
    setLoadedPdfs(prev => prev.filter(p => p.id !== id));
    setSuccessMessage(null);
  };

  const handleMerge = async () => {
    if (loadedPdfs.length < 2) {
      setErrorMessage('Please add at least two PDF documents to merge.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setProgressPercent(20);
    setProgressMessage('Reading PDF documents...');

    try {
      await new Promise(r => setTimeout(r, 100)); // smooth UI update
      setProgressPercent(50);
      setProgressMessage('Combining pages...');

      const sources = loadedPdfs.map(p => p.source);
      const mergedBytes = await mergePdfs(sources);

      setProgressPercent(90);
      setProgressMessage('Generating output file...');

      await new Promise(r => setTimeout(r, 150));
      downloadFile(mergedBytes, MERGED_FILENAME, 'application/pdf');

      setProgressPercent(100);
      setProgressMessage('Done!');
      setSuccessMessage(`Successfully merged ${loadedPdfs.length} PDFs into "${MERGED_FILENAME}"!`);
    } catch (err) {
      // Recoverable: the loaded files and their order survive the failure so
      // the person can remove the offending document and merge again.
      setErrorMessage(toUserMessage(err));
      setProgressPercent(0);
      setProgressMessage('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setLoadedPdfs([]);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetModal(false);
    setProgressPercent(0);
    // Release any object URLs still held by a pending download.
    urlTracker.revokeAll();
  };

  const fileListItems: FileListItem[] = loadedPdfs.map(p => ({
    id: p.id,
    name: p.file.name,
    size: p.file.size,
    pageCount: p.pageCount,
    status: 'ready',
  }));

  const totalPages = loadedPdfs.reduce((sum, p) => sum + p.pageCount, 0);
  const canMerge = loadedPdfs.length >= 2 && !isProcessing;

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Layers size={24} />
          </div>
          <div>
            <h1 className="workspace-title">Merge PDF Files</h1>
            <p className="workspace-subtitle">
              Combine multiple PDF documents into one single file in your desired order.
            </p>
          </div>
        </div>

        {loadedPdfs.length > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetModal(true)}
            disabled={isProcessing}
          >
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main workspace content */}
      <div className="workspace-content">
        <Dropzone
          onFilesSelected={handleFilesSelected}
          accept=".pdf,application/pdf"
          multiple={true}
          title="Drop PDF files here or click to browse"
          subtitle="Add 2 or more PDF documents to merge"
          disabled={isProcessing}
        />

        {errorMessage && (
          <StatusAlert
            type="error"
            title="Merge Error"
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

        {isProcessing && (
          <ProgressBar
            percentage={progressPercent}
            message={progressMessage}
          />
        )}

        {/* File List and summary */}
        {loadedPdfs.length > 0 && (
          <div className="merge-summary-card glass-panel">
            <OrderedFileList
              files={fileListItems}
              onReorder={handleReorder}
              onRemove={handleRemove}
            />

            {/* Bottom merge action bar */}
            <div className="merge-action-bar">
              <div className="merge-stat-group">
                <div className="merge-stat">
                  <span className="stat-label">Total Documents</span>
                  <span className="stat-value">{loadedPdfs.length}</span>
                </div>
                <div className="merge-stat">
                  <span className="stat-label">Total Pages</span>
                  <span className="stat-value">{totalPages}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleMerge}
                disabled={!canMerge}
              >
                <Download size={18} />
                <span>Merge {loadedPdfs.length} Files</span>
              </button>
            </div>

            {loadedPdfs.length === 1 && (
              <p className="merge-requirement-hint">
                Add at least 1 more PDF document to enable merging.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        title="Discard current files?"
        description="This will clear all added PDF documents from this workspace."
        confirmLabel="Clear All"
        cancelLabel="Keep Files"
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
        .merge-summary-card {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .merge-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1.25rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-subtle);
        }
        .merge-stat-group {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .merge-stat {
          display: flex;
          flex-direction: column;
        }
        .stat-label {
          font-size: 0.78rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .stat-value {
          font-size: 1.35rem;
          font-weight: 700;
          font-family: var(--font-mono);
          color: var(--text-primary);
        }
        .btn-lg {
          padding: 0.8rem 1.75rem;
          font-size: 1.05rem;
        }
        .merge-requirement-hint {
          font-size: 0.85rem;
          color: var(--accent-amber);
          text-align: center;
        }
      `}</style>
    </div>
  );
};
