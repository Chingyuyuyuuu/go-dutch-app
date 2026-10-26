import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useScreenInsets } from './Screen';
import { shadows } from './theme/palette';
import { useColors } from './theme/ThemeProvider';

/**
 * Sheets and dialogs are rendered inside the screen (absolute fill) rather than
 * in a native Modal, so they stay inside the phone frame in the web preview.
 * Render them last in the screen tree. Tapping the scrim closes the overlay.
 */
function Scrim({ onPress, opacity }: { onPress: () => void; opacity: Animated.Value }) {
  const colors = useColors();
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity }]}>
      <Pressable accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onPress} />
    </Animated.View>
  );
}

function useAppear() {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [progress]);
  return progress;
}

/** Bottom sheet: radius 34 on the top corners, grab handle, `bg` fill. */
export function Sheet({
  onClose,
  children,
  top,
  style,
}: {
  onClose: () => void;
  children: ReactNode;
  /** Fixed top offset (the currency picker sits at 110). Otherwise the sheet hugs its content. */
  top?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const { bottom } = useScreenInsets();
  const progress = useAppear();
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20 }]}>
      <Scrim onPress={onClose} opacity={progress} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]}
        pointerEvents="box-none"
      >
        <Animated.View
          accessibilityViewIsModal
          style={[
            {
              backgroundColor: colors.bg,
              borderTopLeftRadius: 34,
              borderTopRightRadius: 34,
              paddingTop: 10,
              paddingBottom: bottom + 18,
              transform: [{ translateY }],
              opacity: progress,
            },
            top !== undefined && { position: 'absolute', top, left: 0, right: 0, bottom: 0 },
            style,
          ]}
        >
          <View
            style={{
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.neutral[400],
              alignSelf: 'center',
            }}
          />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Centred dialog card: radius 34, `surface`, large shadow. */
export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const colors = useColors();
  const progress = useAppear();
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 20, justifyContent: 'center', paddingHorizontal: 20 }]}>
      <Scrim onPress={onClose} opacity={progress} />
      <Animated.View
        accessibilityViewIsModal
        accessibilityRole="alert"
        style={{
          borderRadius: 34,
          backgroundColor: colors.surface,
          boxShadow: shadows.lg,
          padding: 24,
          gap: 12,
          opacity: progress,
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}
