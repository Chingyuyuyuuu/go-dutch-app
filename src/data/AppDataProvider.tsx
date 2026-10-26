import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCalendars, useLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import i18n, { resolveLocale, setAppLocale } from '@/i18n';
import type { LocalDate } from '@/lib/date';
import { todayLocal } from '@/lib/date';
import {
  DEFAULT_PROFILE,
  type BankAccount,
  type Entry,
  type Ledger,
  type LedgerPref,
  type Recurring,
  type UserProfile,
} from '@/lib/domain';
import { orderLedgers } from '@/lib/ledgers';
import { useToast } from '@/ui/Toast';

import { supabaseAuth } from './auth/supabaseAuth';
import type { AuthUser } from './auth/types';
import { DEMO_UID, seedDemo } from './demo/seed';
import { newId } from './ids';
import { kv } from './local/kv';
import { LocalRepo } from './local/LocalRepo';
import { LocalStore } from './local/LocalStore';
import type { DataRepo, FriendsState } from './repo';
import { getSupabase, isSupabaseConfigured } from './supabase/client';
import { supabaseMedia } from './supabase/photos';
import { SupabaseRemote } from './supabase/SupabaseRemote';
import { SyncEngine } from './sync/SyncEngine';
import { onForeground, onReconnect } from './sync/triggers';

const SESSION_KEY = 'go-dutch/session';
const DEMO_NAMESPACE = 'gd/v2/demo';
const userNamespace = (uid: string) => `gd/v2/user/${uid}`;

type Session =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'ready'; repo: DataRepo; user: AuthUser | null };

type AppData = {
  session: Session;
  /** Supabase is configured, so accounts and sync are available. */
  cloudEnabled: boolean;
  /** Only valid when session.status === 'ready'. */
  repo: DataRepo | null;
  user: AuthUser | null;
  profile: UserProfile;
  ledgers: Ledger[];
  /** Ledgers in home-tab order. */
  orderedLedgers: Ledger[];
  prefs: Record<string, LedgerPref>;
  loaded: boolean;
  /** Changes on this device not uploaded yet. */
  pending: number;
  friends: FriendsState;
  /** When each ledger was last opened on this device. */
  seen: Record<string, number>;
  /** My recurring payments, plus recurring splits of my shared ledgers. */
  recurring: Recurring[];
  banks: BankAccount[];
  /** Accounts only: deletes the account on the server, then this device's copy, and signs out. */
  deleteAccount: () => Promise<'ok' | 'offline'>;
  startDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  resetDemo: () => Promise<void>;
};

const AppDataContext = createContext<AppData | null>(null);

async function openDemo(fresh = false): Promise<DataRepo> {
  if (fresh) await LocalStore.clear(kv, DEMO_NAMESPACE);
  const names = i18n.getResourceBundle(i18n.language, 'translation').demo;
  const store = await LocalStore.openOrCreate(kv, DEMO_NAMESPACE, () => seedDemo(todayLocal(), names));
  return new LocalRepo('demo', DEMO_UID, store, newId);
}

