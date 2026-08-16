import React from 'react';
import { useHashRoute } from './router/HashRouter';
import { Header } from './components/common/Header';
import { Footer } from './components/common/Footer';
import { Dashboard } from './components/dashboard/Dashboard';
import { MergeWorkspace } from './components/workspaces/MergeWorkspace';
import { EditWorkspace } from './components/workspaces/EditWorkspace';
import { SplitWorkspace } from './components/workspaces/SplitWorkspace';
import { ConvertWorkspace } from './components/workspaces/ConvertWorkspace';
import { CompressWorkspace } from './components/workspaces/CompressWorkspace';
import { CropWorkspace } from './components/workspaces/CropWorkspace';
import { AddPagesWorkspace } from './components/workspaces/AddPagesWorkspace';

export const App: React.FC = () => {
  const [currentRoute, navigate] = useHashRoute();

  const renderActiveWorkspace = () => {
    switch (currentRoute) {
      case 'merge':
        return <MergeWorkspace />;
      case 'edit':
        return <EditWorkspace />;
      case 'split':
        return <SplitWorkspace />;
      case 'convert':
        return <ConvertWorkspace />;
      case 'compress':
        return <CompressWorkspace />;
      case 'crop':
        return <CropWorkspace />;
      case 'add-pages':
        return <AddPagesWorkspace />;
      case '':
      default:
        return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <>
      <Header currentRoute={currentRoute} onNavigate={navigate} />

      <main className="main-content app-container" id="main-content" tabIndex={-1}>
        {renderActiveWorkspace()}
      </main>

      <Footer />
    </>
  );
};

export default App;
