import React, { useState } from 'react';
import { Image as ImageIcon, FileText, FileType2, Download, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { OrderedFileList, FileListItem } from '../common/OrderedFileList';
import { ThumbnailGrid, PageItem } from '../common/ThumbnailGrid';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { Modal } from '../common/Modal';
import { PdfDocumentConversionPanel } from './PdfDocumentConversionPanel';
import { PdfSource, ImageFormat } from '../../engine/types';
import { readFileAsUint8Array, assertValidPdfBytes, urlTracker } from '../../engine/validation';
import { renderPdfThumbnails, pdfToImages } from '../../engine/pdfRenderer';
import { imagesToPdf } from '../../engine/pdfEngine';
import { downloadFile, deliverOutputs, ZipEntry } from '../../engine/download';
import { IMAGES_PDF_FILENAME, pageImageFilename, imagesZipFilename } from '../../engine/naming';
import { toUserMessage } from '../../engine/errors';

export const ConvertWorkspace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'img2pdf' | 'pdf2img' | 'pdf2doc'>('img2pdf');

  // --- Images to PDF State ---
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isConvertingImg, setIsConvertingImg] = useState(false);
  const [imgProgress, setImgProgress] = useState(0);
  const [imgMessage, setImgMessage] = useState('');

  // --- PDF to Images State ---
  const [pdfSource, setPdfSource] = useState<PdfSource | null>(null);
  const [pdfPages, setPdfPages] = useState<PageItem[]>([]);
  const [imageFormat, setImageFormat] = useState<ImageFormat>('png');
  const [imageScale, setImageScale] = useState<1 | 2>(1);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isExportingImages, setIsExportingImages] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfProgressMsg, setPdfProgressMsg] = useState('');

  // Shared alerts & reset modal
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);

  // -------------------------------------------------------------
  // TAB 1: Images to PDF Handlers
  // -------------------------------------------------------------
  const handleImagesSelected = (files: File[]) => {
    setErrorMessage(null);
    setSuccessMessage(null);

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
      setErrorMessage('Please select valid JPG, PNG, or WebP image files.');
      return;
    }

    setImageFiles(prev => [...prev, ...validImages]);
  };

  const handleImageReorder = (newItems: FileListItem[]) => {
    const reordered: File[] = [];
    newItems.forEach(item => {
      const found = imageFiles.find(f => f.name === item.name);
      if (found) reordered.push(found);
    });
    setImageFiles(reordered);
  };

  const handleRemoveImage = (id: string) => {
    setImageFiles(prev => prev.filter(f => f.name !== id));
  };

  const handleConvertImagesToPdf = async () => {
    if (imageFiles.length === 0) {
      setErrorMessage('Please add at least one image to convert.');
      return;
    }

    setIsConvertingImg(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setImgProgress(20);
    setImgMessage('Encoding images into PDF pages...');

    try {
      const pdfBytes = await imagesToPdf(imageFiles);
      setImgProgress(90);
      setImgMessage('Finalizing PDF document...');

      await new Promise(r => setTimeout(r, 100));
      downloadFile(pdfBytes, IMAGES_PDF_FILENAME, 'application/pdf');

      setImgProgress(100);
      setSuccessMessage(
        `Successfully converted ${imageFiles.length} images into "${IMAGES_PDF_FILENAME}"!`
      );
    } catch (err) {
      // Recoverable: the image queue and its order are left intact.
      setErrorMessage(toUserMessage(err));
      setImgProgress(0);
      setImgMessage('');
    } finally {
      setIsConvertingImg(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: PDF to Images Handlers
  // -------------------------------------------------------------
  const handlePdfSelected = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];

    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setErrorMessage('Please select a valid PDF file.');
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoadingPdf(true);
    setPdfProgress(15);
    setPdfProgressMsg(`Loading "${file.name}"...`);

    try {
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);

      const source: PdfSource = {
        id: `${file.name}-${Date.now()}`,
        name: file.name,
        bytes,
      };

      setPdfProgress(40);
      setPdfProgressMsg('Rendering page previews...');

      const thumbnails = await renderPdfThumbnails(source, 260, (curr, tot) => {
        setPdfProgress(40 + Math.floor((curr / tot) * 50));
        setPdfProgressMsg(`Rendered page ${curr} of ${tot}...`);
      });

      const items: PageItem[] = thumbnails.map(t => ({
        id: `pdf-page-${t.pageNumber}`,
        originalIndex: t.pageIndex,
        pageNumber: t.pageNumber,
        thumbnail: t,
        selected: true,
      }));

      setPdfSource(source);
      setPdfPages(items);
      setPdfProgress(100);
    } catch (err) {
      setErrorMessage(toUserMessage(err));
      setPdfProgress(0);
      setPdfProgressMsg('');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleExportImages = async () => {
    if (!pdfSource) return;

    const selectedPages = pdfPages.filter(p => p.selected);
    if (selectedPages.length === 0) {
      setErrorMessage('Please select at least one page to export.');
      return;
    }

    setIsExportingImages(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPdfProgress(20);
    setPdfProgressMsg(`Rendering ${selectedPages.length} pages as ${imageFormat.toUpperCase()} (${imageScale}x)...`);

    try {
      const pageIndices = selectedPages.map(p => p.originalIndex);
      const blobs = await pdfToImages(pdfSource, imageFormat, pageIndices, imageScale);

      const mime = imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

      setPdfProgress(85);

      const entries: ZipEntry[] = blobs.map((blob, i) => ({
        name: pageImageFilename(
          pdfSource.name,
          selectedPages[i].pageNumber,
          imageFormat,
          pdfPages.length
        ),
        data: blob,
      }));

      if (entries.length > 1) {
        setPdfProgressMsg('Packaging images into ZIP...');
      }

      // One image downloads directly; two or more are archived.
      const plan = await deliverOutputs(entries, imagesZipFilename(pdfSource.name), mime);

      setSuccessMessage(
        plan.kind === 'file'
          ? `Exported 1 image: "${plan.name}"!`
          : `Exported ${entries.length} images as "${plan.name}"!`
      );

      setPdfProgress(100);
    } catch (err) {
      // Recoverable: the loaded document and page selection are preserved.
      setErrorMessage(toUserMessage(err));
      setPdfProgress(0);
      setPdfProgressMsg('');
    } finally {
      setIsExportingImages(false);
    }
  };

  const handleResetWorkspace = () => {
    if (activeTab === 'img2pdf') {
      setImageFiles([]);
      setImgProgress(0);
      setImgMessage('');
    } else if (activeTab === 'pdf2img') {
      setPdfSource(null);
      setPdfPages([]);
      setPdfProgress(0);
      setPdfProgressMsg('');
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowResetModal(false);
    urlTracker.revokeAll();
  };

  const imageListItems: FileListItem[] = imageFiles.map(f => ({
    id: f.name,
    name: f.name,
    size: f.size,
    status: 'ready',
  }));

  // The document-conversion tab owns its file, its analysis, and its own reset
  // control, so the workspace reset must not claim to speak for it.
  const hasContent =
    activeTab === 'img2pdf'
      ? imageFiles.length > 0
      : activeTab === 'pdf2img'
        ? !!pdfSource
        : false;
  const keptPdfPagesCount = pdfPages.filter(p => p.selected).length;

  return (
    <div className="workspace-root">
      {/* Header */}
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <ImageIcon size={24} />
          </div>
          <div>
            <h1 className="workspace-title">Convert Document & Images</h1>
            <p className="workspace-subtitle">
              Convert image files into PDF, extract PDF pages as crisp images, or turn a
              text-based PDF into an editable Word or Markdown document.
            </p>
          </div>
        </div>

        {hasContent && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowResetModal(true)}
            disabled={isConvertingImg || isLoadingPdf || isExportingImages}
          >
            <RotateCcw size={16} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main Tabs Navigation */}
      <div className="convert-nav-tabs" role="tablist" aria-label="Convert Type">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'img2pdf'}
          className={`convert-tab ${activeTab === 'img2pdf' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('img2pdf');
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        >
          <ImageIcon size={18} />
          <span>Images to PDF</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pdf2img'}
          className={`convert-tab ${activeTab === 'pdf2img' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('pdf2img');
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        >
          <FileText size={18} />
          <span>PDF to Images</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pdf2doc'}
          className={`convert-tab ${activeTab === 'pdf2doc' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('pdf2doc');
            setErrorMessage(null);
            setSuccessMessage(null);
          }}
        >
          <FileType2 size={18} />
          <span>PDF to Word / Markdown</span>
        </button>
      </div>

      {/* Main Workspace Content */}
      <div className="workspace-content">
        {/* TAB 1: Images to PDF */}
        {activeTab === 'img2pdf' && (
          <div className="tab-pane">
            <Dropzone
              onFilesSelected={handleImagesSelected}
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              multiple={true}
              title="Drop JPG, PNG, or WebP images here"
              subtitle="Combine images into a single formatted PDF"
              disabled={isConvertingImg}
            />

            {imageFiles.length > 0 && (
              <div className="glass-panel convert-card">
                <OrderedFileList
                  files={imageListItems}
                  onReorder={handleImageReorder}
                  onRemove={handleRemoveImage}
                />

                <div className="convert-action-bar">
                  <span className="convert-stat">
                    {imageFiles.length} {imageFiles.length === 1 ? 'image' : 'images'} ready for conversion
                  </span>

                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    onClick={handleConvertImagesToPdf}
                    disabled={isConvertingImg}
                  >
                    <Download size={18} />
                    <span>Create PDF ({imageFiles.length} Pages)</span>
                  </button>
                </div>
              </div>
            )}

            {isConvertingImg && (
              <ProgressBar percentage={imgProgress} message={imgMessage} />
            )}
          </div>
        )}

        {/* TAB 2: PDF to Images */}
        {activeTab === 'pdf2img' && (
          <div className="tab-pane">
            {!pdfSource ? (
              <Dropzone
                onFilesSelected={handlePdfSelected}
                accept=".pdf,application/pdf"
                multiple={false}
                title="Drop a PDF file here or click to browse"
                subtitle="Extract PDF pages as PNG or JPEG images"
                disabled={isLoadingPdf}
              />
            ) : (
              <div className="glass-panel convert-card">
                {/* Control toolbar */}
                <div className="pdf2img-controls">
                  <div className="doc-info">
                    <span className="doc-name">{pdfSource.name}</span>
                    <span className="doc-meta">Total Pages: {pdfPages.length}</span>
                  </div>

                  {/* Format & Scale Controls */}
                  <div className="controls-group">
                    <div className="control-item">
                      <label className="control-label" htmlFor="format-select">Format</label>
                      <select
                        id="format-select"
                        className="control-select"
                        value={imageFormat}
                        onChange={(e) => setImageFormat(e.target.value as ImageFormat)}
                      >
                        <option value="png">PNG (Lossless)</option>
                        <option value="jpeg">JPEG</option>
                      </select>
                    </div>

                    <div className="control-item">
                      <label className="control-label" htmlFor="scale-select">Resolution</label>
                      <select
                        id="scale-select"
                        className="control-select"
                        value={imageScale}
                        onChange={(e) => setImageScale(Number(e.target.value) as 1 | 2)}
                      >
                        <option value={1}>1x (Standard 72 DPI)</option>
                        <option value={2}>2x (High-Res 144 DPI)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleExportImages}
                      disabled={keptPdfPagesCount === 0 || isExportingImages}
                    >
                      <Download size={16} />
                      <span>Export {keptPdfPagesCount} Images</span>
                    </button>
                  </div>
                </div>

                <ThumbnailGrid
                  pages={pdfPages}
                  onToggleSelect={(id) => {
                    setPdfPages(prev =>
                      prev.map(p => (p.id === id ? { ...p, selected: !p.selected } : p))
                    );
                  }}
                  onReorder={(newPages) => setPdfPages(newPages)}
                  onSelectAll={() => setPdfPages(prev => prev.map(p => ({ ...p, selected: true })))}
                  onDeselectAll={() => setPdfPages(prev => prev.map(p => ({ ...p, selected: false })))}
                  onInvertSelection={() => setPdfPages(prev => prev.map(p => ({ ...p, selected: !p.selected })))}
                  mode="select-only"
                />
              </div>
            )}

            {(isLoadingPdf || isExportingImages) && (
              <ProgressBar percentage={pdfProgress} message={pdfProgressMsg} />
            )}
          </div>
        )}

        {/* TAB 3: PDF to Word / Markdown */}
        {activeTab === 'pdf2doc' && (
          <div className="tab-pane">
            <PdfDocumentConversionPanel />
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
      </div>

      {/* Reset Confirmation Modal */}
      <Modal
        isOpen={showResetModal}
        title="Discard current workspace?"
        description="This will clear all files and settings in this conversion tool."
        confirmLabel="Clear"
        cancelLabel="Keep Files"
        isDestructive={true}
        onConfirm={handleResetWorkspace}
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
        .convert-nav-tabs {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(15, 23, 42, 0.6);
          padding: 0.35rem;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-subtle);
          width: fit-content;
        }
        .convert-tab {
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
        .convert-tab:hover {
          color: var(--text-primary);
        }
        .convert-tab.active {
          color: #ffffff;
          background: rgba(245, 158, 11, 0.25);
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
        }
        .workspace-content {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .tab-pane {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .convert-card {
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .convert-action-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          padding-top: 1.25rem;
          border-top: 1px solid var(--border-subtle);
        }
        .convert-stat {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .pdf2img-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1.25rem;
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
        .controls-group {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .control-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .control-label {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text-muted);
        }
        .control-select {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-sm);
          padding: 0.45rem 0.75rem;
          color: var(--text-primary);
          font-size: 0.85rem;
          outline: none;
        }
        .control-select:focus {
          border-color: var(--accent-amber);
        }
      `}</style>
    </div>
  );
};
