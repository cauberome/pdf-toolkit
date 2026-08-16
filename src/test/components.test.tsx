import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dashboard } from '../components/dashboard/Dashboard';
import { Dropzone } from '../components/common/Dropzone';
import { OrderedFileList, FileListItem } from '../components/common/OrderedFileList';
import { Modal } from '../components/common/Modal';
import { CompressWorkspace } from '../components/workspaces/CompressWorkspace';
import { CropWorkspace } from '../components/workspaces/CropWorkspace';
import { AddPagesWorkspace } from '../components/workspaces/AddPagesWorkspace';

describe('UI Component Tests', () => {
  it('renders Dashboard with all 7 workspace cards and navigates on click', () => {
    const handleNavigate = vi.fn();
    render(<Dashboard onNavigate={handleNavigate} />);

    expect(screen.getByRole('heading', { name: 'Merge PDFs' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete & Reorder' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Split PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Convert' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Compress PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Crop PDF' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Pages' })).toBeInTheDocument();

    const mergeCard = screen.getByLabelText(/Open Merge PDFs/i);
    fireEvent.click(mergeCard);
    expect(handleNavigate).toHaveBeenCalledWith('merge');

    const compressCard = screen.getByLabelText(/Open Compress PDF/i);
    fireEvent.click(compressCard);
    expect(handleNavigate).toHaveBeenCalledWith('compress');

    const cropCard = screen.getByLabelText(/Open Crop PDF/i);
    fireEvent.click(cropCard);
    expect(handleNavigate).toHaveBeenCalledWith('crop');

    const addPagesCard = screen.getByLabelText(/Open Add Pages/i);
    fireEvent.click(addPagesCard);
    expect(handleNavigate).toHaveBeenCalledWith('add-pages');
  });

  it('Dropzone triggers file input click on enter key and displays text', () => {
    const handleFiles = vi.fn();
    render(
      <Dropzone
        onFilesSelected={handleFiles}
        title="Custom Dropzone Title"
        subtitle="Custom Subtitle"
      />
    );

    expect(screen.getByText('Custom Dropzone Title')).toBeInTheDocument();
    expect(screen.getByText('Custom Subtitle')).toBeInTheDocument();
  });

  it('OrderedFileList allows reordering up/down and removing files', () => {
    const handleReorder = vi.fn();
    const handleRemove = vi.fn();

    const files: FileListItem[] = [
      { id: '1', name: 'first.pdf', size: 1024, pageCount: 2 },
      { id: '2', name: 'second.pdf', size: 2048, pageCount: 5 },
    ];

    render(
      <OrderedFileList
        files={files}
        onReorder={handleReorder}
        onRemove={handleRemove}
      />
    );

    expect(screen.getByText('first.pdf')).toBeInTheDocument();
    expect(screen.getByText('second.pdf')).toBeInTheDocument();

    // Click remove on second file
    const removeBtn = screen.getByLabelText(/Remove second.pdf/i);
    fireEvent.click(removeBtn);
    expect(handleRemove).toHaveBeenCalledWith('2');

    // Click move up on second file
    const moveUpBtn = screen.getByLabelText(/Move second.pdf up/i);
    fireEvent.click(moveUpBtn);
    expect(handleReorder).toHaveBeenCalledWith([files[1], files[0]]);
  });

  it('Modal renders dialog and handles confirm/cancel events', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <Modal
        isOpen={true}
        title="Confirm Deletion"
        description="Are you sure you want to proceed?"
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Yes, Delete'));
    expect(handleConfirm).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(handleCancel).toHaveBeenCalled();
  });

  it('CompressWorkspace renders initial dropzone and permanent rasterization warning', () => {
    render(<CompressWorkspace />);
    expect(screen.getByRole('heading', { name: 'Compress PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Compressed pages are rasterized/i)).toBeInTheDocument();
  });

  it('CropWorkspace renders initial dropzone', () => {
    render(<CropWorkspace />);
    expect(screen.getByRole('heading', { name: 'Crop PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Trim visible page areas while preserving vector content/i)).toBeInTheDocument();
  });

  it('AddPagesWorkspace renders initial dropzone and title', () => {
    render(<AddPagesWorkspace />);
    expect(screen.getByRole('heading', { name: 'Add Pages to PDF' })).toBeInTheDocument();
    expect(screen.getByText(/Drop base PDF here or click to browse/i)).toBeInTheDocument();
  });
});
