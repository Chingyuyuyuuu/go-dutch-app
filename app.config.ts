import type { ConfigContext, ExpoConfig } from 'expo/config';

// TODO(owner): replace with the final bundle ID / package name before the first store build.
const APP_ID = 'com.godutch.app';

const ZH_HANT = {
  ios: {
    CFBundleDisplayName: 'Chip In 啦',
    NSPhotoLibraryUsageDescription: 'Chip In 啦 會用你選的照片當作首頁背景。',
  },
  android: { app_name: 'Chip In 啦' },
};

// EAS project "godutchapp" on expo.dev (used by `eas deploy` and `eas build`).
const EAS_PROJECT_ID = 'dc0dde5e-5d61-4b71-9841-9dd3d84d3e03';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // App name: "Chiping In" (English and every other language), "Chip In 啦" on Traditional Chinese phones (see `locales`).
  name: 'Chiping In',
  // Must match the slug of the EAS project.
  slug: 'godutchapp',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'godutch',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    // Lets the home screen use the Chinese app name on Chinese phones.
    infoPlist: { CFBundleAllowMixedLocalizations: true },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      backgroundColor: '#f5ead8',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    // One web bundle instead of a file per screen, so the web preview keeps
    // working offline after it has loaded once.
    ['expo-router', { asyncRoutes: { web: false } }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#f5ead8',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    'expo-localization',
    'expo-font',
    // Development / store builds: notification icon colour and the photo permission text.
    // Marigold accent, oklch(0.66 0.15 68).
    ['expo-notifications', { color: '#cd7d00' }],
    [
      'expo-image-picker',
      {
        photosPermission: 'Chiping In uses a photo you choose as your home screen background.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
  ],
  // Home screen name and permission text on Traditional Chinese phones.
  locales: {
    'zh-Hant': ZH_HANT,
    'zh-TW': ZH_HANT,
  },
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
