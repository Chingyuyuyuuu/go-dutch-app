import { Pressable, View } from 'react-native';

import { shadows } from './theme/palette';
import { useColors } from './theme/ThemeProvider';

/** 52×32 switch: accent when on, neutral-400 when off. The touch area is 44 high. */
export function Toggle({
  on,
  onChange,
  accessibilityLabel,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      aria-checked={on}
      accessibilityLabel={accessibilityLabel}
      onPress={() => onChange(!on)}
      style={{ height: 44, justifyContent: 'center' }}
    >
      <View
        style={{
          width: 52,
          height: 32,
          borderRadius: 999,
          padding: 3,
          flexDirection: 'row',
          justifyContent: on ? 'flex-end' : 'flex-start',
          backgroundColor: on ? colors.accent : colors.neutral[400],
        }}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.bg,
            boxShadow: shadows.sm,
          }}
        />
      </View>
    </Pressable>
  );
}
