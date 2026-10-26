import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { buildPalette, type AccentTheme, type BackgroundTheme, type Palette } from './palette';

type ThemeValue = {
  colors: Palette;
  background: BackgroundTheme;
  accent: AccentTheme;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  background = 'cream',
  accent = 'marigold',
  children,
}: {
  background?: BackgroundTheme;
  accent?: AccentTheme;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ colors: buildPalette(background, accent), background, accent }),
    [background, accent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export function useColors(): Palette {
  return useTheme().colors;
}
