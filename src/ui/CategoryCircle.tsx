import { View } from 'react-native';

import { CATEGORY_ICONS, isIncomeCategory, type CategoryCode } from '@/lib/categories';

import { Icon, isIconName } from './Icon';
import { useColors } from './theme/ThemeProvider';

export function categoryColors(code: CategoryCode, colors: ReturnType<typeof useColors>) {
  return isIncomeCategory(code)
    ? { bg: colors.accent2Ramp[200], fg: colors.accent2Ramp[800] }
    : { bg: colors.accentRamp[200], fg: colors.accentRamp[800] };
}

/** Category circle. Expenses: accent-200 / accent-800; income: sage-200 / sage-800. */
export function CategoryCircle({
  code,
  size = 42,
  iconSize,
  background,
  color,
}: {
  code: CategoryCode;
  size?: number;
  iconSize?: number;
  background?: string;
  color?: string;
}) {
  const colors = useColors();
  const tone = categoryColors(code, colors);
  const iconName = CATEGORY_ICONS[code];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background ?? tone.bg,
      }}
    >
      {isIconName(iconName) && (
        <Icon name={iconName} size={iconSize ?? Math.round(size * 0.45)} color={color ?? tone.fg} />
      )}
    </View>
  );
}
