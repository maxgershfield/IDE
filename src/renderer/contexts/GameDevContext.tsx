import React, { createContext, useContext, useState, useCallback } from 'react';
import { IDE_GAME_DEV_STORAGE_KEY } from '../constants/ideChatModels';

interface GameDevContextValue {
  isGameDevMode: boolean;
  toggleGameDevMode: () => void;
}

const GameDevContext = createContext<GameDevContextValue>({
  isGameDevMode: false,
  toggleGameDevMode: () => {}
});

export const GameDevProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isGameDevMode, setIsGameDevMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(IDE_GAME_DEV_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const toggleGameDevMode = useCallback(() => {
    setIsGameDevMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(IDE_GAME_DEV_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <GameDevContext.Provider value={{ isGameDevMode, toggleGameDevMode }}>
      {children}
    </GameDevContext.Provider>
  );
};

export function useGameDev(): GameDevContextValue {
  return useContext(GameDevContext);
}
