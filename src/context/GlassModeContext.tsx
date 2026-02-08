import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

const GlassModeContext = createContext(false);

export function GlassModeProvider({ children }: { children: ReactNode }) {
  return (
    <GlassModeContext.Provider value={true}>
      {children}
    </GlassModeContext.Provider>
  );
}

export function useGlassMode(): boolean {
  return useContext(GlassModeContext);
}
