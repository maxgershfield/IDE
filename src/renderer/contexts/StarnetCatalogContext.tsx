import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OAPPRecord, StarHolonRecord } from '../services/starApiService';
import { useAuth } from './AuthContext';

export interface StarnetCatalogSnapshot {
  holonCatalogRows: StarHolonRecord[];
  oapps: OAPPRecord[];
  baseUrl: string;
  apiReady: boolean;
  loggedIn: boolean;
}

interface StarnetCatalogContextValue {
  snapshot: StarnetCatalogSnapshot | null;
  setStarnetCatalogSnapshot: (s: StarnetCatalogSnapshot | null) => void;
}

const StarnetCatalogContext = createContext<StarnetCatalogContextValue | null>(null);

export function StarnetCatalogProvider({ children }: { children: React.ReactNode }) {
  const { loggedIn } = useAuth();
  const [snapshot, setSnapshot] = useState<StarnetCatalogSnapshot | null>(null);
  const setStarnetCatalogSnapshot = useCallback((s: StarnetCatalogSnapshot | null) => {
    setSnapshot(s);
  }, []);

  useEffect(() => {
    if (!loggedIn) setSnapshot(null);
  }, [loggedIn]);

  const value = useMemo(
    () => ({ snapshot, setStarnetCatalogSnapshot }),
    [snapshot, setStarnetCatalogSnapshot]
  );

  return (
    <StarnetCatalogContext.Provider value={value}>{children}</StarnetCatalogContext.Provider>
  );
}

export function useStarnetCatalog(): StarnetCatalogContextValue {
  const ctx = useContext(StarnetCatalogContext);
  if (!ctx) throw new Error('useStarnetCatalog must be used within StarnetCatalogProvider');
  return ctx;
}
