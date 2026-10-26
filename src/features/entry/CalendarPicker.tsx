import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useI18n } from '@/i18n';
import { addDays, monthGrid, monthLabel, parseLocalDate, shiftMonth, type LocalDate } from '@/lib/date';
import { IconButton } from '@/ui/Buttons';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * Backdate picker (screen 05c): Today / Yesterday chips, a month grid with
 * previous / next month, today in accent-700, future days disabled.
 */
export function CalendarPicker({
  value,
  today,
  onChange,
  maxDate = today,
  quickDays,
}: {
  value: LocalDate;
  today: LocalDate;
  onChange: (date: LocalDate) => void;
  /** Last day that can be picked (entries: today; a first charge can be later). */
  maxDate?: LocalDate;
  /** Quick chips; Today / Yesterday by default. */
  quickDays?: [LocalDate, string][];
}) {
  const colors = useColors();
  const { t, lang } = useI18n();
  const initial = parseLocalDate(value);
  const [view, setView] = useState({ year: initial.year, month: initial.month });
  const maxParts = parseLocalDate(maxDate);
  const atLastMonth = view.year === maxParts.year && view.month === maxParts.month;
  const weekHead =
    lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const quick: [LocalDate, string][] = quickDays ?? [
    [today, t('common.today')],
    [addDays(today, -1), t('common.yesterday')],
  ];

  return (
    <View
      style={{
        borderRadius: 28,
        backgroundColor: colors.surface,
        paddingTop: 14,
        paddingHorizontal: 12,
        paddingBottom: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 4, alignItems: 'center' }}>
        {quick.map(([date, label]) => {
          const on = date === value;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              aria-selected={on}
              onPress={() => onChange(date)}
              style={{
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 999,
                justifyContent: 'center',
                backgroundColor: on ? colors.text : colors.bg,
              }}
            >
              <Txt font="bold" size={13} color={on ? colors.bg : colors.text}>
                {label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {/* Month navigation sits on its own row so long month names never push the arrows off. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <IconButton
          icon="chevron-left"
          size={36}
          iconSize={16}
          background={colors.bg}
          accessibilityLabel={t('common.previousMonth')}
          onPress={() => setView(shiftMonth(view.year, view.month, -1))}
        />
        <Txt font="heading" size={16} style={{ flex: 1 }} align="center" accessibilityRole="header">
          {monthLabel(view.year, view.month, lang)}
        </Txt>
        <View style={{ opacity: atLastMonth ? 0.3 : 1 }} pointerEvents={atLastMonth ? 'none' : 'auto'}>
          <IconButton
            icon="chevron-right"
            size={36}
            iconSize={16}
            background={colors.bg}
            accessibilityLabel={t('common.nextMonth')}
            onPress={() => setView(shiftMonth(view.year, view.month, 1))}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 2 }}>
        {weekHead.map((w, i) => (
          <Txt
            key={`${w}-${i}`}
            font="bold"
            size={11}
            color={colors.neutral[700]}
            align="center"
            style={{ width: '14.2857%', paddingVertical: 4 }}
          >
            {w}
          </Txt>
        ))}
        {monthGrid(view.year, view.month).map((date, i) => {
          if (!date) return <View key={`blank-${i}`} style={{ width: '14.2857%', height: 36 }} />;
          const future = date > maxDate;
          const selected = date === value;
          const isToday = date === today;
          return (
            <View key={date} style={{ width: '14.2857%', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                aria-selected={selected}
                aria-disabled={future}
                accessibilityLabel={date}
                disabled={future}
                onPress={() => onChange(date)}
                style={{
                  width: 40,
                  height: 36,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? colors.accent : 'transparent',
                  opacity: future ? 0.3 : 1,
                }}
              >
                <Txt
                  font="semibold"
                  size={14}
                  tabular
                  color={selected ? colors.bg : isToday ? colors.accentRamp[700] : colors.text}
                >
                  {String(parseLocalDate(date).day)}
                </Txt>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
