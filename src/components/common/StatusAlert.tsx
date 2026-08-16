import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type AlertType = 'error' | 'success' | 'warning' | 'info';

interface StatusAlertProps {
  type: AlertType;
  message: string;
  title?: string;
  onDismiss?: () => void;
}

export const StatusAlert: React.FC<StatusAlertProps> = ({
  type,
  message,
  title,
  onDismiss,
}) => {
  const getIcon = () => {
    switch (type) {
      case 'error':
        return <AlertCircle size={20} className="alert-icon text-rose" />;
      case 'success':
        return <CheckCircle size={20} className="alert-icon text-emerald" />;
      case 'warning':
        return <AlertTriangle size={20} className="alert-icon text-amber" />;
      case 'info':
      default:
        return <Info size={20} className="alert-icon text-cyan" />;
    }
  };

  return (
    <div
      className={`alert-root alert-${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="alert-icon-container">
        {getIcon()}
      </div>

      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        <p className="alert-message">{message}</p>
      </div>

      {onDismiss && (
        <button
          className="alert-dismiss-btn"
          onClick={onDismiss}
          aria-label="Dismiss message"
        >
          <X size={16} />
        </button>
      )}

      <style>{`
        .alert-root {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          padding: 1rem 1.25rem;
          border-radius: var(--radius-md);
          margin: 1rem 0;
          backdrop-filter: blur(8px);
          animation: fadeIn 0.25s ease-out;
        }
        .alert-error {
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fecdd3;
        }
        .alert-success {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #a7f3d0;
        }
        .alert-warning {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.35);
          color: #fde68a;
        }
        .alert-info {
          background: rgba(6, 182, 212, 0.12);
          border: 1px solid rgba(6, 182, 212, 0.35);
          color: #cffafe;
        }
        .alert-icon-container {
          flex-shrink: 0;
          margin-top: 0.1rem;
        }
        .text-rose { color: var(--accent-rose); }
        .text-emerald { color: var(--accent-emerald); }
        .text-amber { color: var(--accent-amber); }
        .text-cyan { color: var(--accent-cyan); }
        .alert-body {
          flex: 1;
        }
        .alert-title {
          font-weight: 700;
          font-size: 0.92rem;
          margin-bottom: 0.2rem;
          color: #ffffff;
        }
        .alert-message {
          font-size: 0.85rem;
          line-height: 1.4;
          color: inherit;
        }
        .alert-dismiss-btn {
          background: none;
          border: none;
          color: inherit;
          opacity: 0.7;
          cursor: pointer;
          padding: 0.2rem;
          border-radius: var(--radius-sm);
        }
        .alert-dismiss-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
};
