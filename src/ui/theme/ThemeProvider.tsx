import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { buildPalette, type AccentTheme, type BackgroundTheme, type Palette } from './palette';

type ThemeValue = {
  colors: Palette;
  background: BackgroundTheme;
  accent: AccentTheme;
  setTheme: (background: BackgroundTheme, accent: AccentTheme) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

/** Colours for the chosen background and accent (Settings → Appearance). Cream + Marigold until a profile loads. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<{ background: BackgroundTheme; accent: AccentTheme }>({
    background: 'cream',
    accent: 'marigold',
  });
  const value = useMemo<ThemeValue>(
    () => ({
      colors: buildPalette(theme.background, theme.accent),
      ...theme,
      setTheme: (background, accent) =>
        setThemeState((prev) =>
          prev.background === background && prev.accent === accent ? prev : { background, accent },
        ),
    }),
    [theme],
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

/** Applies the signed-in user's colours. Rendered once, inside the data provider. */
export function useApplyTheme(background: BackgroundTheme, accent: AccentTheme) {
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(background, accent);
  }, [setTheme, background, accent]);
}
