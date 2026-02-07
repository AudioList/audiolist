import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type ExperienceMode = 'default' | 'beginner' | 'advanced';

interface ExperienceModeContextValue {
  mode: ExperienceMode;
  setMode: (mode: ExperienceMode) => void;
}

const ExperienceModeContext = createContext<ExperienceModeContextValue | null>(null);

export function ExperienceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ExperienceMode>(() => {
    const stored = localStorage.getItem('audiolist_experience_mode');
    if (stored === 'beginner' || stored === 'advanced') return stored;
    return 'default';
  });

  const setMode = useCallback((newMode: ExperienceMode) => {
    setModeState(newMode);
    if (newMode === 'default') {
      localStorage.removeItem('audiolist_experience_mode');
    } else {
      localStorage.setItem('audiolist_experience_mode', newMode);
    }
  }, []);

  return (
    <ExperienceModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ExperienceModeContext.Provider>
  );
}

export function useExperienceMode(): ExperienceModeContextValue {
  const ctx = useContext(ExperienceModeContext);
  if (!ctx) throw new Error('useExperienceMode must be used within ExperienceModeProvider');
  return ctx;
}
