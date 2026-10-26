import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import { useI18n } from '@/i18n';
import { PillButton } from '@/ui/Buttons';
import { Screen } from '@/ui/Screen';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

import { rememberInvite } from './invites';
import { useAcceptInvite } from './useAcceptInvite';

/**
 * Opened from an invite link (https://<site>/invite/<code>). Signed in: accept
 * it. Signed out: remember it, and it is accepted right after sign-in.
 */
export function InviteScreen() {
  const { session } = useAppData();
  const { code } = useLocalSearchParams<{ code: string }>();
  if (session.status === 'ready') return <AcceptInvite code={code} />;
  return <SignInFirst code={code} />;
}

function AcceptInvite({ code }: { code: string }) {
  const colors = useColors();
  const { t } = useI18n();
  const accept = useAcceptInvite();
  const [message, setMessage] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void accept(code).then(({ result, message: text }) =>
      setMessage(result === 'ok' ? t('invite.accepted') : text),
    );
  }, [accept, code, t]);

  return (
    <Screen style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
      <Txt font="heading" size={32}>
        {t('invite.title')}
      </Txt>
      <Txt size={16} color={colors.neutral[800]}>
        {message ?? t('invite.joining')}
      </Txt>
      {message && (
        <View style={{ flexDirection: 'row' }}>
          <PillButton label={t('invite.goFriends')} onPress={() => router.replace('/friends')} />
        </View>
      )}
    </Screen>
  );
}

function SignInFirst({ code }: { code: string }) {
  const colors = useColors();
  const { t } = useI18n();
  useEffect(() => {
    if (code) void rememberInvite(code);
  }, [code]);
  return (
    <Screen style={{ justifyContent: 'center', padding: 24, gap: 16 }}>
      <Txt font="heading" size={32}>
        {t('invite.title')}
      </Txt>
      <Txt size={16} color={colors.neutral[800]} lineHeight={23}>
        {t('invite.signInFirst')}
      </Txt>
      <View style={{ flexDirection: 'row' }}>
        <PillButton label={t('invite.goSignIn')} onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
