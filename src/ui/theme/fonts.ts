import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo';
import { Figtree_400Regular, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { Platform } from 'react-native';

export const FONT_ASSETS = {
  Caprasimo_400Regular,
  Figtree_400Regular,
  Figtree_600SemiBold,
  Figtree_700Bold,
};

// Caprasimo has no CJK glyphs. Native platforms fall back to the system font per
// glyph; on web we spell out the fallback so zh-TW headings use PingFang / Noto.
const cjkFallback = (family: string) =>
  Platform.OS === 'web' ? `${family}, "PingFang TC", "Noto Sans TC", system-ui, sans-serif` : family;

export const fonts = {
  heading: cjkFallback('Caprasimo_400Regular'),
  body: cjkFallback('Figtree_400Regular'),
  bodySemiBold: cjkFallback('Figtree_600SemiBold'),
  bodyBold: cjkFallback('Figtree_700Bold'),
} as const;
