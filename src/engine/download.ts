import JSZip from 'jszip';
import { urlTracker } from './validation';
import { toProcessingError } from './errors';

export type ZipEntry = {
  name: string;
  data: Blob | Uint8Array;
};

export type DeliveryPlan =
  | { kind: 'file'; name: string; data: Blob | Uint8Array }
  | { kind: 'zip'; name: string; entries: ZipEntry[] };

/**
 * How long the object URL must outlive the click for the browser to start the
 * download. Revoking immediately cancels the download in some browsers.
 */
const REVOKE_DELAY_MS = 10_000;

/**
 * Triggers a direct browser download for a single Blob or Uint8Array.
 */
export function downloadFile(
  content: Blob | Uint8Array,
  filename: string,
  mimeType = 'application/pdf',
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = urlTracker.create(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    urlTracker.revoke(url);
  }, REVOKE_DELAY_MS);
}

/**
 * Builds the ZIP archive for multi-file outputs, preserving entry order.
 */
export async function buildZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.data);
  }

  try {
    return await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  } catch (err) {
    // Archiving many large outputs is the most likely place to exhaust memory.
    throw toProcessingError(err, 'OUT_OF_MEMORY');
  }
}

/**
 * The single place that decides between a direct download and an archive:
 * one generated file goes out as itself, two or more are packaged in a ZIP.
 */
export function planDelivery(entries: ZipEntry[], zipFilename: string): DeliveryPlan {
  if (entries.length === 0) {
    throw new Error('planDelivery requires at least one output');
  }
  if (entries.length === 1) {
    return { kind: 'file', name: entries[0].name, data: entries[0].data };
  }
  return { kind: 'zip', name: zipFilename, entries };
}

/**
 * Packages multiple files into a single ZIP archive and triggers download.
 */
export async function downloadZip(
  entries: ZipEntry[],
  zipFilename = 'documents.zip',
): Promise<void> {
  const zipBlob = await buildZipBlob(entries);
  downloadFile(zipBlob, zipFilename, 'application/zip');
}

/**
 * Applies `planDelivery` and performs the resulting download.
 * @returns which route was taken, for status messaging.
 */
export async function deliverOutputs(
  entries: ZipEntry[],
  zipFilename: string,
  singleFileMimeType = 'application/pdf',
): Promise<DeliveryPlan> {
  const plan = planDelivery(entries, zipFilename);

  if (plan.kind === 'file') {
    downloadFile(plan.data, plan.name, singleFileMimeType);
  } else {
    await downloadZip(plan.entries, plan.name);
  }

  return plan;
}