/** The signed-in user's local copy plus background sync with Supabase. */
async function openCloud(uid: string, onError: (e: unknown) => void) {
  const store = await LocalStore.openOrCreate(kv, userNamespace(uid));
  const timeZone = () => getCalendars()[0]?.timeZone ?? null;
  const engine = new SyncEngine(store, new SupabaseRemote(getSupabase(), uid, timeZone), {
    newId,
    onError,
    triggers: [onReconnect, onForeground],
  });
  engine.start();
  const media = supabaseMedia(getSupabase(), uid, newId);
  return { repo: new LocalRepo('cloud', uid, store, newId, engine, media), stop: () => engine.stop() };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const deviceLocales = useLocales();
  const cloudEnabled = isSupabaseConfigured();
  const [authUser, setAuthUser] = useState<AuthUser | null | undefined>(undefined);
  const [demoChosen, setDemoChosen] = useState<boolean | undefined>(undefined);
  const [demoRepo, setDemoRepo] = useState<DataRepo | null>(null);
  const [cloud, setCloud] = useState<{ uid: string; repo: DataRepo } | null>(null);

  // Reads the message at call time so a language change does not recreate the repo.
  const onWriteError = useCallback(
    (error: unknown) => {
      console.warn('[data] sync rejected a change', error);
      toast(i18n.t('common.somethingWrong'));
    },
    [toast],
  );

  // Before any profile loads, follow the phone language.
  useEffect(() => {
    setAppLocale(resolveLocale('system', deviceLocales));
  }, [deviceLocales]);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY)
      .then((v) => setDemoChosen(v === 'demo'))
      .catch(() => setDemoChosen(false));
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    return supabaseAuth.onChange(setAuthUser);
  }, [cloudEnabled]);

  // Demo mode: always without Supabase, or when chosen on the sign-in screen.
  const wantDemo = demoChosen !== undefined && (!cloudEnabled || (demoChosen && !authUser));
  useEffect(() => {
    if (!wantDemo || demoRepo) return;
    let cancelled = false;
    void openDemo().then((repo) => {
      if (!cancelled) setDemoRepo(repo);
    });
    return () => {
      cancelled = true;
    };
  }, [wantDemo, demoRepo]);

  const authUid = authUser?.uid;
  useEffect(() => {
    if (!authUid) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void openCloud(authUid, onWriteError).then((opened) => {
      if (cancelled) return opened.stop();
      stop = opened.stop;
      setCloud({ uid: authUid, repo: opened.repo });
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [authUid, onWriteError]);

  const cloudRepo = cloud && cloud.uid === authUid ? cloud.repo : null;
  const session: Session = useMemo(() => {
    if (demoChosen === undefined) return { status: 'loading' };
    if (wantDemo) return demoRepo ? { status: 'ready', repo: demoRepo, user: null } : { status: 'loading' };
    if (authUser === undefined) return { status: 'loading' };
    if (authUser === null) return { status: 'signedOut' };
    return cloudRepo ? { status: 'ready', repo: cloudRepo, user: authUser } : { status: 'loading' };
  }, [demoChosen, wantDemo, demoRepo, authUser, cloudRepo]);

  const repo = session.status === 'ready' ? session.repo : null;
  // Each value remembers which repo it came from, so stale data never shows after switching.
  const [profile, setProfile] = useState<Tagged<UserProfile>>({ repo: null, value: DEFAULT_PROFILE });
  const [ledgers, setLedgers] = useState<Tagged<Ledger[]>>({ repo: null, value: [] });
  const [prefs, setPrefs] = useState<Tagged<Record<string, LedgerPref>>>({ repo: null, value: {} });
  const [ready, setReady] = useState<Tagged<boolean>>({ repo: null, value: false });
  const [pending, setPending] = useState<Tagged<number>>({ repo: null, value: 0 });
  const [friends, setFriends] = useState<Tagged<FriendsState>>({ repo: null, value: EMPTY_FRIENDS });
  const [seen, setSeen] = useState<Tagged<Record<string, number>>>({ repo: null, value: {} });
  const [recurring, setRecurring] = useState<Tagged<Recurring[]>>({ repo: null, value: [] });
  const [banks, setBanks] = useState<Tagged<BankAccount[]>>({ repo: null, value: [] });

  useEffect(() => {
    if (!repo) return;
    const unsubs = [
      repo.subscribeProfile((value) => setProfile({ repo, value })),
      repo.subscribeLedgers((value) => setLedgers({ repo, value })),
      repo.subscribeLedgerPrefs((value) => setPrefs({ repo, value })),
      repo.subscribeReady((value) => setReady({ repo, value })),
      repo.subscribePending((value) => setPending({ repo, value })),
      repo.subscribeFriends((value) => setFriends({ repo, value })),
      repo.subscribeSeen((value) => setSeen({ repo, value })),
      repo.subscribeRecurring((value) => setRecurring({ repo, value })),
      repo.subscribeBanks((value) => setBanks({ repo, value })),
    ];
    return () => unsubs.forEach((u) => u());
  }, [repo]);

  // The demo records due recurring charges on the device (the server does it for accounts).
  useEffect(() => {
    if (repo?.kind !== 'demo') return;
    repo.catchUpRecurring();
    return onForeground(() => repo.catchUpRecurring());
  }, [repo]);

  const current = <T,>(tagged: Tagged<T>, fallback: T) => (tagged.repo === repo ? tagged.value : fallback);
  const profileValue = current(profile, DEFAULT_PROFILE);
  const ledgersValue = current(ledgers, EMPTY_LEDGERS);
  const prefsValue = current(prefs, EMPTY_PREFS);
  const pendingValue = current(pending, 0);
  const friendsValue = current(friends, EMPTY_FRIENDS);
  const seenValue = current(seen, EMPTY_SEEN);
  const recurringValue = current(recurring, EMPTY_RECURRING);
  const banksValue = current(banks, EMPTY_BANKS);
  const loaded = !!repo && current(ready, false) && ledgers.repo === repo && prefs.repo === repo;

  useEffect(() => {
    setAppLocale(resolveLocale(profileValue.locale, deviceLocales));
  }, [profileValue.locale, deviceLocales]);

  const startDemo = useCallback(async () => {
    await AsyncStorage.setItem(SESSION_KEY, 'demo');
    setDemoChosen(true);
  }, []);

  // Unsent changes stay on the device under this account and upload at the next sign-in.
  const signOut = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setDemoChosen(false);
    if (authUser) await supabaseAuth.signOut();
  }, [authUser]);

  const homePhoto = profileValue.homePhoto;
  const deleteAccount = useCallback(async () => {
    if (!authUser) return 'offline' as const;
    const result = await supabaseAuth.deleteAccount(homePhoto);
    if (result !== 'ok') return result;
    await AsyncStorage.removeItem(SESSION_KEY);
    setDemoChosen(false);
    // Give the closing sync a moment to finish its last write, then forget this account's data here.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await LocalStore.clear(kv, userNamespace(authUser.uid));
    return result;
  }, [authUser, homePhoto]);

  const resetDemo = useCallback(async () => {
    setDemoRepo(await openDemo(true));
  }, []);

  const value = useMemo<AppData>(
    () => ({
      session,
      cloudEnabled,
      repo,
      user: session.status === 'ready' ? session.user : null,
      profile: profileValue,
      ledgers: ledgersValue,
      orderedLedgers: orderLedgers(ledgersValue, prefsValue),
      prefs: prefsValue,
      loaded,
      pending: pendingValue,
      friends: friendsValue,
      seen: seenValue,
      recurring: recurringValue,
      banks: banksValue,
      deleteAccount,
      startDemo,
      signOut,
      resetDemo,
    }),
    [
      session,
      cloudEnabled,
      repo,
      profileValue,
      ledgersValue,
      prefsValue,
      loaded,
      pendingValue,
      friendsValue,
      seenValue,
      recurringValue,
      banksValue,
      deleteAccount,
      startDemo,
      signOut,
      resetDemo,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

type Tagged<T> = { repo: DataRepo | null; value: T };
const EMPTY_LEDGERS: Ledger[] = [];
const EMPTY_PREFS: Record<string, LedgerPref> = {};
const EMPTY_ENTRIES: Entry[] = [];
const EMPTY_FRIENDS: FriendsState = { friends: [], placeholders: [], invites: [] };
const EMPTY_SEEN: Record<string, number> = {};
const EMPTY_RECURRING: Recurring[] = [];
const EMPTY_BANKS: BankAccount[] = [];

/** Entries of every date, for shared ledgers (balances need all of them). */
export const ALL_TIME = '0000-01-01';

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}

/** The active repo. Screens behind the sign-in gate can rely on it. */
export function useRepo(): DataRepo {
  const { repo } = useAppData();
  if (!repo) throw new Error('No data repo: not signed in');
  return repo;
}

/** Live entries for one ledger from `since` (inclusive). */
export function useLedgerEntries(ledgerId: string | undefined, since: LocalDate): Entry[] {
  const { repo } = useAppData();
  const key = repo && ledgerId ? `${repo.kind}:${repo.uid}:${ledgerId}:${since}` : null;
  const [state, setState] = useState<{ key: string | null; entries: Entry[] }>({
    key: null,
    entries: EMPTY_ENTRIES,
  });
  useEffect(() => {
    if (!repo || !ledgerId || !key) return;
    return repo.subscribeEntries(ledgerId, since, (entries) => setState({ key, entries }));
  }, [repo, ledgerId, since, key]);
  return state.key === key ? state.entries : EMPTY_ENTRIES;
}

/** Live entries of several ledgers from `since` (inclusive), in one list. */
export function useEntriesOf(ledgerIds: string[], since: LocalDate): Entry[] {
  const { repo } = useAppData();
  const idsKey = ledgerIds.join(',');
  const key = repo ? `${repo.kind}:${repo.uid}:${idsKey}:${since}` : null;
  const [state, setState] = useState<{ key: string | null; byLedger: Record<string, Entry[]> }>({
    key: null,
    byLedger: {},
  });
  useEffect(() => {
    if (!repo || !key) return;
    const ids = idsKey ? idsKey.split(',') : [];
    const unsubs = ids.map((id) =>
      repo.subscribeEntries(id, since, (entries) =>
        setState((prev) => ({
          key,
          byLedger: { ...(prev.key === key ? prev.byLedger : {}), [id]: entries },
        })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [repo, key, idsKey, since]);
  return useMemo(
    () => (state.key === key ? Object.values(state.byLedger).flat() : EMPTY_ENTRIES),
    [state, key],
  );
}
