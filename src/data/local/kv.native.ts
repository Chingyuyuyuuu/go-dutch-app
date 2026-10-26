// iOS / Android: expo-sqlite's key-value store (included in Expo Go). Unlike
// AsyncStorage on Android it has no 6 MB limit, so years of entries fit.
import Storage from 'expo-sqlite/kv-store';

import type { KeyValueStore } from './kv';

export type { KeyValueStore } from './kv';

export const kv: KeyValueStore = Storage;
