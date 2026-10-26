// Web: localStorage. On iOS / Android Metro picks kv.native.ts (SQLite-backed).
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
}

export const kv: KeyValueStore = {
  getItem: async (key) => storage()?.getItem(key) ?? null,
  setItem: async (key, value) => storage()?.setItem(key, value),
  removeItem: async (key) => storage()?.removeItem(key),
  getAllKeys: async () => {
    const s = storage();
    return s
      ? Array.from({ length: s.length }, (_, i) => s.key(i)).filter((k): k is string => k !== null)
      : [];
  },
};
