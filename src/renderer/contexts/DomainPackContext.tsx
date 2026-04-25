import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { DomainPack } from '../../shared/domainPackTypes';
import { bundledDomainPacks } from '../domainPacks';

const DOMAIN_PACK_STORAGE_KEY = 'oasis-ide-active-domain-pack-id';

interface DomainPackContextValue {
  packs: DomainPack[];
  activePackId: string | null;
  activePack: DomainPack | null;
  setActivePackId: (id: string | null) => void;
}

const DomainPackContext = createContext<DomainPackContextValue | null>(null);

function loadInitialPackId(): string | null {
  try {
    const stored = localStorage.getItem(DOMAIN_PACK_STORAGE_KEY);
    if (!stored || stored === 'none') return null;
    return bundledDomainPacks.some((pack) => pack.id === stored) ? stored : null;
  } catch {
    return null;
  }
}

export function DomainPackProvider({ children }: { children: React.ReactNode }) {
  const [activePackIdState, setActivePackIdState] = useState<string | null>(() => loadInitialPackId());

  const setActivePackId = useCallback((id: string | null) => {
    const next = id && bundledDomainPacks.some((pack) => pack.id === id) ? id : null;
    setActivePackIdState(next);
    try {
      if (next) {
        localStorage.setItem(DOMAIN_PACK_STORAGE_KEY, next);
      } else {
        localStorage.setItem(DOMAIN_PACK_STORAGE_KEY, 'none');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const activePack = useMemo(
    () => bundledDomainPacks.find((pack) => pack.id === activePackIdState) ?? null,
    [activePackIdState]
  );

  const value = useMemo<DomainPackContextValue>(
    () => ({
      packs: bundledDomainPacks,
      activePackId: activePackIdState,
      activePack,
      setActivePackId,
    }),
    [activePack, activePackIdState, setActivePackId]
  );

  return <DomainPackContext.Provider value={value}>{children}</DomainPackContext.Provider>;
}

export function useDomainPacks(): DomainPackContextValue {
  const ctx = useContext(DomainPackContext);
  if (!ctx) throw new Error('useDomainPacks must be used within DomainPackProvider');
  return ctx;
}
