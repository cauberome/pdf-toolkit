import React from 'react';
import { ShieldCheck, Layers, FileEdit, Scissors, Image as ImageIcon, Sparkles, Minimize2, Crop, FilePlus2 } from 'lucide-react';

interface HeaderProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentRoute, onNavigate }) => {
  const navItems = [
    { id: '', label: 'Overview', icon: Sparkles },
    { id: 'merge', label: 'Merge', icon: Layers },
    { id: 'edit', label: 'Delete / Reorder', icon: FileEdit },
    { id: 'split', label: 'Split', icon: Scissors },
    { id: 'convert', label: 'Convert', icon: ImageIcon },
    { id: 'compress', label: 'Compress', icon: Minimize2 },
    { id: 'crop', label: 'Crop', icon: Crop },
    { id: 'add-pages', label: 'Add Pages', icon: FilePlus2 },
  ];

  return (
    <header className="header-root" role="banner">
      <div className="app-container header-container">
        {/* Brand */}
        <button
          className="brand-logo"
          onClick={() => onNavigate('')}
          aria-label="PDF Toolkit Home"
        >
          <div className="logo-icon-wrapper">
            <span className="logo-text-gradient">PDF</span>
          </div>
          <div className="brand-text-block">
            <span className="brand-title">PDF Toolkit</span>
            <span className="brand-subtitle">Private • Browser-Only</span>
          </div>
        </button>

        {/* Navigation */}
        <nav className="header-nav" aria-label="Main Navigation">
          <ul className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentRoute === item.id;
              return (
                <li key={item.id}>
                  <button
                    className={`nav-link ${isActive ? 'active' : ''}`}
                    onClick={() => onNavigate(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon size={16} className="nav-icon" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Privacy Pill */}
        <div className="privacy-pill" title="Your documents are never uploaded to any server. All processing runs locally in your browser.">
          <ShieldCheck size={16} className="privacy-icon" aria-hidden="true" />
          <span className="privacy-text">100% Client-Side</span>
        </div>
      </div>

      <style>{`
        .header-root {
          background: rgba(9, 13, 22, 0.85);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .header-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 70px;
          gap: 1rem;
        }
        .brand-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-align: left;
          background: none;
          border: none;
          cursor: pointer;
        }
        .logo-icon-wrapper {
          width: 38px;
          height: 38px;
          border-radius: var(--radius-md);
          background: var(--gradient-brand);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-glow);
        }
        .logo-text-gradient {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 0.85rem;
          color: #ffffff;
          letter-spacing: -0.05em;
        }
        .brand-text-block {
          display: flex;
          flex-direction: column;
        }
        .brand-title {
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 1.15rem;
          color: var(--text-primary);
          line-height: 1.1;
        }
        .brand-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .header-nav {
          display: flex;
          align-items: center;
          /* A flex item defaults to min-width:auto, so it refuses to shrink
             below its content. Without this the eight-item nav pushes the whole
             page wider than the viewport instead of scrolling inside itself,
             and the overflow-x below never gets the chance to do anything.
             The responsive pass predates Compress, Crop, and Add Pages, which
             is what tipped the row over the edge on a phone. */
          min-width: 0;
          flex: 1 1 auto;
        }
        .nav-list {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          list-style: none;
          overflow-x: auto;
          scrollbar-width: thin;
          /* Same reason as above, one level down. */
          min-width: 0;
        }
        .nav-list > li {
          /* Keeps each button at its natural size once the row scrolls,
             rather than squashing them below a usable touch target. */
          flex: 0 0 auto;
        }
        .nav-link {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.45rem 0.85rem;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--text-secondary);
          transition: all var(--transition-fast);
          border: 1px solid transparent;
        }
        .nav-link:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.05);
        }
        .nav-link.active {
          color: #ffffff;
          background: rgba(99, 102, 241, 0.18);
          border-color: rgba(99, 102, 241, 0.4);
        }
        .nav-icon {
          color: var(--accent-cyan);
        }
        .privacy-pill {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.75rem;
          background: var(--accent-emerald-light);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: var(--radius-full);
          color: #6ee7b7;
          font-size: 0.78rem;
          font-weight: 600;
        }
        .privacy-icon {
          color: var(--accent-emerald);
        }
        @media (max-width: 1080px) {
          .nav-link span {
            display: none;
          }
          .nav-link {
            padding: 0.5rem;
          }
          .privacy-text {
            display: none;
          }
          .privacy-pill {
            padding: 0.4rem;
          }
        }
      `}</style>
    </header>
  );
};
