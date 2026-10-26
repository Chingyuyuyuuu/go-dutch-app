import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import { withAlpha } from '@/lib/color';
import type { BubbleOpacity } from '@/lib/domain';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';

/** All three looks keep a 1.5 px white 60% outline. */
export const BUBBLE_BORDER = 'rgba(255, 255, 255, 0.6)';

/**
 * How entry bubbles and the shared balance card look (Settings → Appearance → transparency):
 * solid neutral-100 + small shadow; semi neutral-100 @ 70% frosted + small shadow; clear outline only.
 */
export function useBubbleLook(): { mode: BubbleOpacity; fill: string; pressed: string; shadow?: string } {
  const { profile } = useAppData();
  const colors = useColors();
  const mode = profile.bubbleOpacity;
  if (mode === 'semi') {
    return {
      mode,
      fill: withAlpha(colors.neutral[100], 0.7),
      pressed: withAlpha(colors.neutral[200], 0.85),
      shadow: shadows.sm,
    };
  }
  if (mode === 'clear') return { mode, fill: 'transparent', pressed: colors.surfaceMuted };
  return { mode, fill: colors.neutral[100], pressed: colors.neutral[200], shadow: shadows.sm };
}

/** The frosted layer behind a semi-transparent bubble (12 px blur). Put it first inside a clipped container. */
export function BubbleFrost({ mode, radius }: { mode: BubbleOpacity; radius: number }) {
  if (mode !== 'semi') return null;
  return (
    <BlurView
      intensity={60}
      tint="light"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
    />
  );
}
