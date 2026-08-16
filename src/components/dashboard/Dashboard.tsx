import React from 'react';
import { Layers, FileEdit, Scissors, Image as ImageIcon, ArrowRight, ShieldCheck, Zap, Sparkles, Minimize2, Crop, FilePlus2 } from 'lucide-react';

interface DashboardProps {
  onNavigate: (route: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const tools = [
    {
      id: 'merge',
      title: 'Merge PDFs',
      description: 'Combine multiple PDF files into one clean document with custom order.',
      icon: Layers,
      badge: 'Multi-File',
      badgeColor: 'badge-primary',
      accentColor: '#6366f1',
    },
    {
      id: 'edit',
      title: 'Delete & Reorder',
      description: 'Visual page editor to remove unwanted pages and rearrange page sequence.',
      icon: FileEdit,
      badge: 'Visual Grid',
      badgeColor: 'badge-cyan',
      accentColor: '#06b6d4',
    },
    {
      id: 'split',
      title: 'Split PDF',
      description: 'Split every page into separate files or create custom grouped extracts.',
      icon: Scissors,
      badge: 'Expression Parser',
      badgeColor: 'badge-emerald',
      accentColor: '#10b981',
    },
    {
      id: 'convert',
      title: 'Convert',
      description: 'Convert JPG, PNG, or WebP images to PDF, or export PDF pages as PNG/JPEG.',
      icon: ImageIcon,
      badge: 'Two-Way',
      badgeColor: 'badge-amber',
      accentColor: '#f59e0b',
    },
    {
      id: 'compress',
      title: 'Compress PDF',
      description: 'Reduce PDF size automatically or aim for a preferred output size.',
      icon: Minimize2,
      badge: 'Best Effort',
      badgeColor: 'badge-rose',
      accentColor: '#f43f5e',
    },
    {
      id: 'crop',
      title: 'Crop PDF',
      description: 'Visually trim page margins on selected pages while preserving vector content.',
      icon: Crop,
      badge: 'Visual Crop',
      badgeColor: 'badge-cyan',
      accentColor: '#8b5cf6',
    },
    {
      id: 'add-pages',
      title: 'Add Pages',
      description: 'Insert blank pages, another PDF, or ordered images anywhere in a document.',
      icon: FilePlus2,
      badge: '3 Sources',
      badgeColor: 'badge-emerald',
      accentColor: '#14b8a6',
    },
  ];

  return (
    <div className="dashboard-root">
      {/* Hero Section */}
      <section className="hero-section" aria-labelledby="hero-title">
        <div className="hero-badge">
          <Sparkles size={14} className="hero-sparkle" />
          <span>Next-Gen Browser PDF Engine</span>
        </div>

        <h1 id="hero-title" className="hero-title">
          Fast, Private & In-Browser <br />
          <span className="hero-title-gradient">PDF Toolkit</span>
        </h1>

        <p className="hero-subtitle">
          Merge, edit, split, convert, compress, crop, and extend PDF documents locally.
          Zero server uploads, zero accounts, and 100% private.
        </p>

        <div className="hero-stats">
          <div className="stat-pill">
            <ShieldCheck size={16} className="text-emerald" />
            <span>Files Never Leave Your Device</span>
          </div>
          <div className="stat-pill">
            <Zap size={16} className="text-cyan" />
            <span>Instant Local Processing</span>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="tools-section" aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="sr-only">Available PDF Tools</h2>

        <div className="tools-grid">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div
                key={tool.id}
                className="tool-card glass-panel glass-panel-interactive"
                onClick={() => onNavigate(tool.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate(tool.id);
                  }
                }}
                aria-label={`Open ${tool.title}: ${tool.description}`}
              >
                <div className="tool-card-top">
                  <div
                    className="tool-icon-wrapper"
                    style={{ background: `${tool.accentColor}20`, borderColor: `${tool.accentColor}40` }}
                  >
                    <Icon size={26} style={{ color: tool.accentColor }} />
                  </div>
                  <span className={`badge ${tool.badgeColor}`}>{tool.badge}</span>
                </div>

                <h3 className="tool-title">{tool.title}</h3>
                <p className="tool-desc">{tool.description}</p>

                <div className="tool-card-footer">
                  <span className="tool-launch-text">Launch workspace</span>
                  <ArrowRight size={16} className="tool-arrow" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <style>{`
        .dashboard-root {
          display: flex;
          flex-direction: column;
          gap: 3.5rem;
        }
        .hero-section {
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2.5rem 0 1rem;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.9rem;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: var(--radius-full);
          font-size: 0.82rem;
          font-weight: 600;
          color: #a5b4fc;
          margin-bottom: 1.5rem;
        }
        .hero-sparkle {
          color: var(--accent-cyan);
        }
        .hero-title {
          font-size: 2.75rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.15;
          margin-bottom: 1.25rem;
        }
        @media (min-width: 768px) {
          .hero-title {
            font-size: 3.75rem;
          }
        }
        .hero-title-gradient {
          background: var(--gradient-brand);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-subtitle {
          font-size: 1.15rem;
          color: var(--text-secondary);
          max-width: 680px;
          line-height: 1.6;
          margin-bottom: 2rem;
        }
        .hero-stats {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .stat-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-full);
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-secondary);
        }
        .tools-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1.5rem;
        }
        .tool-card {
          padding: 2rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          outline: none;
          position: relative;
        }
        .tool-card:focus-visible {
          border-color: var(--accent-cyan);
          box-shadow: var(--shadow-glow-cyan);
        }
        .tool-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .tool-icon-wrapper {
          width: 52px;
          height: 52px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tool-title {
          font-size: 1.35rem;
          margin-bottom: 0.6rem;
          color: var(--text-primary);
        }
        .tool-desc {
          font-size: 0.9rem;
          color: var(--text-muted);
          line-height: 1.5;
          margin-bottom: 1.75rem;
          flex: 1;
        }
        .tool-card-footer {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.88rem;
          font-weight: 600;
          color: var(--accent-cyan);
          transition: transform var(--transition-fast);
        }
        .tool-card:hover .tool-arrow {
          transform: translateX(4px);
        }
        .tool-arrow {
          transition: transform var(--transition-fast);
        }
      `}</style>
    </div>
  );
};
