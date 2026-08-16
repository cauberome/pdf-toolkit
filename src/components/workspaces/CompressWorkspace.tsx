import React, { useState } from 'react';
import { Download, Minimize2, RotateCcw } from 'lucide-react';
import { Dropzone } from '../common/Dropzone';
import { ProgressBar } from '../common/ProgressBar';
import { StatusAlert } from '../common/StatusAlert';
import { CompressionPreset, PdfSource } from '../../engine/types';
import { compressPdf } from '../../engine/advancedPdfEngine';
import { compressedFilename } from '../../engine/naming';
import { downloadFile } from '../../engine/download';
import {
  assertValidPdfBytes,
  formatFileSize,
  readFileAsUint8Array,
  urlTracker,
} from '../../engine/validation';
import { getPdfPageCount } from '../../engine/pdfRenderer';
import { toUserMessage } from '../../engine/errors';

export const CompressWorkspace: React.FC = () => {
  const [source, setSource] = useState<PdfSource | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [mode, setMode] = useState<'auto' | 'target'>('auto');
  const [preset, setPreset] = useState<CompressionPreset>('balanced');
  const [targetMb, setTargetMb] = useState('1');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelected = async (files: File[]) => {
    if (!files[0]) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(15);
    setProgressMessage('Reading document...');
    try {
      const file = files[0];
      const bytes = await readFileAsUint8Array(file);
      assertValidPdfBytes(bytes, file.name);
      const next: PdfSource = { id: `${file.name}-${Date.now()}`, name: file.name, bytes };
      const pages = await getPdfPageCount(next);
      setSource(next);
      setPageCount(pages);
      setProgress(100);
    } catch (caught) {
      setError(toUserMessage(caught));
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const handleCompress = async () => {
    if (!source) return;
    const targetBytes = Number(targetMb) * 1024 * 1024;
    if (mode === 'target' && (!Number.isFinite(targetBytes) || targetBytes <= 0)) {
      setError('Enter a target size greater than 0 MB.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    setProgress(10);
    setProgressMessage('Rendering pages for compression...');
    try {
      const options = mode === 'auto'
        ? { mode: 'auto' as const, preset }
        : { mode: 'target' as const, targetBytes };
      const result = await compressPdf(source, options, (completed, total) => {
        setProgress(10 + Math.round((completed / total) * 80));
        setProgressMessage(`Compression attempt ${completed} of ${total}...`);
      });
      const name = compressedFilename(source.name);
      downloadFile(result.bytes, name);
      setProgress(100);
      setProgressMessage('Done!');

      const reduction = result.originalBytes > 0
        ? Math.max(0, Math.round((1 - result.outputBytes / result.originalBytes) * 100))
        : 0;
      const targetNote = result.targetReached === false
        ? ' The requested target could not be reached; the smallest valid result was downloaded.'
        : result.rasterized
          ? ` Reduced by ${reduction}%.`
          : ' The original was already smaller than the generated alternatives.';
      setSuccess(
        `${formatFileSize(result.originalBytes)} → ${formatFileSize(result.outputBytes)}.${targetNote}`,
      );
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
          <div className="workspace-icon compress-icon"><Minimize2 size={24} /></div>
          <div>
            <h1 className="workspace-title">Compress PDF</h1>
            <p className="workspace-subtitle">Reduce file size automatically or aim for a preferred size.</p>
          </div>
        </div>
        {source && <button className="btn btn-secondary" onClick={reset} disabled={busy}><RotateCcw size={16} />Reset</button>}
      </div>

      <div className="workspace-content">
        <StatusAlert
          type="warning"
          title="Compression changes document content"
          message="Compressed pages are rasterized. Searchable text, links, forms, annotations, and accessibility structure will no longer be interactive in the output."
        />

        {!source ? (
          <Dropzone
            onFilesSelected={handleFileSelected}
            accept=".pdf,application/pdf"
            title="Drop a PDF here or click to browse"
            subtitle="Automatic presets or best-effort target size"
            disabled={busy}
          />
        ) : (
          <section className="advanced-panel glass-panel" aria-labelledby="compress-settings">
            <div className="advanced-doc-row">
              <div><strong>{source.name}</strong><span>{pageCount} pages • {formatFileSize(source.bytes.length)}</span></div>
            </div>

            <h2 id="compress-settings" className="section-title">Compression settings</h2>
            <div className="segmented" role="radiogroup" aria-label="Compression mode">
              <button className={mode === 'auto' ? 'active' : ''} role="radio" aria-checked={mode === 'auto'} onClick={() => setMode('auto')}>Automatic</button>
              <button className={mode === 'target' ? 'active' : ''} role="radio" aria-checked={mode === 'target'} onClick={() => setMode('target')}>Target size</button>
            </div>

            {mode === 'auto' ? (
              <label className="field-label">Quality preset
                <select value={preset} onChange={(event) => setPreset(event.target.value as CompressionPreset)} disabled={busy}>
                  <option value="quality">Higher quality</option>
                  <option value="balanced">Balanced</option>
                  <option value="smallest">Smallest file</option>
                </select>
              </label>
            ) : (
              <label className="field-label">Target size (MB)
                <input type="number" min="0.01" step="0.1" value={targetMb} onChange={(event) => setTargetMb(event.target.value)} disabled={busy} />
                <small>Best effort: complex pages may not reach the exact target.</small>
              </label>
            )}

            <button className="btn btn-primary btn-lg action-button" onClick={handleCompress} disabled={busy}>
              <Download size={18} />Compress and Download
            </button>
          </section>
        )}

        {error && <StatusAlert type="error" title="Compression error" message={error} onDismiss={() => setError(null)} />}
        {success && <StatusAlert type="success" title="Compression complete" message={success} onDismiss={() => setSuccess(null)} />}
        {busy && <ProgressBar percentage={progress} message={progressMessage} />}
      </div>

      <style>{`
        .workspace-root{display:flex;flex-direction:column;gap:2rem}.workspace-header,.workspace-title-box{display:flex;align-items:center;gap:1rem}.workspace-header{justify-content:space-between;flex-wrap:wrap}.workspace-icon{width:48px;height:48px;border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center}.compress-icon{background:rgba(244,63,94,.15);color:#fb7185}.workspace-title{font-size:1.75rem}.workspace-subtitle{font-size:.9rem;color:var(--text-muted)}.workspace-content{display:flex;flex-direction:column;gap:1.25rem}.advanced-panel{padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem}.advanced-doc-row{padding-bottom:1rem;border-bottom:1px solid var(--border-subtle)}.advanced-doc-row div{display:flex;flex-direction:column;gap:.2rem}.advanced-doc-row span{font-size:.85rem;color:var(--text-muted)}.section-title{font-size:1.05rem}.segmented{display:flex;gap:.5rem}.segmented button{padding:.65rem 1rem;border:1px solid var(--border-medium);border-radius:var(--radius-md);color:var(--text-secondary)}.segmented button.active{background:rgba(99,102,241,.2);border-color:var(--accent-primary);color:#fff}.field-label{display:flex;flex-direction:column;gap:.45rem;font-weight:600;max-width:420px}.field-label select,.field-label input{background:rgba(15,23,42,.8);color:var(--text-primary);border:1px solid var(--border-medium);border-radius:var(--radius-md);padding:.75rem}.field-label small{font-weight:400;color:var(--text-muted)}.action-button{align-self:flex-start}@media(max-width:640px){.action-button{width:100%}.segmented{flex-direction:column}}
      `}</style>
    </div>
  );
};
