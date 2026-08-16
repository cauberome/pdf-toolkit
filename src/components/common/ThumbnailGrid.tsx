import React, { useState } from 'react';
import { Check, X, ArrowLeft, ArrowRight, GripHorizontal } from 'lucide-react';
import { PageThumbnail } from '../../engine/types';

export interface PageItem {
  id: string; // unique ID for key
  originalIndex: number; // 0-based
  pageNumber: number; // 1-based original
  thumbnail?: PageThumbnail;
  selected: boolean; // true = keep, false = delete/skip
}

interface ThumbnailGridProps {
  pages: PageItem[];
  onToggleSelect: (id: string) => void;
  onReorder: (newPages: PageItem[]) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onInvertSelection?: () => void;
  mode?: 'delete-reorder' | 'select-only';
}

export const ThumbnailGrid: React.FC<ThumbnailGridProps> = ({
  pages,
  onToggleSelect,
  onReorder,
  onSelectAll,
  onDeselectAll,
  onInvertSelection,
  mode = 'delete-reorder',
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const moveLeft = (index: number) => {
    if (index <= 0) return;
    const newPages = [...pages];
    const item = newPages.splice(index, 1)[0];
    newPages.splice(index - 1, 0, item);
    onReorder(newPages);
  };

  const moveRight = (index: number) => {
    if (index >= pages.length - 1) return;
    const newPages = [...pages];
    const item = newPages.splice(index, 1)[0];
    newPages.splice(index + 1, 0, item);
    onReorder(newPages);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newPages = [...pages];
    const item = newPages.splice(draggedIndex, 1)[0];
    newPages.splice(dropIndex, 0, item);
    setDraggedIndex(null);
    onReorder(newPages);
  };

  const keptCount = pages.filter(p => p.selected).length;

  return (
    <div className="thumbnail-grid-root" role="region" aria-label="Page thumbnail grid">
      {/* Top toolbar */}
      <div className="grid-toolbar">
        <div className="grid-counts">
          <span className="count-badge">
            Keeping <strong>{keptCount}</strong> of <strong>{pages.length}</strong> pages
          </span>
          {keptCount === 0 && (
            <span className="warning-pill">
              At least 1 page must be kept
            </span>
          )}
        </div>

        <div className="grid-selection-actions">
          {onSelectAll && (
            <button className="btn btn-ghost btn-xs" onClick={onSelectAll} type="button">
              Select All
            </button>
          )}
          {onDeselectAll && (
            <button className="btn btn-ghost btn-xs" onClick={onDeselectAll} type="button">
              Deselect All
            </button>
          )}
          {onInvertSelection && (
            <button className="btn btn-ghost btn-xs" onClick={onInvertSelection} type="button">
              Invert
            </button>
          )}
        </div>
      </div>

      {/* Grid container */}
      <div className="grid-container" role="list">
        {pages.map((page, index) => {
          const isKept = page.selected;
          const isFirst = index === 0;
          const isLast = index === pages.length - 1;
          const isDragging = draggedIndex === index;

          return (
            <div
              key={page.id}
              className={`page-card ${isKept ? 'is-kept' : 'is-deleted'} ${isDragging ? 'is-dragging' : ''}`}
              draggable={mode === 'delete-reorder'}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={() => setDraggedIndex(null)}
              role="listitem"
            >
              {/* Card Header */}
              <div className="page-card-header">
                <span className="page-badge">
                  Page {page.pageNumber}
                </span>

                <button
                  type="button"
                  className={`status-toggle-btn ${isKept ? 'toggle-keep' : 'toggle-delete'}`}
                  onClick={() => onToggleSelect(page.id)}
                  aria-label={`${isKept ? 'Exclude' : 'Include'} page ${page.pageNumber}`}
                  title={isKept ? 'Click to remove page' : 'Click to keep page'}
                >
                  {isKept ? (
                    <>
                      <Check size={13} />
                      <span>Keep</span>
                    </>
                  ) : (
                    <>
                      <X size={13} />
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>

              {/* Thumbnail preview */}
              <div
                className="thumbnail-view"
                onClick={() => onToggleSelect(page.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggleSelect(page.id);
                  }
                }}
                aria-label={`Page ${page.pageNumber} preview. Currently ${isKept ? 'Kept' : 'Marked for deletion'}. Press space to toggle.`}
              >
                {page.thumbnail?.dataUrl ? (
                  <img
                    src={page.thumbnail.dataUrl}
                    alt={`Preview of page ${page.pageNumber}`}
                    className="thumbnail-img"
                    loading="lazy"
                  />
                ) : (
                  <div className="thumbnail-placeholder">
                    <span>Rendering...</span>
                  </div>
                )}

                {!isKept && (
                  <div className="deleted-overlay">
                    <div className="deleted-banner">
                      <X size={18} />
                      <span>Removed</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer / Reorder controls */}
              {mode === 'delete-reorder' && (
                <div className="page-card-footer">
                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveLeft(index)}
                    disabled={isFirst}
                    title="Move page left"
                    aria-label={`Move page ${page.pageNumber} left`}
                  >
                    <ArrowLeft size={14} />
                  </button>

                  <span className="drag-indicator" title="Drag to reorder">
                    <GripHorizontal size={14} />
                  </span>

                  <button
                    type="button"
                    className="reorder-btn"
                    onClick={() => moveRight(index)}
                    disabled={isLast}
                    title="Move page right"
                    aria-label={`Move page ${page.pageNumber} right`}
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        .thumbnail-grid-root {
          margin-top: 1.5rem;
        }
        .grid-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.25rem;
          padding: 0.75rem 1rem;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .grid-counts {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .count-badge {
          font-size: 0.9rem;
          color: var(--text-secondary);
        }
        .warning-pill {
          font-size: 0.75rem;
          font-weight: 600;
          color: #fda4af;
          background: var(--accent-rose-light);
          padding: 0.2rem 0.6rem;
          border-radius: var(--radius-full);
          border: 1px solid rgba(244, 63, 94, 0.4);
        }
        .grid-selection-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .btn-xs {
          padding: 0.35rem 0.65rem;
          font-size: 0.8rem;
        }
        .grid-container {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 1.25rem;
        }
        .page-card {
          background: var(--bg-card);
          border: 2px solid var(--border-medium);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: all var(--transition-fast);
          position: relative;
        }
        .page-card:hover {
          border-color: var(--border-accent);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }
        .page-card.is-kept {
          border-color: rgba(99, 102, 241, 0.4);
        }
        .page-card.is-deleted {
          opacity: 0.6;
          border-color: rgba(244, 63, 94, 0.4);
          background: rgba(244, 63, 94, 0.04);
        }
        .page-card.is-dragging {
          opacity: 0.3;
          border-style: dashed;
        }
        .page-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.65rem;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid var(--border-subtle);
        }
        .page-badge {
          font-size: 0.75rem;
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--text-primary);
        }
        .status-toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          border-radius: var(--radius-full);
          font-size: 0.72rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition-fast);
        }
        .toggle-keep {
          background: var(--accent-emerald-light);
          color: #6ee7b7;
          border: 1px solid rgba(16, 185, 129, 0.4);
        }
        .toggle-keep:hover {
          background: rgba(16, 185, 129, 0.3);
        }
        .toggle-delete {
          background: var(--accent-rose-light);
          color: #fda4af;
          border: 1px solid rgba(244, 63, 94, 0.4);
        }
        .toggle-delete:hover {
          background: rgba(244, 63, 94, 0.3);
        }
        .thumbnail-view {
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          position: relative;
          cursor: pointer;
          overflow: hidden;
          padding: 0.5rem;
        }
        .thumbnail-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .thumbnail-placeholder {
          color: var(--text-dim);
          font-size: 0.85rem;
        }
        .deleted-overlay {
          position: absolute;
          inset: 0;
          background: rgba(15, 23, 42, 0.7);
          backdrop-filter: blur(2px);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .deleted-banner {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem 0.85rem;
          background: #e11d48;
          color: #ffffff;
          border-radius: var(--radius-sm);
          font-weight: 700;
          font-size: 0.8rem;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }
        .page-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.4rem 0.65rem;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid var(--border-subtle);
        }
        .reorder-btn {
          width: 26px;
          height: 26px;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
        }
        .reorder-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.15);
          color: var(--text-primary);
        }
        .reorder-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }
        .drag-indicator {
          color: var(--text-dim);
          cursor: grab;
          display: flex;
          align-items: center;
        }
      `}</style>
    </div>
  );
};
