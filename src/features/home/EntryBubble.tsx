import { Pressable, View } from 'react-native';

import { BUBBLE_BORDER, BubbleFrost, useBubbleLook } from '@/features/appearance/bubble';
import { useI18n } from '@/i18n';
import type { Entry } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import { Tag } from '@/ui/Buttons';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon } from '@/ui/Icon';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * One entry as a pill "bubble" (design 01 / 02). Title is the note, or the
 * category when there is no note; the subtitle defaults to the category when a
 * note exists so it never appears twice.
 */
export function EntryBubble({
  entry,
  currency,
  title,
  subtitle,
  tags = [],
  onPress,
}: {
  entry: Entry;
  currency: string;
  title?: string;
  subtitle?: string;
  tags?: { label: string; tone: 'accent' | 'sage' }[];
  onPress: () => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const look = useBubbleLook();
  const income = entry.type === 'income';
  const repayment = entry.type === 'repayment';
  const categoryLabel = t(`category.${entry.categoryCode}`);
  const amount = formatMoney(currency, entry.amountMinor, { sign: income ? '+' : '' });
  const shownTitle = title ?? (entry.note || categoryLabel);
  const shownSubtitle = subtitle ?? (entry.note ? categoryLabel : '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shownTitle}, ${amount}${shownSubtitle ? `, ${shownSubtitle}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        marginTop: 8,
        paddingVertical: 8,
        paddingLeft: 8,
        paddingRight: 18,
        borderRadius: 999,
        backgroundColor: pressed ? look.pressed : look.fill,
        borderWidth: 1.5,
        borderColor: BUBBLE_BORDER,
        boxShadow: look.shadow,
        overflow: look.mode === 'semi' ? 'hidden' : 'visible',
      })}
    >
      <BubbleFrost mode={look.mode} radius={999} />
      {repayment ? (
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: colors.accent2Ramp[200],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrow-right-left" size={19} color={colors.accent2Ramp[800]} />
        </View>
      ) : (
        <CategoryCircle code={entry.categoryCode} size={42} iconSize={19} />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Txt font="semibold" size={15} numberOfLines={1}>
          {shownTitle}
        </Txt>
        {shownSubtitle ? (
          <Txt size={12.5} color={colors.neutral[700]} numberOfLines={1}>
            {shownSubtitle}
          </Txt>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <Txt
          font="bold"
          size={15}
          tabular
          color={income ? colors.accent2Ramp[700] : repayment ? colors.neutral[700] : colors.text}
        >
          {amount}
        </Txt>
        {tags.map((tag) => (
          <Tag
            key={tag.label}
            label={tag.label}
            background={tag.tone === 'accent' ? colors.accentRamp[100] : colors.accent2Ramp[100]}
            color={tag.tone === 'accent' ? colors.accentRamp[800] : colors.accent2Ramp[800]}
          />
        ))}
      </View>
    </Pressable>
  );
}
