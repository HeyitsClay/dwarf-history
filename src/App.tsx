import { useEffect, useState } from 'react';
import { useHashRouter } from './hooks/useHashRouter';
import { useWorldData, useParsingGuard, useStorageGuard } from './hooks/useWorldData';
import { UploadZone } from './components/UploadZone';
import { Overview } from './components/Overview';
import './App.css';

function App() {
  console.log('App: Rendering...');
  try {
    const { view, navigate, navigateToFigure, navigateToUpload } = useHashRouter();
    const { hasData, metadata, loading, clearWorld, refreshData } = useWorldData();
    const { warning, checked } = useStorageGuard();
    const [isParsing, setIsParsing] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    
    console.log('App: Hooks loaded, view type:', view.type);

    // Redirect to overview if we have data and are on upload
    useEffect(() => {
      if (!loading && hasData && view.type === 'upload') {
        navigate({ type: 'overview' });
      }
    }, [loading, hasData, view.type, navigate]);

    useParsingGuard(isParsing);

    const handleUploadComplete = () => {
      setIsParsing(false);
      refreshData().then(() => {
        navigate({ type: 'overview' });
      });
    };

    const handleClearWorld = async () => {
      if (confirm('Are you sure you want to clear all world data and load a new world?')) {
        setIsClearing(true);
        // Small delay to let UI update
        await new Promise(r => setTimeout(r, 100));
        await clearWorld();
        navigateToUpload();
        setIsClearing(false);
      }
    };

    const renderContent = () => {
      if (view.type === 'parsing' || isParsing || isClearing) {
        return (
          <div className="parsing-screen">
            <h2>{isClearing ? 'Clearing World Data...' : 'Processing Legends File...'}</h2>
            <p>{isClearing ? 'Please wait while we clear the current world.' : 'This may take a moment for large worlds.'}</p>
          </div>
        );
      }

      switch (view.type) {
        case 'upload':
          return (
            <UploadZone
              onComplete={handleUploadComplete}
              existingData={hasData}
            />
          );
        
        case 'overview':
        case 'list': // Fallback for old links
          return (
            <Overview
              onViewFigures={() => {}}
              onViewFigure={navigateToFigure}
              onNewWorld={() => navigateToUpload()}
            />
          );
        
        default:
          return <UploadZone onComplete={handleUploadComplete} existingData={hasData} />;
      }
    };

    return (
      <div className="app">
        <header className="app-header">
          <h1 onClick={() => navigate({ type: 'overview' })} style={{ cursor: 'pointer' }}>
            ⚒️ Dwarf History
          </h1>
          {metadata && (
          <div className="world-info">
            <span className="world-name">{metadata.name}</span>
          </div>
        )}
          <div className="header-actions">
            {hasData && (
              <button 
                className="btn-header" 
                onClick={handleClearWorld} 
                title="Load new world"
                disabled={isClearing}
              >
                {isClearing ? '⏳ Clearing...' : '📜 New World'}
              </button>
            )}
          </div>
        </header>

        {warning && checked && (
          <div className="storage-warning">
            ⚠️ {warning}
          </div>
        )}

        <main className="app-main">
          {renderContent()}
        </main>

        <footer className="app-footer">
          <p>
            Dwarf History Viewer • 
            <a href="https://github.com/HeyitsClay/dwarf-history" target="_blank" rel="noopener noreferrer">GitHub</a>
          </p>
        </footer>
      </div>
    );
  } catch (error) {
    console.error('App render error:', error);
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#c0c0c0',
        fontFamily: "'Courier New', monospace",
        padding: '2rem',
      }}>
        <h1 style={{ color: '#e76f51' }}>⚠️ App Error</h1>
        <pre style={{ color: '#d4a373', maxWidth: '600px', overflow: 'auto' }}>
          {error instanceof Error ? error.stack : String(error)}
        </pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: '1rem' }}>
          Reload Page
        </button>
      </div>
    );
  }
}

export default App;
