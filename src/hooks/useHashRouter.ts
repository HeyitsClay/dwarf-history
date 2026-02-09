import { useState, useEffect, useCallback } from 'react';
import type { ViewState } from '../types';

export function useHashRouter() {
  const [view, setView] = useState<ViewState>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => {
      setView(parseHash(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((newView: ViewState) => {
    const hash = viewToHash(newView);
    window.location.hash = hash;
  }, []);

  const navigateToFigure = useCallback((id: number) => {
    navigate({ type: 'figure', id });
  }, [navigate]);

  const navigateToSite = useCallback((id: number) => {
    navigate({ type: 'site', id });
  }, [navigate]);

  const navigateToEntity = useCallback((id: number) => {
    navigate({ type: 'entity', id });
  }, [navigate]);

  const navigateToList = useCallback(() => {
    navigate({ type: 'list' });
  }, [navigate]);

  const navigateToUpload = useCallback(() => {
    navigate({ type: 'upload' });
  }, [navigate]);

  return {
    view,
    navigate,
    navigateToFigure,
    navigateToSite,
    navigateToEntity,
    navigateToList,
    navigateToUpload,
  };
}

function parseHash(hash: string): ViewState {
  if (!hash || hash === '#') {
    return { type: 'upload' };
  }

  const cleanHash = hash.replace(/^#/, '');
  const parts = cleanHash.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { type: 'upload' };
  }

  switch (parts[0]) {
    case 'figure':
      return { type: 'figure', id: parseInt(parts[1], 10) || 0 };
    case 'site':
      return { type: 'site', id: parseInt(parts[1], 10) || 0 };
    case 'entity':
      return { type: 'entity', id: parseInt(parts[1], 10) || 0 };
    case 'list':
      return { type: 'list' };
    case 'upload':
      return { type: 'upload' };
    default:
      return { type: 'upload' };
  }
}

function viewToHash(view: ViewState): string {
  switch (view.type) {
    case 'figure':
      return `#/figure/${view.id}`;
    case 'site':
      return `#/site/${view.id}`;
    case 'entity':
      return `#/entity/${view.id}`;
    case 'list':
      return '#/list';
    case 'upload':
      return '#/upload';
    case 'parsing':
      return '#/parsing';
    default:
      return '#/';
  }
}
