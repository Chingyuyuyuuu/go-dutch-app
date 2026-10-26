import type { ConfigContext, ExpoConfig } from 'expo/config';

// TODO(owner): replace with the final bundle ID / package name before the first store build.
const APP_ID = 'com.godutch.app';

// EAS project "godutchapp" on expo.dev (used by `eas deploy` and `eas build`).
const EAS_PROJECT_ID = 'dc0dde5e-5d61-4b71-9841-9dd3d84d3e03';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Go Dutch',
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
  ],
  extra: {
    eas: { projectId: EAS_PROJECT_ID },
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
