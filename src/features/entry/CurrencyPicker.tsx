import { useMemo, useState } from 'react';
import { Pressable, SectionList, TextInput, View } from 'react-native';

import { useI18n } from '@/i18n';
import { ALL_CURRENCY_CODES, currencyName, matchesCurrency } from '@/lib/currency';
import { StarToggle } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Sheet } from '@/ui/Overlay';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * Currency sheet (screen 04): search, "Starred" then "All currencies", a star on
 * every row. Also used by New ledger and Settings → Starred currencies (no selection).
 */
export function CurrencyPicker({
  selected,
  starred,
  onSelect,
  onToggleStar,
  onClose,
}: {
  selected?: string;
  starred: string[];
  onSelect?: (code: string) => void;
  onToggleStar: (code: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');

  const sections = useMemo(() => {
    const match = (code: string) => matchesCurrency(code, q);
    return [
      { key: 'starred', title: t('currency.starred'), data: starred.filter(match) },
      { key: 'all', title: t('currency.all'), data: ALL_CURRENCY_CODES.filter(match) },
    ].filter((s) => s.data.length > 0);
  }, [q, starred, t]);

  return (
    <Sheet onClose={onClose} top={110} style={{ paddingBottom: 0 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 10,
          paddingLeft: 22,
          paddingRight: 14,
        }}
      >
        <Txt font="heading" size={24} style={{ flex: 1 }} accessibilityRole="header">
          {t('currency.title')}
        </Txt>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{ height: 44, paddingHorizontal: 14, justifyContent: 'center' }}
        >
          <Txt font="heading" size={16} color={colors.accentRamp[700]}>
            {t('common.done')}
          </Txt>
        </Pressable>
      </View>
      <View
        style={{
          marginHorizontal: 18,
          marginBottom: 8,
          height: 48,
          borderRadius: 999,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
        }}
      >
        <Icon name="search" size={17} color={colors.neutral[700]} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('currency.search')}
          placeholderTextColor={colors.neutral[600]}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={t('currency.search')}
          style={{ flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.text, height: 48 }}
        />
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(code, index) => `${code}-${index}`}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 40 }}
        ListEmptyComponent={
          <Txt color={colors.neutral[700]} align="center" style={{ padding: 24 }}>
            {t('currency.noMatch', { q })}
          </Txt>
        }
        renderSectionHeader={({ section }) => (
          <Txt
            font="bold"
            size={12}
            caps
            color={colors.neutral[700]}
            style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}
          >
            {section.title}
          </Txt>
        )}
        renderItem={({ item: code }) => {
          const isSelected = code === selected;
          const isStarred = starred.includes(code);
          return (
            <Pressable
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityState={{ selected: isSelected }}
              disabled={!onSelect}
              onPress={() => onSelect?.(code)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                minHeight: 52,
                paddingLeft: 14,
                paddingRight: 4,
                borderRadius: 20,
                backgroundColor: isSelected
                  ? colors.accentRamp[100]
                  : pressed
                    ? colors.surfaceMuted
                    : 'transparent',
              })}
            >
              <Txt font="bold" size={15} style={{ width: 44, letterSpacing: 0.5 }}>
                {code}
              </Txt>
              <Txt size={14} color={colors.neutral[800]} style={{ flex: 1 }} numberOfLines={1}>
                {currencyName(code, lang)}
              </Txt>
              {isSelected && <Icon name="check" size={18} color={colors.accentRamp[700]} />}
              <StarToggle
                on={isStarred}
                onPress={() => onToggleStar(code)}
                accessibilityLabel={t('currency.star', { code })}
              />
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}
