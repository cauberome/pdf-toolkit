import React from 'react';

interface ProgressBarProps {
  percentage: number;
  message?: string;
  isIndeterminate?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  percentage,
  message = 'Processing...',
  isIndeterminate = false,
}) => {
  const clamped = Math.min(100, Math.max(0, percentage));

  return (
    <div
      className="progress-root"
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={message}
    >
      <div className="progress-header">
        <span className="progress-message">{message}</span>
        {!isIndeterminate && (
          <span className="progress-percent">{Math.round(clamped)}%</span>
        )}
      </div>

      <div className="progress-track">
        <div
          className={`progress-fill ${isIndeterminate ? 'indeterminate' : ''}`}
          style={{ width: isIndeterminate ? '40%' : `${clamped}%` }}
        />
      </div>

      <style>{`
        .progress-root {
          width: 100%;
          margin: 1.25rem 0;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          font-size: 0.85rem;
        }
        .progress-message {
          font-weight: 500;
          color: var(--text-secondary);
        }
        .progress-percent {
          font-family: var(--font-mono);
          font-weight: 700;
          color: var(--accent-cyan);
        }
        .progress-track {
          width: 100%;
          height: 8px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: var(--radius-full);
          overflow: hidden;
          position: relative;
        }
        .progress-fill {
          height: 100%;
          background: var(--gradient-brand);
          border-radius: var(--radius-full);
          transition: width 200ms ease-out;
          box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
        }
        .progress-fill.indeterminate {
          position: absolute;
          animation: progressIndeterminate 1.5s infinite linear;
        }
        @keyframes progressIndeterminate {
          0% { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};
