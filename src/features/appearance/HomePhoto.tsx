import { Image, StyleSheet, View } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import { withAlpha } from '@/lib/color';
import { useColors } from '@/ui/theme/ThemeProvider';

import { usePhotoUrl, WASHED } from './useHomePhoto';

/** Transparency as a fraction of the design's panel value: solid 100, semi 60, clear 20. */
const PANEL = { solid: 1, semi: 0.6, clear: 0.2 } as const;

/**
 * The home photo, full-bleed behind everything: washed out, under a `bg` scrim of
 * 62% with solid bubbles, otherwise max(30%, transparency × 0.62).
 */
export function HomePhoto() {
  const colors = useColors();
  const { profile } = useAppData();
  const url = usePhotoUrl(profile.homePhoto);
  if (!url) return null;
  const panel = PANEL[profile.bubbleOpacity];
  const scrim = panel === 1 ? 0.62 : Math.max(0.3, panel * 0.62);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { filter: WASHED }]}>
        <Image
          source={{ uri: url }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: '100%', height: '100%' }}
        />
      </View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.bg, scrim) }]} />
    </View>
  );
}
