import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { useI18n } from '@/i18n';
import type { CategoryCode } from '@/lib/categories';
import { CategoryCircle } from '@/ui/CategoryCircle';
import { Icon } from '@/ui/Icon';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * A row of categories to pick from (split and edit screens): the ledger's grid,
 * then "More categories" to show the rest (spec §5.5).
 */
export function CategoryStrip({
  grid,
  more,
  selected,
  onSelect,
  income,
}: {
  grid: CategoryCode[];
  more: CategoryCode[];
  selected: CategoryCode | null | undefined;
  onSelect: (code: CategoryCode) => void;
  income?: boolean;
}) {
  const colors = useColors();
  const { t } = useI18n();
  // A selected category from the rest stays visible without opening "More categories".
  const [showMore, setShowMore] = useState(() => !!selected && more.includes(selected));
  const codes = showMore ? [...grid, ...more] : grid;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {codes.map((code) => {
        const on = code === selected;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            aria-selected={on}
            accessibilityLabel={t(`category.${code}`)}
            onPress={() => onSelect(code)}
            style={{ width: 62, alignItems: 'center', gap: 5 }}
          >
            <CategoryCircle
              code={code}
              size={50}
              iconSize={21}
              background={on ? colors.accent : colors.surface}
              color={on ? colors.bg : income ? colors.accent2Ramp[800] : colors.accentRamp[800]}
            />
            <Txt size={12} align="center" numberOfLines={2}>
              {t(`category.${code}`)}
            </Txt>
          </Pressable>
        );
      })}
      {!showMore && more.length > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowMore(true)}
          style={{ width: 62, alignItems: 'center', gap: 5 }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.neutral[500],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="ellipsis" size={21} color={colors.text} />
          </View>
          <Txt size={12} align="center" numberOfLines={2}>
            {t('entry.moreCategories')}
          </Txt>
        </Pressable>
      )}
    </ScrollView>
  );
}
