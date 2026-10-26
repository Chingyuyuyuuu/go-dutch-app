import '@/i18n';

import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider, useAppData } from '@/data/AppDataProvider';
import { FONT_ASSETS } from '@/ui/theme/fonts';
import { ThemeProvider, useColors } from '@/ui/theme/ThemeProvider';
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
  const { session } = useAppData();
  if (session.status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const signedIn = session.status === 'ready';

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="add/index" />
        <Stack.Screen name="add/category" />
        <Stack.Screen name="ledger/new" />
        <Stack.Screen name="entry/[ledgerId]/[entryId]" />
        <Stack.Screen name="reorder" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
