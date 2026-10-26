import type { ReactNode } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';

import { shadows } from './theme/palette';
import { useColors } from './theme/ThemeProvider';

const PHONE_WIDTH = 390;
const PHONE_HEIGHT = 844;

/**
 * In the web preview on a desktop browser, show the app at phone size (390pt)
 * centred on the page. On phones and native builds it fills the screen.
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < 520) return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.neutral[200],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          // Width and height include the 10px bezel, like the design's 410×864 frame.
          width: PHONE_WIDTH + 20,
          height: Math.min(PHONE_HEIGHT + 20, height - 32),
          borderRadius: 56,
          overflow: 'hidden',
          backgroundColor: colors.bg,
          boxShadow: shadows.lg,
          borderWidth: 10,
          borderColor: colors.neutral[900],
        }}
      >
        {children}
      </View>
    </View>
  );
}
