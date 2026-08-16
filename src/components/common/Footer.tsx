import React from 'react';
import { ShieldCheck, Cpu, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-root" role="contentinfo">
      <div className="app-container footer-container">
        <div className="footer-grid">
          <div className="footer-card">
            <ShieldCheck className="footer-card-icon" size={20} />
            <div>
              <h4 className="footer-card-title">100% Client-Side Privacy</h4>
              <p className="footer-card-desc">
                Your documents stay on your device. Zero bytes, analytics, or metadata are ever transmitted to any server.
              </p>
            </div>
          </div>

          <div className="footer-card">
            <Cpu className="footer-card-icon" size={20} />
            <div>
              <h4 className="footer-card-title">Fast WebAssembly Engine</h4>
              <p className="footer-card-desc">
                Powered by pdf-lib, PDF.js, and browser Web Workers for responsive, background-threaded processing.
              </p>
            </div>
          </div>

          <div className="footer-card">
            <Lock className="footer-card-icon" size={20} />
            <div>
              <h4 className="footer-card-title">No Limits & No Accounts</h4>
              <p className="footer-card-desc">
                Free, private document utilities with no login required, no rate limits, and zero tracking.
              </p>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">
            PDF Toolkit • Built for privacy, speed, and reliability in the browser.
          </p>
        </div>
      </div>

      <style>{`
        .footer-root {
          background: rgba(10, 15, 26, 0.95);
          border-top: 1px solid var(--border-subtle);
          padding: 3rem 0 2rem;
          margin-top: auto;
        }
        .footer-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2.5rem;
        }
        .footer-card {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.25rem;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-subtle);
          border-radius: var(--radius-md);
        }
        .footer-card-icon {
          color: var(--accent-cyan);
          flex-shrink: 0;
          margin-top: 0.15rem;
        }
        .footer-card-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }
        .footer-card-desc {
          font-size: 0.82rem;
          color: var(--text-muted);
          line-height: 1.45;
        }
        .footer-bottom {
          text-align: center;
          padding-top: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .footer-copy {
          font-size: 0.8rem;
          color: var(--text-dim);
        }
      `}</style>
    </footer>
  );
};
