import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { HistoricalFigure } from '../types';

interface FigureListProps {
  onSelectFigure: (id: number) => void;
}

const FigureRow = ({ figure, onSelect }: { figure: HistoricalFigure; onSelect: (id: number) => void }) => {
  const killCount = figure.kills?.length || 0;
  
  return (
    <div
      className="figure-row"
      onClick={() => onSelect(figure.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onSelect(figure.id);
        }
      }}
    >
      <span className="col-name" title={figure.name}>
        {figure.name}
      </span>
      <span className="col-race">{figure.race}</span>
      <span className="col-born">{figure.birthYear}</span>
      <span className="col-died">
        {figure.deathYear > 0 ? figure.deathYear : 'Alive'}
      </span>
      <span className={`col-kills ${killCount > 0 ? 'has-kills' : ''}`}>
        {killCount > 0 ? `⚔️ ${killCount}` : '-'}
      </span>
    </div>
  );
};

export const FigureList = ({ onSelectFigure }: FigureListProps) => {
  const [query, setQuery] = useState('');
  const [figures, setFigures] = useState<HistoricalFigure[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search effect
  useEffect(() => {
    const search = async () => {
      setLoading(true);
      
      // Import db dynamically to avoid circular dependencies
      const { db } = await import('../db/database');
      
      if (!query.trim()) {
        // Return top figures by kill count by default
        const allFigures = await db.figures.toArray();
        const sorted = allFigures
          .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))
          .slice(0, 500);
        setFigures(sorted);
      } else {
        const lowerQuery = query.toLowerCase();
        const results = await db.figures
          .filter(f => 
            f.name.toLowerCase().includes(lowerQuery) ||
            f.race.toLowerCase().includes(lowerQuery)
          )
          .limit(500)
          .toArray();
        setFigures(results);
      }
      
      setLoading(false);
    };

    const debounceTimer = setTimeout(search, 150);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '/' && document.activeElement !== inputRef.current) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  }, []);

  return (
    <div className="figure-list-container" onKeyDown={handleKeyDown}>
      <div className="search-bar">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search figures... (Press / to focus)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        {loading && <span className="search-loading">⟳</span>}
        <span className="search-count">
          {figures.length.toLocaleString()} figures
        </span>
      </div>

      <div className="figure-table-header">
        <span className="col-name">Name</span>
        <span className="col-race">Race</span>
        <span className="col-born">Born</span>
        <span className="col-died">Died</span>
        <span className="col-kills">Kills</span>
      </div>

      <div className="figure-table-body">
        {figures.map(figure => (
          <FigureRow 
            key={figure.id} 
            figure={figure} 
            onSelect={onSelectFigure} 
          />
        ))}
      </div>
    </div>
  );
};
