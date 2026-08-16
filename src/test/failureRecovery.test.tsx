import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MergeWorkspace } from '../components/workspaces/MergeWorkspace';
import { urlTracker } from '../engine/validation';
import { ProcessingError } from '../engine/errors';
import { createTestPdf, asFile } from './fixtures';

/**
 * A switch that makes the real merge engine fail on demand, so a mid-operation
 * failure can be observed through the UI. Off by default: every other test in
 * this file exercises the genuine engine.
 */
const engineControl = vi.hoisted(() => ({ mergeFailure: null as unknown }));

vi.mock('../engine/pdfEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../engine/pdfEngine')>();
  return {
    ...actual,
    mergePdfs: async (sources: Parameters<typeof actual.mergePdfs>[0]) => {
      if (engineControl.mergeFailure) throw engineControl.mergeFailure;
      return actual.mergePdfs(sources);
    },
  };
});

/**
 * The file input is hidden and aria-hidden, so it is reached through the
 * container rather than by role, and its FileList is stubbed directly.
 */
function selectFiles(container: HTMLElement, files: File[]): void {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toBeTruthy();
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}

async function validPdfFile(name: string, pages = 2): Promise<File> {
  return asFile(await createTestPdf(pages), name, 'application/pdf');
}

function mislabeledPdfFile(name: string): File {
  const bytes = new Uint8Array(new TextEncoder().encode('I am plain text, not a PDF at all.'));
  return asFile(bytes, name, 'application/pdf');
}

describe('BE-06 — recoverable failures keep the workspace usable', () => {
  beforeEach(() => {
    engineControl.mergeFailure = null;
    urlTracker.revokeAll();
  });

  afterEach(() => {
    engineControl.mergeFailure = null;
    vi.restoreAllMocks();
    urlTracker.revokeAll();
  });

  it('reports a mislabeled file by name while keeping the valid ones queued', async () => {
    const { container } = render(<MergeWorkspace />);

    selectFiles(container, [
      await validPdfFile('good-one.pdf'),
      mislabeledPdfFile('not-really.pdf'),
      await validPdfFile('good-two.pdf'),
    ]);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/not-really\.pdf/)).toBeInTheDocument();
    expect(within(alert).getByText(/not a PDF file/i)).toBeInTheDocument();

    // The two readable documents are still queued and ready to merge.
    await waitFor(() => {
      expect(screen.getByText('good-one.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('good-two.pdf')).toBeInTheDocument();
    expect(screen.queryByText('not-really.pdf')).not.toBeInTheDocument();
  });

  it('explains an empty file without discarding the rest of the selection', async () => {
    const { container } = render(<MergeWorkspace />);

    selectFiles(container, [
      await validPdfFile('kept.pdf'),
      asFile(new Uint8Array(0), 'zero-bytes.pdf', 'application/pdf'),
    ]);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/is empty/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('kept.pdf')).toBeInTheDocument();
    });
  });

  it('shows a recoverable memory message and keeps the queue after the merge fails', async () => {
    const { container } = render(<MergeWorkspace />);

    selectFiles(container, [await validPdfFile('a.pdf'), await validPdfFile('b.pdf')]);
    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument());

    // A document too large for this browser, rather than an arbitrary limit.
    engineControl.mergeFailure = new ProcessingError('OUT_OF_MEMORY', 'allocation failed');

    fireEvent.click(screen.getByRole('button', { name: /Merge \d+ Files/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/too large for this browser/i)).toBeInTheDocument();

    // The queue and its order survive, and the action is retryable.
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Merge \d+ Files/i })).not.toBeDisabled();
    });

    // Retrying after the transient failure clears succeeds.
    engineControl.mergeFailure = null;
    fireEvent.click(screen.getByRole('button', { name: /Merge \d+ Files/i }));
    expect(await screen.findByText(/Successfully merged 2 PDFs into "merged\.pdf"/i)).toBeInTheDocument();
  });

  it('sends no network request while reading and merging documents', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const xhrOpen = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const sendBeacon = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, sendBeacon });

    const { container } = render(<MergeWorkspace />);
    selectFiles(container, [await validPdfFile('a.pdf'), await validPdfFile('b.pdf')]);
    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Merge \d+ Files/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Merge \d+ Files/i })).not.toBeDisabled());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrOpen).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('releases every tracked object URL when the workspace is reset', async () => {
    const { container } = render(<MergeWorkspace />);
    selectFiles(container, [await validPdfFile('a.pdf'), await validPdfFile('b.pdf')]);
    await waitFor(() => expect(screen.getByText('a.pdf')).toBeInTheDocument());

    // Stand in for URLs a download would have left outstanding.
    urlTracker.create(new Blob(['x']));
    urlTracker.create(new Blob(['y']));
    expect(urlTracker.size).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /reset|confirm|clear/i }));

    await waitFor(() => {
      expect(urlTracker.size).toBe(0);
    });
    expect(screen.queryByText('a.pdf')).not.toBeInTheDocument();
  });
});
