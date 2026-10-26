import { Pressable, View } from 'react-native';

import type { KeypadKey } from '@/lib/money';

import { Icon } from './Icon';
import { useColors } from './theme/ThemeProvider';
import { Txt } from './Txt';

const KEYS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/** In-app 3×4 keypad. The decimal key is blank for zero-decimal currencies. */
export function Keypad({
  onKey,
  decimals,
  keyHeight = 56,
  fontSize = 28,
  deleteLabel,
}: {
  onKey: (key: KeypadKey) => void;
  decimals: number;
  keyHeight?: number;
  fontSize?: number;
  deleteLabel: string;
}) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 }}>
      {KEYS.map((key) => {
        const blank = key === '.' && decimals === 0;
        return (
          <View key={key} style={{ width: '33.333%', paddingHorizontal: 3 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={key === 'del' ? deleteLabel : key}
              disabled={blank}
              onPress={() => onKey(key)}
              style={({ pressed }) => ({
                height: keyHeight,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.neutral[300] : 'transparent',
              })}
            >
              {key === 'del' ? (
                <Icon name="delete" size={24} color={colors.text} />
              ) : (
                <Txt font="heading" size={fontSize}>
                  {blank ? '' : key}
                </Txt>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
