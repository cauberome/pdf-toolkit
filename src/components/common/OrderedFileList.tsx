import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, GripVertical, FileText, CheckCircle } from 'lucide-react';
import { formatFileSize } from '../../engine/validation';

export interface FileListItem {
  id: string;
  name: string;
  size: number;
  pageCount?: number;
  status?: 'ready' | 'loading' | 'error';
}

interface OrderedFileListProps {
  files: FileListItem[];
  onReorder: (newFiles: FileListItem[]) => void;
  onRemove: (id: string) => void;
}

export const OrderedFileList: React.FC<OrderedFileListProps> = ({
  files,
  onReorder,
  onRemove,
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const newFiles = [...files];
    const item = newFiles.splice(index, 1)[0];
    newFiles.splice(index - 1, 0, item);
    onReorder(newFiles);
  };

  const moveDown = (index: number) => {
    if (index >= files.length - 1) return;
    const newFiles = [...files];
    const item = newFiles.splice(index, 1)[0];
    newFiles.splice(index + 1, 0, item);
    onReorder(newFiles);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newFiles = [...files];
    const item = newFiles.splice(draggedIndex, 1)[0];
    newFiles.splice(dropIndex, 0, item);
    setDraggedIndex(null);
    onReorder(newFiles);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="file-list-root" role="region" aria-label="Selected files to merge or convert">
      <div className="file-list-header">
        <span className="file-list-count">
          {files.length} {files.length === 1 ? 'file' : 'files'} selected
        </span>
        <span className="file-list-hint">Drag or use arrow buttons to reorder</span>
      </div>

      <ul className="file-list-items" role="list">
        {files.map((file, index) => {
          const isFirst = index === 0;
          const isLast = index === files.length - 1;
          const isDragging = draggedIndex === index;

          return (
            <li
              key={file.id}
              className={`file-item ${isDragging ? 'is-dragging' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
            >
              <div className="file-drag-handle" title="Drag to reorder" aria-hidden="true">
                <GripVertical size={16} />
              </div>

              <div className="file-index-badge">
                #{index + 1}
              </div>

              <div className="file-icon-box" aria-hidden="true">
                <FileText size={20} />
              </div>

              <div className="file-info">
                <p className="file-name" title={file.name}>
                  {file.name}
                </p>
                <div className="file-meta">
                  <span>{formatFileSize(file.size)}</span>
                  {typeof file.pageCount === 'number' && (
                    <>
                      <span>•</span>
                      <span>{file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}</span>
                    </>
                  )}
                  <span className="file-ready-tag">
                    <CheckCircle size={12} /> Ready
                  </span>
                </div>
              </div>

              <div className="file-actions">
                <button
                  className="file-action-btn"
                  onClick={() => moveUp(index)}
                  disabled={isFirst}
                  aria-label={`Move ${file.name} up`}
                  title="Move up"
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  className="file-action-btn"
                  onClick={() => moveDown(index)}
                  disabled={isLast}
                  aria-label={`Move ${file.name} down`}
                  title="Move down"
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  className="file-action-btn delete-btn"
                  onClick={() => onRemove(file.id)}
                  aria-label={`Remove ${file.name}`}
                  title="Remove file"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <style>{`
        .file-list-root {
          margin-top: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .file-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 0.25rem;
        }
        .file-list-count {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .file-list-hint {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .file-list-items {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .file-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
          transition: all var(--transition-fast);
          cursor: grab;
        }
        .file-item:hover {
          border-color: var(--border-accent);
          background: var(--bg-card-hover);
        }
        .file-item.is-dragging {
          opacity: 0.4;
          border-style: dashed;
        }
        .file-drag-handle {
          color: var(--text-dim);
          display: flex;
          align-items: center;
        }
        .file-index-badge {
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--accent-cyan);
          background: var(--accent-cyan-light);
          padding: 0.2rem 0.45rem;
          border-radius: var(--radius-sm);
        }
        .file-icon-box {
          color: var(--accent-primary);
          display: flex;
          align-items: center;
        }
        .file-info {
          flex: 1;
          min-width: 0;
        }
        .file-name {
          font-size: 0.92rem;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .file-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.15rem;
        }
        .file-ready-tag {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: var(--accent-emerald);
          font-weight: 500;
        }
        .file-actions {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .file-action-btn {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
          transition: all var(--transition-fast);
        }
        .file-action-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.12);
          color: var(--text-primary);
        }
        .file-action-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        .file-action-btn.delete-btn:hover:not(:disabled) {
          background: var(--accent-rose-light);
          color: var(--accent-rose);
          border-color: rgba(244, 63, 94, 0.4);
        }
      `}</style>
    </div>
  );
};
