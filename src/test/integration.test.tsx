import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '../App';

describe('App Route Navigation & Workspaces Integration', () => {
  it('renders Dashboard overview on root hash', () => {
    window.location.hash = '#/';
    render(<App />);

    expect(screen.getByRole('heading', { name: /Fast, Private & In-Browser/i })).toBeInTheDocument();
    expect(screen.getByText(/Next-Gen Browser PDF Engine/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Merge PDFs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete & Reorder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Split PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Convert' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compress PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crop PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Pages' })).toBeInTheDocument();
  });

  it('navigates to Merge workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/merge';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Merge PDF Files' })).toBeInTheDocument();
    expect(screen.getByText(/Combine multiple PDF documents into one single file/i)).toBeInTheDocument();
  });

  it('navigates to Delete & Reorder workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/edit';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Delete & Reorder Pages' })).toBeInTheDocument();
    expect(screen.getByText(/Remove unwanted pages and rearrange the remaining pages visually/i)).toBeInTheDocument();
  });

  it('navigates to Split workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/split';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Split PDF Document' })).toBeInTheDocument();
    expect(screen.getByText(/Separate every page or specify custom ranges and groups/i)).toBeInTheDocument();
  });

  it('navigates to Convert workspace and allows tab switching', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/convert';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Convert Document & Images' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Images to PDF/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /PDF to Images/i })).toBeInTheDocument();

    expect(screen.getByRole('tab', { name: /PDF to Word.*Markdown/i })).toBeInTheDocument();

    // Click PDF to Images tab
    const pdfToImgTab = screen.getByRole('tab', { name: /PDF to Images/i });
    fireEvent.click(pdfToImgTab);
    expect(screen.getByText(/Extract PDF pages as PNG or JPEG images/i)).toBeInTheDocument();

    // Click PDF to Word / Markdown tab. Its call to action and its standing
    // privacy and limitation notices belong to the panel, not the workspace,
    // so seeing them here proves the third tab really renders that panel.
    fireEvent.click(screen.getByRole('tab', { name: /PDF to Word.*Markdown/i }));
    expect(screen.getByText(/Drop a text-based PDF here/i)).toBeInTheDocument();
    expect(screen.getByText(/No page, filename, or byte of the document is uploaded/i)).toBeInTheDocument();
    expect(screen.getByText(/figures.*omitted/i)).toBeInTheDocument();
    expect(screen.getByText(/not a layout-identical copy/i)).toBeInTheDocument();
    expect(screen.getByText(/needs OCR/i)).toBeInTheDocument();
  });

  it('navigates to Compress workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/compress';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Compress PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Compression changes document content/i)).toBeInTheDocument();
  });

  it('navigates to Crop workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/crop';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Crop PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Trim visible page areas while preserving vector content/i)).toBeInTheDocument();
  });

  it('navigates to Add Pages workspace on hash change', async () => {
    render(<App />);

    act(() => {
      window.location.hash = '#/add-pages';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(await screen.findByRole('heading', { name: 'Add Pages to PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Insert blank pages, imported PDF documents, or ordered images/i)).toBeInTheDocument();
  });
});
