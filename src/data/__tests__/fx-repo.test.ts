import { entryCurrency, ledgerCategorySet, settledAmount, type Ledger } from '@/lib/domain';
import { compareMonths } from '@/lib/monthly';
import { memberNets, spentShare } from '@/lib/balances';
import { summarise } from '@/lib/ledgers';
import { enAU } from '@/i18n/en-AU';

import { DEMO_UID, seedDemo } from '../demo/seed';
import { LocalRepo } from '../local/LocalRepo';
import { LocalStore } from '../local/LocalStore';
import { memoryKv } from '../local/memoryKv';
import type { Op } from '../local/ops';
import type { SyncEngine } from '../sync/SyncEngine';

let seq = 0;
const newId = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;

/** A cloud repo whose sync engine only records what would be sent. */
function cloud() {
  const store = LocalStore.create(memoryKv(), 'cloud', seedDemo('2026-10-26', enAU.demo, 1_000_000_000));
  const sent: Op[] = [];
  const sync = { enqueue: (op: Op) => sent.push(op) } as unknown as SyncEngine;
  return { store, sent, repo: new LocalRepo('cloud', DEMO_UID, store, newId, sync) };
}

const ledgerNamed = (store: LocalStore, kind: Ledger['kind']) =>
  store.state.ledgers.find((l) => l.kind === kind && l.status === 'active') as Ledger;

describe('entries in another currency (LocalRepo)', () => {
  it('fills in the conversion locally and sends only the currency and rate', () => {
    const { store, sent, repo } = cloud();
    const ledgerId = repo.createLedger({
      name: 'Japan',
      currency: 'TWD',
      kind: 'personal',
      rates: { JPY: '0.2102' },
    });
    const id = repo.addEntry(ledgerId, {
      type: 'expense',
      amountMinor: 3333,
      categoryCode: 'drugstore',
      date: '2026-10-26',
      note: '',
      currency: 'JPY',
      fxRate: '0.2102',
      fxSource: 'ledger',
    });
    const saved = store.state.entries[ledgerId].find((e) => e.id === id);
    expect(saved).toMatchObject({
      currency: 'JPY',
      fxRate: '0.2102',
      fxSource: 'ledger',
      amountSettleMinor: 70060,
    });
    const insert = sent.find((op) => op.kind === 'insertEntry');
    expect(insert).toMatchObject({ entry: { currency: 'JPY', fxRate: '0.2102', fxSource: 'ledger' } });
  });

  it('keeps entries in the settlement currency free of conversion fields on the wire', () => {
    const { store, sent, repo } = cloud();
    const ledger = ledgerNamed(store, 'personal');
    const id = repo.addEntry(ledger.id, {
      type: 'expense',
      amountMinor: 580,
      categoryCode: 'coffee',
      date: '2026-10-26',
      note: '',
    });
    expect(store.state.entries[ledger.id].find((e) => e.id === id)).toMatchObject({
      currency: ledger.currency,
      fxSource: 'same',
      amountSettleMinor: 580,
    });
    repo.updateEntry(ledger.id, id, { amountMinor: 600 });
    const [insert, update] = sent.filter((op) => op.kind === 'insertEntry' || op.kind === 'updateEntry');
    expect(insert.kind === 'insertEntry' && insert.entry.currency).toBeUndefined();
    expect(update).toEqual({
      kind: 'updateEntry',
      ledgerId: ledger.id,
      entryId: id,
      patch: expect.anything(),
    });
    expect(update.kind === 'updateEntry' && update.patch).toEqual({
      amountMinor: 600,
      currency: undefined,
      fxRate: undefined,
      fxSource: undefined,
    });
  });

  it('recalculates on edit and sends the conversion while the entry is or was foreign', () => {
    const { store, sent, repo } = cloud();
    const ledgerId = repo.createLedger({ name: 'Japan', currency: 'TWD', kind: 'personal' });
    const id = repo.addEntry(ledgerId, {
      type: 'expense',
      amountMinor: 10000,
      categoryCode: 'drugstore',
      date: '2026-10-26',
      note: '',
      currency: 'JPY',
      fxRate: '0.2102',
      fxSource: 'ledger',
    });
    repo.updateEntry(ledgerId, id, { amountMinor: 6000 });
    expect(store.state.entries[ledgerId][0].amountSettleMinor).toBe(126120);
    // Back to TWD: the server must hear about it.
    repo.updateEntry(ledgerId, id, { amountMinor: 1500, currency: 'TWD' });
    expect(store.state.entries[ledgerId][0]).toMatchObject({
      fxSource: 'same',
      fxRate: '1',
      amountSettleMinor: 1500,
    });
    const updates = sent.filter((op) => op.kind === 'updateEntry');
    expect(updates[0]).toMatchObject({
      patch: { amountMinor: 6000, currency: 'JPY', fxRate: '0.2102', fxSource: 'ledger' },
    });
    expect(updates[1]).toMatchObject({
      patch: { amountMinor: 1500, currency: 'TWD', fxRate: '1', fxSource: 'same' },
    });
  });

  it('new ledgers default to the Japan trip categories; older ones read as the Australian set', () => {
    const { store, repo } = cloud();
    const id = repo.createLedger({ name: 'Japan', currency: 'TWD', kind: 'personal' });
    expect(ledgerCategorySet(store.state.ledgers.find((l) => l.id === id) as Ledger)).toBe('japan_travel');
    expect(ledgerCategorySet({})).toBe('au_life');
  });
});

describe('totals use the settlement currency', () => {
  const base = {
    isSplit: false,
    payerMemberId: null,
    shares: null,
    type: 'expense' as const,
    categoryCode: 'drugstore' as const,
    date: '2026-09-10',
    note: '',
  };

  it('adds converted amounts, and treats entries without them as same-currency', () => {
    const entries = [
      { ...base, amountMinor: 10000, currency: 'JPY', amountSettleMinor: 210200 },
      { ...base, amountMinor: 50000 },
    ];
    expect(settledAmount(entries[0])).toBe(210200);
    expect(entryCurrency({}, { currency: 'TWD' })).toBe('TWD');
    expect(summarise(entries as never).spent).toBe(260200);
    expect(compareMonths(entries as never, { year: 2026, month: 9 }).total).toBe(260200);
  });

  it('balances and shares use the converted shares', () => {
    const split = {
      ...base,
      type: 'expense' as const,
      amountMinor: 10000,
      payerMemberId: 'a',
      shares: { a: 3334, b: 3333, c: 3333 },
      amountSettleMinor: 210200,
      sharesSettle: { a: 70081, b: 70060, c: 70059 },
    };
    expect(memberNets([split])).toEqual({ a: 210200 - 70081, b: -70060, c: -70059 });
    expect(spentShare([split], 'b')).toBe(70060);
  });
});
