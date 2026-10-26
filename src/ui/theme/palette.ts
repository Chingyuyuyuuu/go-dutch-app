import { oklchToHex, withAlpha } from '@/lib/color';

/** Background colour options (Settings → Appearance, Phase 5). Hue drives bg / surface / neutral-200/300. */
export const BACKGROUND_THEMES = {
  cream: 85,
  butter: 100,
  blush: 35,
  mint: 150,
  sky: 235,
} as const;

/** Accent colour options. Hue drives the whole accent ramp. */
export const ACCENT_THEMES = {
  marigold: 68,
  terracotta: 42,
  rose: 12,
  plum: 330,
  sea: 230,
} as const;

export type BackgroundTheme = keyof typeof BACKGROUND_THEMES;
export type AccentTheme = keyof typeof ACCENT_THEMES;

const RAMP_LIGHTNESS = [0.97, 0.93, 0.87, 0.79, 0.71, 0.62, 0.52, 0.42, 0.31];
const RAMP_CHROMA = [0.02, 0.045, 0.08, 0.12, 0.15, 0.14, 0.12, 0.09, 0.06];

type Ramp = Record<100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

export type Palette = {
  bg: string;
  surface: string;
  /** surface @ 45%, used for inactive folder tabs. */
  surfaceMuted: string;
  text: string;
  divider: string;
  accent: string;
  accentRamp: Ramp;
  /** Sage. */
  accent2: string;
  accent2Ramp: Ramp;
  neutral: Ramp;
  negative: string;
  white: string;
  scrim: string;
};

const TEXT = '#201e1d';
const NEUTRAL_FIXED = {
  100: '#f9f4ed',
  400: '#c0b6a5',
  500: '#a19786',
  600: '#82796a',
  700: '#645c50',
  800: '#474238',
  900: '#2e2b25',
};
const SAGE: Ramp = {
  100: '#f0fae1',
  200: '#e1eecc',
  300: '#ccdbb2',
  400: '#aebf92',
  500: '#8fa073',
  600: '#728157',
  700: '#56633f',
  800: '#3d472b',
  900: '#272e1b',
};

export function buildPalette(background: BackgroundTheme, accent: AccentTheme): Palette {
  const bgHue = BACKGROUND_THEMES[background];
  const accentHue = ACCENT_THEMES[accent];
  const surface = oklchToHex(0.9, 0.038, bgHue);
  const accentRamp = Object.fromEntries(
    RAMP_LIGHTNESS.map((l, i) => [(i + 1) * 100, oklchToHex(l, RAMP_CHROMA[i], accentHue)]),
  ) as Ramp;
  return {
    bg: oklchToHex(0.945, 0.03, bgHue),
    surface,
    surfaceMuted: withAlpha(surface, 0.45),
    text: TEXT,
    divider: withAlpha(TEXT, 0.16),
    accent: oklchToHex(0.66, 0.15, accentHue),
    accentRamp,
    accent2: '#7a8a5e',
    accent2Ramp: SAGE,
    neutral: {
      ...NEUTRAL_FIXED,
      200: oklchToHex(0.93, 0.018, bgHue),
      300: oklchToHex(0.86, 0.022, bgHue),
    },
    negative: oklchToHex(0.52, 0.17, 27),
    white: '#ffffff',
    scrim: withAlpha(NEUTRAL_FIXED[900], 0.45),
  };
}

const SHADOW_COLOR = NEUTRAL_FIXED[900];
export const shadows = {
  sm: `0px 1px 2px ${withAlpha(SHADOW_COLOR, 0.14)}`,
  md: `0px 3px 10px ${withAlpha(SHADOW_COLOR, 0.16)}`,
  lg: `0px 12px 32px ${withAlpha(SHADOW_COLOR, 0.22)}`,
} as const;

export const radius = {
  pill: 999,
  card: 28,
  sheet: 34,
  tab: 18,
} as const;
