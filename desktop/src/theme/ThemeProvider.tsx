import React, { useState, useEffect } from 'react';
import { colors, fonts, fontWeights } from './colors';

type ThemeMode = 'light' | 'dark';

const THEME_KEY = 'cliper.theme';

const lightTheme = {
  colors,
  fonts,
  fontWeights,
  mode: 'light' as ThemeMode,
};

const darkTheme = {
  colors: { ...colors, bg: '#121212', surface: '#1E1E1E', border: '#2C2E33', text: '#FFFFFF', textMuted: '#A3ADA8' } as const,
  fonts,
  fontWeights,
  mode: 'dark' as ThemeMode,
};

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  theme: typeof lightTheme;
}

const ThemeContext = React.createContext<ThemeContextValue>({ mode: 'light', setMode: () => {}, theme: lightTheme });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    try {
      if (localStorage.getItem(THEME_KEY) === 'dark') {
        setMode('dark');
      } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setMode('dark');
      }
    } catch {
      // private mode
    }
  }, []);

  const value: ThemeContextValue = {
    mode,
    setMode: (m: ThemeMode) => {
      try {
        localStorage.setItem(THEME_KEY, m);
      } catch {}
      setMode(m);
    },
    theme: mode === 'dark' ? darkTheme : lightTheme,
  };

  return (
    <ThemeContext.Provider value={value}>
      <div style={{ background: mode === 'dark' ? '#121212' : '#FFFFFF', minHeight: '100vh' }}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.use(ThemeContext);
}