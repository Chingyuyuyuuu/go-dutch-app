import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { useAppData, useRepo } from '@/data/AppDataProvider';
import { Avatar, avatarColor } from '@/features/shared/members';
import { AddPlaceholderButton } from '@/features/shared/MemberPicker';
import { useI18n } from '@/i18n';
import type { PlaceholderFriend } from '@/lib/domain';
import { PillButton, SectionLabel, StarToggle } from '@/ui/Buttons';
import { Icon } from '@/ui/Icon';
import { Dialog, Sheet } from '@/ui/Overlay';
import { Screen, ScreenHeader } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

import { inviteLink, shareText } from './invites';
import { useAcceptInvite } from './useAcceptInvite';

type Overlay = { kind: 'qr'; placeholder: PlaceholderFriend | null; code: string } | { kind: 'code' } | null;

/** Screen 10: friends, placeholder friends and invites. */
export function FriendsScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const toast = useToast();
  const repo = useRepo();
  const accept = useAcceptInvite();
  const { friends, ledgers } = useAppData();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [code, setCode] = useState('');

  const inCommon = (uid: string) =>
    ledgers
      .filter((l) => l.kind === 'shared' && l.memberUids.includes(uid))
      .map((l) => l.name)
      .join(t('split.namesJoin'));

  const share = async (placeholder: PlaceholderFriend | null) => {
    const inviteCode = repo.createInvite(placeholder?.id ?? null);
    const link = inviteLink(inviteCode);
    const message = link
      ? t('friends.inviteMessage', { link })
      : t('friends.codeMessage', { code: inviteCode });
    const result = await shareText(message, link ?? inviteCode);
    if (result === 'copied') toast(t('friends.copied'));
  };

  const join = async () => {
    const { result } = await accept(code);
    if (result === 'ok') {
      setCode('');
      setOverlay(null);
    }
  };

  const starred = friends.friends.filter((f) => f.starred);
  const others = friends.friends.filter((f) => !f.starred);
  const waiting = friends.placeholders.filter((p) => !p.mergedUid);

  const friendRow = (f: (typeof friends.friends)[number], i: number) => (
    <View
      key={f.uid}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 4 }}
    >
      <Avatar name={f.name} color={avatarColor(colors, i, false)} size={42} />
      <View style={{ flex: 1 }}>
        <Txt font="semibold" size={15}>
          {f.name}
        </Txt>
        {inCommon(f.uid) ? (
          <Txt size={12.5} color={colors.neutral[700]} numberOfLines={1}>
            {inCommon(f.uid)}
          </Txt>
        ) : null}
      </View>
      <StarToggle
        on={f.starred}
        onPress={() => repo.setFriendStarred(f.uid, !f.starred)}
        accessibilityLabel={t('friends.star', { name: f.name })}
      />
    </View>
  );

  const showQr = (placeholder: PlaceholderFriend | null) =>
    setOverlay({ kind: 'qr', placeholder, code: repo.createInvite(placeholder?.id ?? null) });
  const qr = overlay?.kind === 'qr' ? overlay : null;
  const qrValue = qr ? (inviteLink(qr.code) ?? qr.code) : '';

  return (
    <Screen>
      <ScreenHeader title={t('friends.title')} onBack={() => router.back()} backLabel={t('common.back')} />
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 18, gap: 18 }}>
        <View style={{ borderRadius: 32, backgroundColor: colors.accent2Ramp[200], padding: 20, gap: 12 }}>
          <Txt font="heading" size={22} color={colors.accent2Ramp[900]}>
            {t('friends.invite')}
          </Txt>
          <Txt size={14} color={colors.accent2Ramp[900]}>
            {t('friends.inviteBody')}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void share(null)}
              style={{
                height: 46,
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: colors.accent2Ramp[800],
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="link" size={16} color={colors.accent2Ramp[100]} />
              <Txt font="heading" size={15} color={colors.accent2Ramp[100]}>
                {t('friends.shareLink')}
              </Txt>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => showQr(null)}
              style={{
                height: 46,
                paddingHorizontal: 18,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.accent2Ramp[700],
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="qr-code" size={16} color={colors.accent2Ramp[900]} />
              <Txt font="heading" size={15} color={colors.accent2Ramp[900]}>
                {t('friends.qr')}
              </Txt>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setOverlay({ kind: 'code' })}
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Icon name="keyboard" size={16} color={colors.accent2Ramp[900]} />
            <Txt font="semibold" size={14} color={colors.accent2Ramp[900]}>
              {t('friends.enterCode')}
            </Txt>
          </Pressable>
        </View>

        {friends.friends.length === 0 && waiting.length === 0 && (
          <Txt size={14} color={colors.neutral[700]}>
            {t('friends.none')}
          </Txt>
        )}
        {starred.length > 0 && (
          <View>
            <SectionLabel>{t('friends.starred')}</SectionLabel>
            {starred.map(friendRow)}
          </View>
        )}
        {others.length > 0 && (
          <View>
            <SectionLabel>{t('friends.all')}</SectionLabel>
            {others.map((f, i) => friendRow(f, i + starred.length))}
          </View>
        )}
        {waiting.length > 0 && (
          <View>
            <SectionLabel>{t('friends.notOnApp')}</SectionLabel>
            {waiting.map((p) => (
              <View
                key={p.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 60,
                  paddingHorizontal: 4,
                }}
              >
                <Avatar name={p.name} color="transparent" size={42} dashed />
                <View style={{ flex: 1 }}>
                  <Txt font="semibold" size={15}>
                    {p.name}
                  </Txt>
                  <Txt size={12.5} color={colors.neutral[700]}>
                    {t('friends.placeholderSub')}
                  </Txt>
                </View>
                <PillButton
                  label={t('friends.inviteThem')}
                  variant="outline"
                  height={40}
                  fontSize={14}
                  accessibilityLabel={t('friends.inviteFor', { name: p.name })}
                  onPress={() => showQr(p)}
                />
              </View>
            ))}
          </View>
        )}
        <AddPlaceholderButton />
      </ScrollView>

      {qr && (
        <Sheet
          onClose={() => setOverlay(null)}
          style={{ paddingHorizontal: 22, gap: 14, alignItems: 'center' }}
        >
          <Txt font="heading" size={22} style={{ paddingTop: 8 }} align="center">
            {qr.placeholder ? t('friends.inviteFor', { name: qr.placeholder.name }) : t('friends.invite')}
          </Txt>
          {qr.placeholder && (
            <Txt size={14} color={colors.neutral[800]} align="center">
              {t('friends.personalInviteBody', { name: qr.placeholder.name })}
            </Txt>
          )}
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: colors.white }}>
            <QRCode value={qrValue} size={200} color={colors.text} backgroundColor={colors.white} />
          </View>
          <Txt size={13} color={colors.neutral[700]}>
            {t('friends.code')}
          </Txt>
          <Txt font="bold" size={20} style={{ letterSpacing: 2 }} selectable>
            {qr.code}
          </Txt>
          <PillButton
            label={t('friends.shareLink')}
            variant="sage"
            icon="share-2"
            onPress={() => void share(qr.placeholder)}
          />
        </Sheet>
      )}
      {overlay?.kind === 'code' && (
        <Dialog onClose={() => setOverlay(null)}>
          <Txt font="heading" size={22}>
            {t('friends.enterCode')}
          </Txt>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={t('friends.codePlaceholder')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('friends.code')}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={() => void join()}
            style={{
              height: 52,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: colors.bg,
              fontFamily: fonts.bodyBold,
              fontSize: 18,
              letterSpacing: 2,
              color: colors.text,
            }}
          />
          <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
            <PillButton label={t('common.cancel')} variant="outline" onPress={() => setOverlay(null)} />
            <PillButton
              label={t('friends.join')}
              variant="sage"
              disabled={!code.trim()}
              onPress={() => void join()}
            />
          </View>
        </Dialog>
      )}
    </Screen>
  );
}
