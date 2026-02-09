import { useState, useEffect, useCallback } from 'react';
import { db, checkStorage } from '../db/database';
import type { HistoricalFigure, WorldMetadata } from '../types';

export function useWorldData() {
  const [hasData, setHasData] = useState<boolean>(false);
  const [metadata, setMetadata] = useState<WorldMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkData = async () => {
      const dataExists = await db.hasData();
      setHasData(dataExists);
      
      if (dataExists) {
        const meta = await db.getMetadata();
        if (meta) {
          setMetadata(meta);
        }
      }
      
      setLoading(false);
    };

    checkData();
  }, []);

  const clearWorld = useCallback(async () => {
    await db.clearAll();
    setHasData(false);
    setMetadata(null);
  }, []);

  const refreshData = useCallback(async () => {
    const dataExists = await db.hasData();
    setHasData(dataExists);
    
    if (dataExists) {
      const meta = await db.getMetadata();
      if (meta) {
        setMetadata(meta);
      }
    }
  }, []);

  return {
    hasData,
    metadata,
    loading,
    clearWorld,
    refreshData,
  };
}

export function useFigure(figureId: number | null) {
  const [figure, setFigure] = useState<HistoricalFigure | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (figureId === null) {
      setFigure(null);
      return;
    }

    setLoading(true);
    db.figures.get(figureId).then(f => {
      setFigure(f || null);
      setLoading(false);
    });
  }, [figureId]);

  return { figure, loading };
}

export function useFigureSearch(query: string, limit = 100) {
  const [figures, setFigures] = useState<HistoricalFigure[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      
      if (!query.trim()) {
        // Return top figures by kill count by default
        const allFigures = await db.figures.toArray();
        const sorted = allFigures
          .sort((a, b) => (b.kills?.length || 0) - (a.kills?.length || 0))
          .slice(0, limit);
        setFigures(sorted);
      } else {
        const lowerQuery = query.toLowerCase();
        const results = await db.figures
          .filter(f => 
            f.name.toLowerCase().includes(lowerQuery) ||
            f.race.toLowerCase().includes(lowerQuery)
          )
          .limit(limit)
          .toArray();
        setFigures(results);
      }
      
      setLoading(false);
    };

    const debounceTimer = setTimeout(search, 150);
    return () => clearTimeout(debounceTimer);
  }, [query, limit]);

  return { figures, loading };
}

export function useStorageGuard() {
  const [warning, setWarning] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    checkStorage().then(result => {
      if (!result.ok && result.warning) {
        setWarning(result.warning);
      }
      setChecked(true);
    });
  }, []);

  return { warning, checked };
}

export function useParsingGuard(isParsing: boolean) {
  useEffect(() => {
    if (!isParsing) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Closing may corrupt data storage. Are you sure you want to leave?';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isParsing]);
}
