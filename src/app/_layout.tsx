import '@/i18n';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider, useAppData } from '@/data/AppDataProvider';
import { useAcceptPendingInvite } from '@/features/friends/usePendingInvite';
import { useReminders } from '@/features/notifications/useReminders';
import { FONT_ASSETS } from '@/ui/theme/fonts';
import { ThemeProvider, useApplyTheme, useColors } from '@/ui/theme/ThemeProvider';
import { ToastProvider } from '@/ui/Toast';
import { WebFrame } from '@/ui/WebFrame';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <WebFrame>
          <ToastProvider>
            <AppDataProvider>
              <StatusBar style="dark" />
              <RootStack />
            </AppDataProvider>
          </ToastProvider>
        </WebFrame>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function RootStack() {
  const colors = useColors();
  const { session, profile } = useAppData();
  useApplyTheme(profile.bgTheme, profile.accentTheme);
  useAcceptPendingInvite();
  useReminders();
  if (session.status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const signedIn = session.status === 'ready';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="add/index" />
        <Stack.Screen name="add/category" />
        <Stack.Screen name="add/split" />
        <Stack.Screen name="ledger/new" />
        <Stack.Screen name="ledger/[id]" />
        <Stack.Screen name="friends" />
        <Stack.Screen name="entry/[ledgerId]/[entryId]" />
        <Stack.Screen name="reorder" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="recurring/index" />
        <Stack.Screen name="recurring/[id]" />
        <Stack.Screen name="banks" />
        <Stack.Screen name="monthly" />
        <Stack.Screen name="appearance" />
        <Stack.Screen name="widgets" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      {/* Invite links work signed in or out. */}
      <Stack.Screen name="invite/[code]" />
    </Stack>
  );
}
