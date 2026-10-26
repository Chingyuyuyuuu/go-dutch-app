import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { shadows } from './theme/palette';
import { useColors } from './theme/ThemeProvider';
import { Txt } from './Txt';

type Variant = 'primary' | 'sage' | 'outline' | 'ghost' | 'surface' | 'danger';

/** Pill button. Height 46 by default; the big bottom buttons use height 58–60. */
export function PillButton({
  label,
  onPress,
  variant = 'primary',
  height = 46,
  fontSize,
  icon,
  disabled,
  flex,
  style,
  accessibilityLabel,
  bodyFont,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  height?: number;
  fontSize?: number;
  /** Figtree 600 instead of Caprasimo, for small secondary chips like "Change category". */
  bodyFont?: boolean;
  icon?: IconName;
  disabled?: boolean;
  flex?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
    primary: { bg: colors.accent, pressed: colors.accentRamp[700], fg: colors.bg },
    sage: { bg: colors.accent2, pressed: colors.accent2Ramp[700], fg: colors.bg },
    outline: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.text, border: colors.divider },
    ghost: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.text },
    surface: { bg: colors.surface, pressed: colors.neutral[300], fg: colors.text },
    danger: { bg: 'transparent', pressed: colors.surfaceMuted, fg: colors.negative, border: colors.negative },
  };
  const p = palette[variant];
  const big = height >= 56;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height,
          minWidth: 44,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: pressed ? p.pressed : p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          opacity: disabled ? 0.45 : 1,
        },
        big && variant === 'primary' && { boxShadow: shadows.md },
        flex && { flex: 1 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={big ? 22 : 16} color={p.fg} />}
      <Txt
        font={bodyFont ? 'semibold' : 'heading'}
        size={fontSize ?? (big ? 21 : 15)}
        color={p.fg}
        numberOfLines={1}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

/** 44px circle icon button on `surface`. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  background,
  color,
  size = 44,
  iconSize = 20,
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  background?: string;
  color?: string;
  size?: number;
  iconSize?: number;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={size < 44 ? (44 - size) / 2 : 0}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.neutral[300] : (background ?? colors.surface),
      })}
    >
      <Icon name={icon} size={iconSize} color={color ?? colors.text} />
    </Pressable>
  );
}

/** Small rounded chip, used for tags like "Last used" or "Auto-recorded". */
export function Tag({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View
      style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: background }}
    >
      <Txt size={12} font="semibold" color={color}>
        {label}
      </Txt>
    </View>
  );
}

/** Star toggle used in currency, ledger and friend rows. */
export function StarToggle({
  on,
  onPress,
  accessibilityLabel,
}: {
  on: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Txt size={20} color={on ? colors.accent : colors.neutral[500]}>
        {on ? '★' : '☆'}
      </Txt>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Txt font="bold" size={12} caps color={colors.neutral[700]} style={{ paddingHorizontal: 6 }}>
      {children}
    </Txt>
  );
}

/** Radio dot used in settings and the new-ledger form. */
export function RadioDot({ on }: { on: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: on ? colors.accent : colors.neutral[500],
        padding: 3,
      }}
    >
      <View style={{ flex: 1, borderRadius: 999, backgroundColor: on ? colors.accent : 'transparent' }} />
    </View>
  );
}
