import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import type { NewMember } from '@/data/repo';
import { useI18n } from '@/i18n';
import type { ShareHandling } from '@/lib/domain';
import { PillButton, RadioDot } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Dialog } from '@/ui/Overlay';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useScreenOverlay } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { Avatar, avatarColor } from './members';

/** Key of a pickable person: `f:<uid>` for a friend, `p:<id>` for a placeholder friend. */
export type PersonKey = string;

export function usePeople() {
  const { friends } = useAppData();
  const starredFirst = [...friends.friends].sort((a, b) => Number(b.starred) - Number(a.starred));
  const people = [
    ...starredFirst.map((f) => ({
      key: `f:${f.uid}`,
      name: f.name,
      placeholder: false,
      member: { uid: f.uid, placeholderId: null, name: f.name },
    })),
    ...friends.placeholders
      .filter((p) => !p.mergedUid)
      .map((p) => ({
        key: `p:${p.id}`,
        name: p.name,
        placeholder: true,
        member: { uid: null, placeholderId: p.id, name: p.name },
      })),
  ];
  return people satisfies { key: PersonKey; name: string; placeholder: boolean; member: NewMember }[];
}

/**
 * Friend and placeholder-friend chips for a shared ledger, starred friends first,
 * plus "Add placeholder friend" for someone not on the app yet. `exclude` hides
 * people already in the ledger.
 */
export function MemberPicker({
  selected,
  onChange,
  exclude = [],
}: {
  selected: PersonKey[];
  onChange: (selected: PersonKey[]) => void;
  exclude?: PersonKey[];
}) {
  const colors = useColors();
  const { t } = useI18n();
  const people = usePeople().filter((p) => !exclude.includes(p.key));

  return (
    <View style={{ gap: 8 }}>
      {people.length === 0 && (
        <Txt size={13} color={colors.neutral[700]}>
          {t('friends.none')}
        </Txt>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {people.map((p, i) => {
          const on = selected.includes(p.key);
          return (
            <Pressable
              key={p.key}
              accessibilityRole="checkbox"
              aria-checked={on}
              onPress={() => onChange(on ? selected.filter((k) => k !== p.key) : [...selected, p.key])}
              style={{
                height: 44,
                paddingLeft: 7,
                paddingRight: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: on ? 'transparent' : colors.divider,
                backgroundColor: on ? colors.accent2Ramp[200] : 'transparent',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Avatar name={p.name} color={avatarColor(colors, i, false)} dashed={p.placeholder} />
              <Txt font="semibold" size={14}>
                {p.placeholder ? t('ledger.placeholderTag', { name: p.name }) : p.name}
              </Txt>
            </Pressable>
          );
        })}
        <AddPlaceholderButton onAdded={(id) => onChange([...selected, `p:${id}`])} />
      </View>
    </View>
  );
}

/**
 * "Add placeholder friend": a name for someone not on the app yet. The dialog
 * opens through the screen overlay, so it covers the whole screen even when the
 * button sits inside scrolling content.
 */
export function AddPlaceholderButton({ onAdded }: { onAdded?: (id: string) => void }) {
  const colors = useColors();
  const { t } = useI18n();
  const showOverlay = useScreenOverlay();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        showOverlay(
          <AddPlaceholderDialog
            onClose={() => showOverlay(null)}
            onAdded={(id) => {
              onAdded?.(id);
              showOverlay(null);
            }}
          />,
        )
      }
      style={{
        height: 44,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.neutral[500],
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
      }}
    >
      <Icon name="plus" size={15} color={colors.text} />
      <Txt font="semibold" size={14}>
        {t('friends.addPlaceholder')}
      </Txt>
    </Pressable>
  );
}

function AddPlaceholderDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const [name, setName] = useState('');

  const add = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = repo.addPlaceholder(trimmed);
    toast(t('friends.placeholderAdded', { name: trimmed }));
    onAdded(id);
  };

  return (
    <Dialog onClose={onClose}>
      <Txt font="heading" size={22}>
        {t('friends.addPlaceholder')}
      </Txt>
      <Txt size={14} color={colors.neutral[800]}>
        {t('friends.placeholderSub')}
      </Txt>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('friends.placeholderName')}
        placeholderTextColor={colors.neutral[600]}
        accessibilityLabel={t('friends.placeholderName')}
        autoFocus
        maxLength={40}
        onSubmitEditing={add}
        style={{
          height: 52,
          paddingHorizontal: 18,
          borderRadius: 999,
          backgroundColor: colors.bg,
          fontFamily: fonts.body,
          fontSize: 16,
          color: colors.text,
        }}
      />
      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
        <PillButton label={t('common.cancel')} variant="outline" onPress={onClose} />
        <PillButton label={t('common.save')} onPress={add} disabled={!name.trim()} />
      </View>
    </Dialog>
  );
}

/** "Your share": each entry / never / ask at the end. Each member sets their own. */
export function ShareHandlingPicker({
  value,
  onChange,
}: {
  value: ShareHandling;
  onChange: (value: ShareHandling) => void;
}) {
  const colors = useColors();
  const { t } = useI18n();
  const options: { value: ShareHandling; label: string }[] = [
    { value: 'each', label: t('ledger.each') },
    { value: 'never', label: t('ledger.never') },
    { value: 'ask', label: t('ledger.ask') },
  ];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 4 }}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            aria-checked={value === o.value}
            onPress={() => onChange(o.value)}
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <RadioDot on={value === o.value} />
            <Txt size={14} style={{ flex: 1 }}>
              {o.label}
            </Txt>
          </Pressable>
        ))}
      </View>
      <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
        {t('ledger.eachSets')}
      </Txt>
    </View>
  );
}
