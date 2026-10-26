import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { ALL_TIME, useAppData, useLedgerEntries, useRepo } from '@/data/AppDataProvider';
import { EndLedgerDialog } from '@/features/home/EndLedgerDialog';
import { Avatar, memberColor, memberName } from '@/features/shared/members';
import { MemberPicker, ShareHandlingPicker, usePeople, type PersonKey } from '@/features/shared/MemberPicker';
import { useI18n } from '@/i18n';
import { currencyName } from '@/lib/currency';
import { memberForUid } from '@/lib/domain';
import { PillButton, SectionLabel, Tag } from '@/ui/Buttons';
import { Dialog } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

/**
 * Ledger settings (not in the design handoff; same parts as New ledger). Opened
 * by long-pressing a tab or from the bottom of a ledger.
 */
export function LedgerSettingsScreen() {
  const colors = useColors();
  const { t, lang } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const { ledgers, prefs } = useAppData();
  const people = usePeople();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ledger = ledgers.find((l) => l.id === id);
  const entries = useLedgerEntries(ledger?.kind === 'shared' ? ledger.id : undefined, ALL_TIME);
  const [name, setName] = useState(ledger?.name ?? '');
  const [adding, setAdding] = useState<PersonKey[]>([]);
  const [overlay, setOverlay] = useState<'remove' | 'end' | null>(null);

  if (!ledger) return <Redirect href="/" />;
  const shared = ledger.kind === 'shared';
  const me = memberForUid(ledger, repo.uid);
  const inLedger: PersonKey[] = ledger.members.flatMap((m) => [
    ...(m.uid ? [`f:${m.uid}`] : []),
    ...(m.placeholderId ? [`p:${m.placeholderId}`] : []),
  ]);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return toast(t('ledger.nameRequired'));
    repo.updateLedger(ledger.id, { name: trimmed });
    toast(t('ledger.renamed'));
  };

  const addMembers = () => {
    const members = people.filter((p) => adding.includes(p.key)).map((p) => p.member);
    if (members.length === 0) return;
    repo.addLedgerMembers(ledger.id, members);
    setAdding([]);
    toast(t('ledger.membersAdded'));
  };

  const remove = () => {
    repo.removeLedger(ledger.id);
    toast(shared ? t('ledger.removed', { name: ledger.name }) : t('ledger.deleted', { name: ledger.name }));
    router.dismissAll();
  };

  return (
    <Screen>
      <ScreenHeader
        title={t('ledger.settingsTitle')}
        onBack={() => router.back()}
        backLabel={t('common.back')}
      />
      <ScrollView
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 20, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 6 }}>
          <Txt font="semibold" size={13} color={colors.neutral[700]}>
            {t('ledger.name')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={name}
              onChangeText={setName}
              accessibilityLabel={t('ledger.name')}
              maxLength={40}
              onSubmitEditing={saveName}
              style={{
                flex: 1,
                height: 52,
                paddingHorizontal: 18,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.divider,
                backgroundColor: colors.surface,
                fontFamily: fonts.body,
                fontSize: 16,
                color: colors.text,
              }}
            />
            {name.trim() !== ledger.name && (
              <PillButton label={t('common.save')} height={52} onPress={saveName} />
            )}
          </View>
          <Txt size={12} color={colors.neutral[700]} style={{ paddingLeft: 6 }}>
            {t('ledger.currencyFixed', { cur: `${ledger.currency} ${currencyName(ledger.currency, lang)}` })}
          </Txt>
        </View>

        {shared && (
          <View style={{ gap: 8 }}>
            <SectionLabel>{t('ledger.members')}</SectionLabel>
            <View style={{ borderRadius: 24, backgroundColor: colors.surface, paddingVertical: 6 }}>
              {ledger.members.map((m) => (
                <View
                  key={m.id}
                  style={{
                    minHeight: 52,
                    paddingHorizontal: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <Avatar
                    name={memberName(m, repo.uid, t)}
                    color={memberColor(colors, ledger, m.id, repo.uid)}
                    dashed={!m.uid}
                  />
                  <Txt font="semibold" size={15} style={{ flex: 1 }}>
                    {m.uid ? memberName(m, repo.uid, t) : t('ledger.placeholderTag', { name: m.name })}
                  </Txt>
                  {m.leftAt !== null && (
                    <Tag
                      label={t('ledger.leftTag')}
                      background={colors.neutral[200]}
                      color={colors.neutral[800]}
                    />
                  )}
                </View>
              ))}
            </View>
            {ledger.status === 'active' && (
              <>
                <Txt font="semibold" size={13} color={colors.neutral[700]} style={{ paddingTop: 6 }}>
                  {t('ledger.addMembers')}
                </Txt>
                <MemberPicker selected={adding} onChange={setAdding} exclude={inLedger} />
                {adding.length > 0 && (
                  <View style={{ flexDirection: 'row' }}>
                    <PillButton label={t('ledger.addMembers')} variant="sage" onPress={addMembers} />
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {shared && (
          <View style={{ gap: 8 }}>
            <SectionLabel>{t('ledger.yourShare')}</SectionLabel>
            <ShareHandlingPicker
              value={prefs[ledger.id]?.shareHandling ?? 'ask'}
              onChange={(shareHandling) => repo.setLedgerPrefs({ [ledger.id]: { shareHandling } })}
            />
          </View>
        )}

        <View style={{ gap: 10, paddingTop: 4 }}>
          {shared &&
            (ledger.status === 'active' ? (
              <PillButton label={t('end.end')} variant="outline" onPress={() => setOverlay('end')} />
            ) : (
              <PillButton
                label={t('home.reopen')}
                variant="outline"
                onPress={() => {
                  repo.updateLedger(ledger.id, { status: 'active' });
                  toast(t('end.reopened', { name: ledger.name }));
                }}
              />
            ))}
          <PillButton
            label={shared ? t('ledger.removeShared') : t('ledger.delete')}
            variant="danger"
            icon="trash-2"
            onPress={() => setOverlay('remove')}
          />
        </View>
      </ScrollView>

      {overlay === 'remove' && (
        <Dialog onClose={() => setOverlay(null)}>
          <Txt font="heading" size={22} lineHeight={27}>
            {shared
              ? t('ledger.leaveTitle', { name: ledger.name })
              : t('ledger.deleteTitle', { name: ledger.name })}
          </Txt>
          <Txt size={14} color={colors.neutral[800]} lineHeight={20}>
            {shared ? t('ledger.leaveBody') : t('ledger.deleteBody')}
          </Txt>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              marginTop: 6,
            }}
          >
            <PillButton label={t('common.cancel')} variant="outline" onPress={() => setOverlay(null)} />
            <PillButton
              label={shared ? t('ledger.removeShared') : t('ledger.delete')}
              variant="danger"
              onPress={remove}
            />
          </View>
        </Dialog>
      )}
      {overlay === 'end' && me && (
        <EndLedgerDialog ledger={ledger} me={me} entries={entries} onClose={() => setOverlay(null)} />
      )}
    </Screen>
  );
}
