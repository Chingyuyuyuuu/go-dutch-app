import { createContext, useContext, useState, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from './Buttons';
import { useColors } from './theme/ThemeProvider';
import { Txt } from './Txt';

/** Top / bottom padding for full-screen layouts. The web preview has no status bar. */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  return {
    top: Platform.OS === 'web' ? 16 : insets.top + 4,
    bottom: Math.max(insets.bottom, 12),
  };
}

const ScreenOverlayContext = createContext<(overlay: ReactNode) => void>(() => {});

/**
 * Lets a part of a screen (e.g. the ledger body between the tabs and the
 * bottom button) show a sheet or dialog over the whole screen. Pass null to close.
 */
export function useScreenOverlay() {
  return useContext(ScreenOverlayContext);
}

export function Screen({
  children,
  style,
  transparent,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Leave the background to what is behind (home photo, Phase 5). */
  transparent?: boolean;
}) {
  const colors = useColors();
  const { top, bottom } = useScreenInsets();
  const [overlay, setOverlay] = useState<ReactNode>(null);
  return (
    <ScreenOverlayContext.Provider value={setOverlay}>
      <View
        style={[
          {
            flex: 1,
            paddingTop: top,
            paddingBottom: bottom,
            backgroundColor: transparent ? 'transparent' : colors.bg,
          },
          style,
        ]}
      >
        {children}
        {overlay}
      </View>
    </ScreenOverlayContext.Provider>
  );
}

export const backIcon = Platform.OS === 'android' ? 'arrow-left' : 'chevron-left';

/** Top bar: 44px back/close button, centred Caprasimo 20 title, optional right slot. */
export function ScreenHeader({
  title,
  onBack,
  close,
  backLabel,
  right,
}: {
  title: string;
  onBack: () => void;
  /** Show an X instead of the platform back icon. */
  close?: boolean;
  backLabel: string;
  right?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 4,
        paddingHorizontal: 12,
        paddingBottom: 8,
        minHeight: 52,
      }}
    >
      <IconButton icon={close ? 'x' : backIcon} onPress={onBack} accessibilityLabel={backLabel} />
      <Txt
        font="heading"
        size={20}
        align="center"
        style={{ flex: 1 }}
        accessibilityRole="header"
        numberOfLines={1}
      >
        {title}
      </Txt>
      <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}
