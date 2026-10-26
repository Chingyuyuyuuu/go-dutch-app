import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import type { Ledger, LedgerPref } from '@/lib/domain';
import { moveItem } from '@/lib/ledgers';
import { SectionLabel, StarToggle } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { shadows } from '@/ui/theme/palette';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

const ROW_HEIGHT = 60;
const SLOT = ROW_HEIGHT + 10;

/** Screen 01c: pin and drag to reorder. Ended ledgers are not listed. */
export function ReorderScreen() {
  const { t } = useI18n();
  const repo = useRepo();
  const { orderedLedgers, prefs } = useAppData();
  const [dragging, setDragging] = useState(false);

  const live = orderedLedgers.filter((l) => l.status === 'active');
  const pinned = live.filter((l) => prefs[l.id]?.starred);
  const others = live.filter((l) => !prefs[l.id]?.starred);

  /** Saves positions 0..n for every live ledger in the order shown. */
  const saveOrder = (ids: string[]) => {
    const updates: Record<string, Partial<LedgerPref>> = {};
    ids.forEach((id, order) => {
      updates[id] = { order };
    });
    repo.setLedgerPrefs(updates);
  };

  const sections = [
    { key: 'pinned', title: t('reorder.pinned'), ledgers: pinned },
    { key: 'other', title: t('reorder.other'), ledgers: others },
  ].filter((s) => s.ledgers.length > 0);

  return (
    <Screen>
      <ScreenHeader title={t('reorder.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView
        scrollEnabled={!dragging}
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 18, gap: 20 }}
      >
        <Txt size={14} lineHeight={21} style={{ paddingHorizontal: 6 }}>
          {t('reorder.note')}
        </Txt>
        {sections.map((section) => (
          <View key={section.key} style={{ gap: 10 }}>
            <SectionLabel>{section.title}</SectionLabel>
            <DraggableList
              ledgers={section.ledgers}
              starred={section.key === 'pinned'}
              onDragChange={setDragging}
              onToggleStar={(id) => repo.setLedgerPrefs({ [id]: { starred: section.key !== 'pinned' } })}
              onReorder={(ids) =>
                saveOrder(
                  section.key === 'pinned'
                    ? [...ids, ...others.map((l) => l.id)]
                    : [...pinned.map((l) => l.id), ...ids],
                )
              }
            />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function DraggableList({
  ledgers,
  starred,
  onToggleStar,
  onReorder,
  onDragChange,
}: {
  ledgers: Ledger[];
  starred: boolean;
  onToggleStar: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onDragChange: (dragging: boolean) => void;
}) {
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  const ids = ledgers.map((l) => l.id);
  const target = drag ? Math.max(0, Math.min(ids.length - 1, Math.round(drag.index + drag.dy / SLOT))) : -1;

  const offsetFor = (i: number) => {
    if (!drag || i === drag.index) return 0;
    if (drag.index < i && i <= target) return -SLOT;
    if (target <= i && i < drag.index) return SLOT;
    return 0;
  };

  return (
    <View style={{ gap: 10 }}>
      {ledgers.map((ledger, index) => (
        <ReorderRow
          key={ledger.id}
          ledger={ledger}
          starred={starred}
          lifted={drag?.index === index}
          translateY={drag?.index === index ? drag.dy : offsetFor(index)}
          onToggleStar={() => onToggleStar(ledger.id)}
          onDragStart={() => {
            onDragChange(true);
            setDrag({ index, dy: 0 });
          }}
          onDragMove={(dy) => setDrag({ index, dy })}
          onDragEnd={(dy) => {
            const to = Math.max(0, Math.min(ids.length - 1, Math.round(index + dy / SLOT)));
            setDrag(null);
            onDragChange(false);
            if (to !== index) onReorder(moveItem(ids, index, to));
          }}
          onMove={(delta) => {
            const to = index + delta;
            if (to >= 0 && to < ids.length) onReorder(moveItem(ids, index, to));
          }}
        />
      ))}
    </View>
  );
}

function ReorderRow({
  ledger,
  starred,
  lifted,
  translateY,
  onToggleStar,
  onDragStart,
  onDragMove,
  onDragEnd,
  onMove,
}: {
  ledger: Ledger;
  starred: boolean;
  lifted: boolean;
  translateY: number;
  onToggleStar: () => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  onMove: (delta: number) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  // Keep the latest callbacks without rebuilding the responder mid-gesture.
  const handlers = useRef({ onDragStart, onDragMove, onDragEnd });
  useEffect(() => {
    handlers.current = { onDragStart, onDragMove, onDragEnd };
  });

  const responder = useMemo(
    () =>
      // The handlers read the ref inside gesture events, never during render.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => handlers.current.onDragStart(),
        onPanResponderMove: (_, g) => handlers.current.onDragMove(g.dy),
        onPanResponderRelease: (_, g) => handlers.current.onDragEnd(g.dy),
        onPanResponderTerminate: (_, g) => handlers.current.onDragEnd(g.dy),
      }),
    [],
  );

  return (
    <View
      accessible
      accessibilityLabel={`${ledger.name} ${ledger.currency}`}
      accessibilityHint={t('reorder.drag', { name: ledger.name })}
      accessibilityActions={[
        { name: 'moveUp', label: t('reorder.moveUp') },
        { name: 'moveDown', label: t('reorder.moveDown') },
      ]}
      onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName === 'moveUp' ? -1 : 1)}
      style={{
        height: ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingRight: 6,
        borderRadius: 999,
        backgroundColor: lifted ? colors.bg : colors.neutral[100],
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.6)',
        boxShadow: lifted ? shadows.lg : shadows.sm,
        zIndex: lifted ? 10 : 0,
        transform: [{ translateY }, { rotate: lifted ? '-1.5deg' : '0deg' }, { scale: lifted ? 1.02 : 1 }],
      }}
    >
      <View
        {...responder.panHandlers}
        style={{
          width: 44,
          height: ROW_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 6,
        }}
      >
        <Icon name="grip-vertical" size={18} color={colors.neutral[600]} />
      </View>
      {ledger.kind === 'shared' && <Icon name="users" size={15} color={colors.accent2Ramp[700]} />}
      <Txt font="semibold" size={15} style={{ flex: 1 }} numberOfLines={1}>
        {ledger.name}
      </Txt>
      <Txt font="bold" size={11} color={colors.neutral[700]} style={{ letterSpacing: 0.55 }}>
        {ledger.currency}
      </Txt>
      <StarToggle
        on={starred}
        onPress={onToggleStar}
        accessibilityLabel={t('reorder.pin', { name: ledger.name })}
      />
    </View>
  );
}
