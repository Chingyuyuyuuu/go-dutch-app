import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { useAppData } from '@/data/AppDataProvider';
import { supabaseAuth } from '@/data/auth/supabaseAuth';
import { AuthError, type AuthErrorReason } from '@/data/auth/types';
import { useI18n } from '@/i18n';
import { PillButton } from '@/ui/Buttons';
import { Screen } from '@/ui/Screen';
import { fonts } from '@/ui/theme/fonts';
import { useColors } from '@/ui/theme/ThemeProvider';
import { Txt } from '@/ui/Txt';

/**
 * Sign in / create account. Not in the design handoff; uses the same parts.
 * Email works everywhere; Google and Apple redirect on web. iOS shows Apple
 * first, Android shows Google first, as the spec asks.
 */
export function SignInScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const { startDemo } = useAppData();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthErrorReason | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const errorText: Record<AuthErrorReason, string> = {
    'invalid-email': t('auth.invalidEmail'),
    'weak-password': t('auth.weakPassword'),
    'wrong-credentials': t('auth.wrongCredentials'),
    'email-in-use': t('auth.emailInUse'),
    'email-not-confirmed': t('auth.emailNotConfirmed'),
    network: t('auth.network'),
    unavailable: t('auth.socialUnavailable'),
    other: t('common.somethingWrong'),
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof AuthError ? e.reason : 'other');
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (mode === 'signIn') return supabaseAuth.signInWithEmail(email.trim(), password);
      const { needsConfirmation } = await supabaseAuth.signUpWithEmail(email.trim(), password);
      if (needsConfirmation) {
        setNotice(t('auth.checkEmail'));
        setMode('signIn');
      }
    });

  const inputStyle = {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.text,
  } as const;

  const social = [
    { key: 'apple', label: t('auth.apple'), action: () => supabaseAuth.signInWithApple() },
    { key: 'google', label: t('auth.google'), action: () => supabaseAuth.signInWithGoogle() },
  ];
  if (Platform.OS === 'android') social.reverse();

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          <Txt font="heading" size={44} lineHeight={48}>
            {t('auth.title')}
          </Txt>
          <Txt size={16} color={colors.neutral[800]} lineHeight={23} style={{ marginBottom: 12 }}>
            {t('auth.subtitle')}
          </Txt>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('auth.email')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            style={inputStyle}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={t('auth.password')}
            placeholderTextColor={colors.neutral[600]}
            accessibilityLabel={t('auth.password')}
            secureTextEntry
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            onSubmitEditing={submit}
            style={inputStyle}
          />
          {notice && (
            <Txt size={14} color={colors.accent2Ramp[800]} accessibilityLiveRegion="polite">
              {notice}
            </Txt>
          )}
          {error && (
            <Txt size={14} color={colors.negative} accessibilityLiveRegion="polite">
              {errorText[error]}
            </Txt>
          )}
          <PillButton
            label={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
            height={58}
            fontSize={20}
            disabled={busy || !email || !password}
            onPress={submit}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
            style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Txt font="semibold" size={14} color={colors.accentRamp[700]}>
              {mode === 'signIn' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
            </Txt>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
            <Txt size={13} color={colors.neutral[700]}>
              {t('auth.or')}
            </Txt>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.divider }} />
          </View>
          {social.map((s) => (
            <PillButton
              key={s.key}
              label={s.label}
              variant="outline"
              height={52}
              disabled={busy}
              onPress={() => run(s.action)}
            />
          ))}
          <PillButton
            label={t('auth.tryDemo')}
            variant="ghost"
            fontSize={14}
            onPress={() => void startDemo()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
