import type { Ledger } from '@/lib/domain';

import { DEMO_UID, seedDemo } from '../demo/seed';
import { LocalRepo } from '../local/LocalRepo';
import { LocalStore } from '../local/LocalStore';
import { memoryKv } from '../local/memoryKv';
import { enqueueOp, type QueuedOp } from '../local/ops';
import { enAU } from '@/i18n/en-AU';

let seq = 0;
const newId = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;

function demo() {
  const store = LocalStore.create(memoryKv(), 'demo', seedDemo('2026-10-26', enAU.demo, 1_000_000_000));
  return { store, repo: new LocalRepo('demo', DEMO_UID, store, newId) };
}

const ledgerOf = (store: LocalStore, id: string) => store.state.ledgers.find((l) => l.id === id) as Ledger;

describe('outbox folding for ledgers', () => {
  const ledger: Ledger = {
    id: 'trip',
    name: 'Trip',
    currency: 'JPY',
    kind: 'shared',
    status: 'active',
    ownerUid: 'me',
    members: [{ id: 'm-me', uid: 'me', placeholderId: null, name: 'Me', leftAt: null }],
    memberUids: ['me'],
    createdAt: 0,
  };
  const created: QueuedOp[] = [{ kind: 'createSharedLedger', ledger, opId: 'a' }];

  it('folds renames and new members into a ledger that was not sent yet', () => {
    let outbox = enqueueOp(
      created,
      { kind: 'updateLedger', ledgerId: 'trip', patch: { name: 'Osaka' } },
      'b',
    );
    outbox = enqueueOp(
      outbox,
      {
        kind: 'addMembers',
        ledgerId: 'trip',
        members: [{ id: 'm-amy', uid: 'amy', placeholderId: null, name: 'Amy', leftAt: null }],
      },
      'c',
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({
      ledger: { name: 'Osaka', members: [{ id: 'm-me' }, { id: 'm-amy' }] },
    });
  });

  it('forgets everything about a ledger removed before it was sent', () => {
    let outbox = enqueueOp(
      created,
      { kind: 'ledgerPref', ledgerId: 'trip', pref: { starred: true, order: 1 } },
      'b',
    );
    outbox = enqueueOp(outbox, { kind: 'profile', patch: { locale: 'zh-TW' } }, 'c');
    outbox = enqueueOp(outbox, { kind: 'leaveLedger', ledgerId: 'trip' }, 'd');
    expect(outbox.map((o) => o.kind)).toEqual(['profile']);
  });
});

describe('demo shared ledgers', () => {
  it('has the sample shared ledgers, friends and a placeholder', () => {
    const { store } = demo();
    expect(store.state.ledgers.filter((l) => l.kind === 'shared').map((l) => l.id)).toEqual([
      'japan',
      'flat',
    ]);
    expect(store.state.friends.map((f) => f.name)).toEqual(['Amy', 'Ben', 'Chloe']);
    expect(store.state.placeholders.map((p) => p.name)).toEqual(['Dad']);
  });

  it('creates a shared ledger with me and the chosen members', () => {
    const { store, repo } = demo();
    const id = repo.createLedger({
      name: 'Osaka',
      currency: 'JPY',
      kind: 'shared',
      members: [
        { uid: 'demo-amy', placeholderId: null, name: 'Amy' },
        { uid: null, placeholderId: 'demo-dad', name: 'Dad' },
      ],
      shareHandling: 'each',
    });
    const ledger = ledgerOf(store, id);
    expect(ledger.members.map((m) => [m.uid, m.placeholderId])).toEqual([
      [DEMO_UID, null],
      ['demo-amy', null],
      [null, 'demo-dad'],
    ]);
    expect(ledger.memberUids).toEqual([DEMO_UID, 'demo-amy']);
    expect(store.state.prefs[id].shareHandling).toBe('each');
  });

  it('copies my share to my personal ledger when I chose "every entry", and follows edits', () => {
    const { store, repo } = demo();
    repo.setLedgerPrefs({ japan: { shareHandling: 'each' } });
    const id = repo.addEntry('japan', {
      type: 'expense',
      amountMinor: 3000,
      categoryCode: 'dining',
      date: '2026-10-26',
      note: 'Okonomiyaki',
      isSplit: true,
      payerMemberId: 'japan-amy',
      shares: { 'japan-me': 1000, 'japan-amy': 1000, 'japan-ben': 1000 },
    });
    const copy = () => store.state.entries.yen.find((e) => e.sourceEntryId === id);
    expect(copy()).toMatchObject({ amountMinor: 1000, note: 'Okonomiyaki', sourceLedgerId: 'japan' });

    repo.updateEntry('japan', id, {
      amountMinor: 4500,
      shares: { 'japan-me': 1500, 'japan-amy': 1500, 'japan-ben': 1500 },
    });
    expect(copy()?.amountMinor).toBe(1500);

    repo.deleteEntry('japan', id);
    expect(copy()).toBeUndefined();
  });

  it('does not copy when I chose to be asked at the end', () => {
    const { store, repo } = demo();
    const before = store.state.entries.yen.length;
    repo.addEntry('japan', {
      type: 'expense',
      amountMinor: 3000,
      categoryCode: 'dining',
      date: '2026-10-26',
      note: '',
      isSplit: true,
      payerMemberId: 'japan-amy',
      shares: { 'japan-me': 1000, 'japan-amy': 1000, 'japan-ben': 1000 },
    });
    expect(store.state.entries.yen).toHaveLength(before);
  });

  it('removes a ledger from my tabs', () => {
    const { store, repo } = demo();
    repo.removeLedger('flat');
    expect(store.state.ledgers.map((l) => l.id)).not.toContain('flat');
    expect(store.state.entries.flat).toBeUndefined();
  });

  it('adds placeholder friends and reuses invites', () => {
    const { store, repo } = demo();
    const ph = repo.addPlaceholder('Mum');
    const general = repo.createInvite(null);
    expect(repo.createInvite(null)).toBe(general);
    const personal = repo.createInvite(ph);
    expect(personal).not.toBe(general);
    expect(general).toMatch(/^[a-z0-9]{10}$/);
    expect(store.state.invites.map((i) => i.placeholderId)).toEqual([null, ph]);
  });

  it('cannot join anyone in demo mode', async () => {
    expect(await demo().repo.acceptInvite('abc')).toBe('demo');
  });
});
