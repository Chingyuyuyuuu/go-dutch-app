import { randomUUID } from 'expo-crypto';

/** UUID v4 made on the device, so rows can be created offline and synced later. */
export function newId(): string {
  return randomUUID();
}
