import React, { createContext, useContext, type PropsWithChildren } from 'react';
import { buildTheme, type Theme } from './theme.js';

const ThemeContext = createContext<Theme>(buildTheme());

export function ThemeProvider({ theme, children }: PropsWithChildren<{ theme: Theme }>) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
