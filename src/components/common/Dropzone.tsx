import React, { useRef, useState } from 'react';
import { UploadCloud, FileType } from 'lucide-react';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: string;
  subtitle?: string;
  disabled?: boolean;
  id?: string;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFilesSelected,
  accept = '.pdf,application/pdf',
  multiple = false,
  title = 'Drop files here or click to browse',
  subtitle = 'PDF files only • Processed entirely on your machine',
  disabled = false,
  id = 'file-dropzone',
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      onFilesSelected(files);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onFilesSelected(files);
      // Reset input value so selecting the same file again triggers change
      e.target.value = '';
    }
  };

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      id={id}
      className={`dropzone-root ${isDragOver ? 'drag-over' : ''} ${disabled ? 'disabled' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label={`${title}. ${subtitle}`}
      aria-disabled={disabled}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="dropzone-icon-box">
        {isDragOver ? (
          <UploadCloud size={36} className="dropzone-icon animate-bounce" />
        ) : (
          <FileType size={36} className="dropzone-icon" />
        )}
      </div>

      <div className="dropzone-content">
        <p className="dropzone-title">{title}</p>
        <p className="dropzone-subtitle">{subtitle}</p>
      </div>

      <div className="dropzone-browse-badge">
        <span>Choose {multiple ? 'Files' : 'File'}</span>
      </div>

      <style>{`
        .dropzone-root {
          border: 2px dashed var(--border-strong);
          background: rgba(15, 23, 42, 0.45);
          border-radius: var(--radius-lg);
          padding: 3rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          text-align: center;
          cursor: pointer;
          transition: all var(--transition-normal);
          position: relative;
          outline: none;
        }
        .dropzone-root:hover:not(.disabled) {
          border-color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.06);
          transform: translateY(-2px);
        }
        .dropzone-root:focus-visible {
          border-color: var(--accent-cyan);
          box-shadow: var(--shadow-glow-cyan);
        }
        .dropzone-root.drag-over {
          border-color: var(--accent-cyan);
          background: rgba(6, 182, 212, 0.12);
          transform: scale(1.01);
          box-shadow: var(--shadow-glow-cyan);
        }
        .dropzone-root.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .dropzone-icon-box {
          width: 64px;
          height: 64px;
          border-radius: var(--radius-full);
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent-cyan);
          transition: transform var(--transition-fast);
        }
        .dropzone-root:hover:not(.disabled) .dropzone-icon-box {
          transform: scale(1.08);
          background: rgba(99, 102, 241, 0.2);
        }
        .dropzone-title {
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }
        .dropzone-subtitle {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .dropzone-browse-badge {
          display: inline-flex;
          padding: 0.45rem 1rem;
          font-size: 0.85rem;
          font-weight: 600;
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-primary);
          border: 1px solid var(--border-medium);
          transition: background var(--transition-fast);
        }
        .dropzone-root:hover:not(.disabled) .dropzone-browse-badge {
          background: rgba(99, 102, 241, 0.25);
          border-color: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </div>
  );
};
