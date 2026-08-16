import React, { useMemo, useState } from 'react';
import { Crop, Download, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { CropMargins, PageThumbnail, PdfSource } from '../../engine/types';
import { cropPdf, validateCropMargins } from '../../engine/advancedPdfEngine';
import { renderPdfThumbnails } from '../../engine/pdfRenderer';
import { croppedFilename } from '../../engine/naming';
import { downloadFile } from '../../engine/download';
import { assertValidPdfBytes, readFileAsUint8Array, urlTracker } from '../../engine/validation';
import { toUserMessage } from '../../engine/errors';

const EMPTY_MARGINS: CropMargins = { top: 0, right: 0, bottom: 0, left: 0 };

export const CropWorkspace: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [thumbnails, setThumbnails] = useState<PageThumbnail[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [margins, setMargins] = useState<CropMargins>(EMPTY_MARGINS);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const marginsValid = useMemo(() => {
    try {
      validateCropMargins(margins);
      return true;
    } catch {
      return false;
    }
  }, [margins]);

  const handleFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(10);
    setProgressMessage('Loading PDF...');
    try {
      const file = files[0];
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);
      const next: PdfSource = { id: `${file.name}-${Date.now()}`, name: file.name, bytes };
      const previews = await renderPdfThumbnails(next, 220, (completed, total) => {
        setProgress(10 + Math.round((completed / total) * 80));
        setProgressMessage(`Rendering preview ${completed} of ${total}...`);
      });
      setSource(next);
      setThumbnails(previews);
      setSelected(new Set(previews.map((page) => page.pageIndex)));
      setProgress(100);
    } catch (caught) {
      setError(toUserMessage(caught));
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const setMargin = (side: keyof CropMargins, value: string) => {
    setMargins((current) => ({ ...current, [side]: Number(value) }));
    setSuccess(null);
  };

  const togglePage = (pageIndex: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(pageIndex)) next.delete(pageIndex);
      else next.add(pageIndex);
      return next;
    });
  };

  const handleCrop = async () => {
    if (!source || selected.size === 0 || !marginsValid) {
      setError('Select at least one page and use margins that leave at least 5% visible.');
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(25);
    setProgressMessage('Updating page crop boxes...');
    try {
      const output = await cropPdf(source, [...selected].sort((a, b) => a - b), margins);
      const name = croppedFilename(source.name);
      setProgress(85);
      downloadFile(output, name);
      setProgress(100);
      setProgressMessage('Done!');
      setSuccess(`Cropped ${selected.size} of ${thumbnails.length} pages and downloaded "${name}".`);
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
    setThumbnails([]);
    setSelected(new Set());
    setMargins(EMPTY_MARGINS);
    setError(null);
    setSuccess(null);
    setProgress(0);
    setProgressMessage('');
    urlTracker.revokeAll();
  };

  return (
    <div className="workspace-root">
      <div className="workspace-header">
        <div className="workspace-title-box">
          <div className="workspace-icon crop-icon"><Crop size={24} /></div>
          <div>
            <h1 className="workspace-title">Crop PDF</h1>
            <p className="workspace-subtitle">Trim visible page areas while preserving vector content.</p>
          </div>
        </div>
        {source && <button className="btn btn-secondary" onClick={reset} disabled={busy}><RotateCcw size={16} />Reset</button>}
      </div>

      <div className="workspace-content">
        {!source ? (
          <Dropzone
            onFilesSelected={handleFileSelected}
            accept=".pdf,application/pdf"
            title="Drop a PDF here or click to browse"
            subtitle="Create crop margins for selected pages or the whole document"
            disabled={busy}
          />
        ) : (
          <section className="crop-panel glass-panel">
            <div className="crop-toolbar">
              <div><strong>{source.name}</strong><span>{selected.size} of {thumbnails.length} pages selected</span></div>
              <div className="crop-selection-actions">
                <button className="btn btn-secondary" onClick={() => setSelected(new Set(thumbnails.map((page) => page.pageIndex)))}>Select all</button>
                <button className="btn btn-ghost" onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            </div>

            <div className="margin-controls" aria-label="Crop margins in percent">
              {(Object.keys(margins) as Array<keyof CropMargins>).map((side) => (
                <label key={side}>{side[0].toUpperCase() + side.slice(1)} (%)
                  <input type="number" min="0" max="95" step="1" value={margins[side]} onChange={(event) => setMargin(side, event.target.value)} disabled={busy} />
                </label>
              ))}
            </div>
            {!marginsValid && <p className="crop-invalid" role="alert">Opposite margins must leave at least 5% of the page visible.</p>}

            <div className="crop-grid" aria-label="Choose pages to crop">
              {thumbnails.map((page) => {
                const isSelected = selected.has(page.pageIndex);
                return (
                  <button
                    key={page.pageIndex}
                    className={`crop-page ${isSelected ? 'selected' : ''}`}
                    onClick={() => togglePage(page.pageIndex)}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Exclude' : 'Include'} page ${page.pageNumber}`}
                  >
                    <div className="crop-preview">
                      <img src={page.dataUrl} alt={`Page ${page.pageNumber} preview`} />
                      {isSelected && marginsValid && (
                        <span className="crop-mask" style={{ top: `${margins.top}%`, right: `${margins.right}%`, bottom: `${margins.bottom}%`, left: `${margins.left}%` }} />
                      )}
                    </div>
                    <span>Page {page.pageNumber}</span>
                  </button>
                );
              })}
            </div>

            <button className="btn btn-primary btn-lg crop-action" onClick={handleCrop} disabled={busy || selected.size === 0 || !marginsValid}>
              <Download size={18} />Crop {selected.size} Page{selected.size === 1 ? '' : 's'}
            </button>
          </section>
        )}

        {error && <StatusAlert type="error" title="Crop error" message={error} onDismiss={() => setError(null)} />}
        {success && <StatusAlert type="success" title="Crop complete" message={success} onDismiss={() => setSuccess(null)} />}
        {busy && <ProgressBar percentage={progress} message={progressMessage} />}
      </div>

      <style>{`
        .workspace-root{display:flex;flex-direction:column;gap:2rem}.workspace-header,.workspace-title-box{display:flex;align-items:center;gap:1rem}.workspace-header{justify-content:space-between;flex-wrap:wrap}.workspace-icon{width:48px;height:48px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center}.crop-icon{background:rgba(139,92,246,.15);color:#a78bfa}.workspace-title{font-size:1.75rem}.workspace-subtitle{font-size:.9rem;color:var(--text-muted)}.workspace-content{display:flex;flex-direction:column;gap:1.25rem}.crop-panel{padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem}.crop-toolbar{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap}.crop-toolbar>div:first-child{display:flex;flex-direction:column}.crop-toolbar span{font-size:.85rem;color:var(--text-muted)}.crop-selection-actions{display:flex;gap:.5rem}.margin-controls{display:grid;grid-template-columns:repeat(4,minmax(100px,1fr));gap:1rem;padding:1rem;background:rgba(15,23,42,.5);border-radius:var(--radius-md)}.margin-controls label{display:flex;flex-direction:column;gap:.4rem;font-size:.82rem;font-weight:600;color:var(--text-secondary)}.margin-controls input{padding:.65rem;background:rgba(9,13,22,.8);border:1px solid var(--border-medium);border-radius:var(--radius-sm);color:#fff}.crop-invalid{color:#fda4af;font-size:.85rem}.crop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:1rem}.crop-page{display:flex;flex-direction:column;gap:.5rem;padding:.65rem;border:1px solid var(--border-medium);border-radius:var(--radius-md);color:var(--text-secondary);background:rgba(15,23,42,.45)}.crop-page.selected{border-color:#a78bfa;background:rgba(139,92,246,.12);color:#fff}.crop-preview{position:relative;overflow:hidden;background:#fff;border-radius:var(--radius-sm);aspect-ratio:3/4;display:flex;align-items:center;justify-content:center}.crop-preview img{width:100%;height:100%;object-fit:contain}.crop-mask{position:absolute;border:3px solid #22d3ee;box-shadow:0 0 0 999px rgba(244,63,94,.34);pointer-events:none}.crop-action{align-self:flex-end}@media(max-width:640px){.margin-controls{grid-template-columns:repeat(2,1fr)}.crop-action{width:100%}}
      `}</style>
    </div>
  );
};
