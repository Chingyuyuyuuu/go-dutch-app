import { Pressable, View } from 'react-native';

import { useColors } from './theme/ThemeProvider';
import { Txt } from './Txt';

/** Pill segmented control on `surface`: the selected option is `text` filled with `bg` text. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  height = 42,
  fontSize = 14,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  height?: number;
  fontSize?: number;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: colors.surface }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={on}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: Math.max(height, 44),
              marginVertical: height < 44 ? (height - 44) / 2 : 0,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? colors.text : 'transparent',
            }}
          >
            <Txt font="bold" size={fontSize} color={on ? colors.bg : colors.text} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
