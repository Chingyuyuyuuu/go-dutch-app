-- Go Dutch: Phase 6 — exchange rates and category sets. See spec.md §6A, §5.5, §13.6.
-- Additive on top of the Phase 1–5 migrations.
--
-- A ledger's `currency` is now its settlement currency. Each entry is recorded in the currency it was
-- paid in, with the rate it was converted at and the converted amount. Amounts stay integer ISO minor
-- units (TWD in cents); rounding to whole dollars only happens on screen and when settling up.
-- The server derives the converted amounts itself, so devices (including ones still running an older
-- app) can never store numbers that disagree with the rate.

-- ---------------------------------------------------------------------------
-- Helpers

-- ISO 4217 minor units; must match src/lib/currency/currencies.data.ts.
create function public.currency_minor_units(p_code text)
returns int
language sql immutable
as $$
  select case
    when p_code in ('BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV') then 0
    when p_code in ('BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND') then 3
    else 2
  end;
$$;

-- Amount in the entry currency -> settlement currency, in ISO minor units, rounded half away from zero.
-- Same as convertMinor in src/lib/fx.ts.
create function public.convert_minor(p_amount bigint, p_from text, p_to text, p_rate numeric)
returns bigint
language sql immutable
as $$
  select round(
    p_amount::numeric * p_rate
    * power(10::numeric, public.currency_minor_units(p_to) - public.currency_minor_units(p_from))
  )::bigint;
$$;

-- Splits p_total in proportion to p_shares (member key -> amount) with the largest remainder method,
-- so the parts add up to p_total. Ties go to the lower member key (plain character order).
-- Same as allocateSettle in src/lib/fx.ts.
create function public.allocate_settle(p_total bigint, p_shares jsonb)
returns jsonb
language sql immutable
as $$
  with parts as (
    select key, value::numeric as share from jsonb_each_text(p_shares)
  ), sums as (
    select sum(share) as total_share from parts
  ), split as (
    select key,
           case when total_share = 0 then 0 else div(p_total::numeric * share, total_share) end as base,
           case when total_share = 0 then 0 else mod(p_total::numeric * share, total_share) end as rest
    from parts, sums
  ), ranked as (
    select key, base,
           row_number() over (order by rest desc, key collate "C") as rank,
           case when (select total_share from sums) = 0 then 0
                else p_total - (select sum(base) from split) end as left_over
    from split
  )
  select coalesce(
    jsonb_object_agg(key, (base + case when rank <= left_over then 1 else 0 end)::bigint),
    '{}'::jsonb
  )
  from ranked;
$$;

-- Ledger rates: {"JPY": "0.2102"} — currency code -> positive decimal string (numeric(20,10)).
create function public.valid_rates(p_rates jsonb)
returns boolean
language sql immutable
as $$
  select jsonb_typeof(p_rates) = 'object' and not exists (
    select 1 from jsonb_each(p_rates)
    where key !~ '^[A-Z]{3}$'
       or jsonb_typeof(value) <> 'string'
       or case when (value #>> '{}') ~ '^\d{1,10}(\.\d{1,10})?$' then (value #>> '{}')::numeric <= 0
               else true end
  );
$$;

-- ---------------------------------------------------------------------------
-- Ledgers: settlement currency (the existing `currency` column), usual entry currency,
-- category set and ledger rates.

alter table public.ledgers
  add column entry_currency text check (entry_currency ~ '^[A-Z]{3}$'),
  -- Ledgers from before Phase 6 keep the Australian categories; new ones default to the Japan trip set.
  add column category_set text not null default 'au_life' check (category_set in ('japan_travel', 'au_life')),
  add column rates jsonb not null default '{}'::jsonb check (public.valid_rates(rates));
alter table public.ledgers alter column category_set set default 'japan_travel';

-- Shared ledgers are created by a server function: it now takes the Phase 6 settings too.
create or replace function public.create_shared_ledger(p_ledger jsonb, p_members jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid := (p_ledger ->> 'id')::uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.ledgers where id = v_id) then
    return 'exists';
  end if;
  if not exists (select 1 from jsonb_array_elements(p_members) m where (m ->> 'uid') = v_me::text) then
    raise exception 'the creator must be a member' using errcode = 'check_violation';
  end if;
  insert into public.ledgers (id, name, currency, kind, status, owner_id, created_at, entry_currency, category_set, rates)
  values (
    v_id, p_ledger ->> 'name', p_ledger ->> 'currency', 'shared', 'active', v_me,
    coalesce((p_ledger ->> 'createdAt')::timestamptz, now()),
    p_ledger ->> 'entryCurrency',
    coalesce(p_ledger ->> 'categorySet', 'japan_travel'),
    coalesce(p_ledger -> 'rates', '{}'::jsonb)
  );
  perform public.insert_ledger_members(v_id, p_members);
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- Entries: currency paid in, rate, where the rate came from, converted amount and shares.

alter table public.entries
  add column currency text check (currency ~ '^[A-Z]{3}$'),
  add column fx_rate numeric(20, 10) not null default 1 check (fx_rate > 0),
  -- same: paid in the settlement currency · ledger: the ledger rate · manual: a rate typed for this
  -- entry or the amount actually paid · split: a personal copy of a shared entry (amount from shares_settle)
  add column fx_source text not null default 'same' check (fx_source in ('same', 'ledger', 'manual', 'split')),
  add column amount_settle_minor bigint check (amount_settle_minor >= 0),
  add column shares_settle jsonb check (shares_settle is null or jsonb_typeof(shares_settle) = 'object');

-- Existing entries were all recorded in their ledger's currency. Triggers are off so this does not
-- write edit history, touch personal copies or bump updated_at (devices fill the same defaults).
alter table public.entries disable trigger user;
update public.entries e
set currency = l.currency, amount_settle_minor = e.amount_minor, shares_settle = e.shares
from public.ledgers l
where l.id = e.ledger_id;
alter table public.entries enable trigger user;

alter table public.entries
  alter column currency set not null,
  alter column amount_settle_minor set not null;

-- Same rules as Phase 4, plus the conversion (the end of the function). Fields an older app does not
-- send are filled in as "paid in the settlement currency".
create or replace function public.guard_entry_write()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
  v_settle text;
  v_member record;
  v_sum bigint := 0;
  v_count int := 0;
begin
  if new.date > current_date + 1 then
    raise exception 'entry date cannot be in the future' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.recurring_id is not null and coalesce(current_setting('gd.recording', true), '') <> 'on' then
      raise exception 'only the server records recurring charges' using errcode = 'insufficient_privilege';
    end if;
  else
    if new.ledger_id <> old.ledger_id then
      raise exception 'entry ledger cannot change' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Which charge an entry records is fixed.
    new.recurring_id := old.recurring_id;
    new.recurring_seq := old.recurring_seq;
  end if;
  new.last_edited_by := coalesce(auth.uid(), new.last_edited_by, new.created_by);

  select kind, currency into v_kind, v_settle from public.ledgers where id = new.ledger_id;
  if new.is_split or new.type = 'repayment' then
    if v_kind <> 'shared' then
      raise exception 'splits and repayments belong to shared ledgers' using errcode = 'check_violation';
    end if;
    if new.payer_member_id is null or new.shares is null or jsonb_typeof(new.shares) <> 'object' then
      raise exception 'split entries need a payer and shares' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.ledger_members m where m.id = new.payer_member_id and m.ledger_id = new.ledger_id) then
      raise exception 'payer is not a member of this ledger' using errcode = 'check_violation';
    end if;
    for v_member in select key, value from jsonb_each(new.shares) loop
      if jsonb_typeof(v_member.value) <> 'number' or (v_member.value)::numeric < 0
         or (v_member.value)::numeric <> trunc((v_member.value)::numeric) then
        raise exception 'shares must be whole minor units' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from public.ledger_members m
        where m.ledger_id = new.ledger_id and m.id::text = v_member.key
      ) then
        raise exception 'share for someone who is not a member' using errcode = 'check_violation';
      end if;
      v_sum := v_sum + (v_member.value)::bigint;
      v_count := v_count + 1;
    end loop;
    if v_sum <> new.amount_minor then
      raise exception 'shares must add up to the amount' using errcode = 'check_violation';
    end if;
    if new.type = 'repayment' and (v_count <> 1 or new.shares ? new.payer_member_id::text) then
      raise exception 'a repayment goes from one member to another' using errcode = 'check_violation';
    end if;
  elsif new.payer_member_id is not null or new.shares is not null then
    raise exception 'only split entries have a payer and shares' using errcode = 'check_violation';
  end if;

  -- Conversion (Phase 6).
  new.currency := coalesce(new.currency, v_settle);
  if new.type = 'repayment' and new.currency <> v_settle then
    raise exception 'repayments are recorded in the settlement currency' using errcode = 'check_violation';
  end if;
  if new.fx_source = 'split' then
    -- Personal copies: the converted amount is the member's share of the shared entry.
    if v_kind <> 'personal' or new.source_entry_id is null or new.amount_settle_minor is null then
      raise exception 'only personal copies of shared entries use the split source' using errcode = 'check_violation';
    end if;
    if new.currency = v_settle then
      new.fx_rate := 1;
      new.amount_settle_minor := new.amount_minor;
    end if;
  else
    if new.currency = v_settle then
      new.fx_rate := 1;
      new.fx_source := 'same';
    elsif new.fx_source = 'same' then
      raise exception 'an entry in another currency needs a rate' using errcode = 'check_violation';
    end if;
    new.amount_settle_minor := public.convert_minor(new.amount_minor, new.currency, v_settle, new.fx_rate);
  end if;
  new.shares_settle := case when new.shares is null then null
                            else public.allocate_settle(new.amount_settle_minor, new.shares) end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- "Add every entry to my personal ledger": which personal ledger, and the converted amount.

-- Each user's last used personal ledger (one id). The old last_used_ledger (currency -> id) stays
-- for apps that have not updated; the new app no longer reads or writes it.
alter table public.profiles
  add column last_ledger_id uuid references public.ledgers (id) on delete set null;

-- Which personal ledger a shared ledger's entries are added to, per member.
alter table public.ledger_prefs
  add column share_target_ledger_id uuid references public.ledgers (id) on delete set null;

-- The personal ledger a member's share goes to: the one they picked for this shared ledger, then the
-- last one they used, then the oldest — always an active personal ledger with the same settlement currency.
drop function public.personal_ledger_for(uuid, text);
create function public.personal_ledger_for(p_user_id uuid, p_shared_ledger_id uuid, p_currency text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select l.id
  from public.ledgers l
  where l.owner_id = p_user_id and l.kind = 'personal' and l.status = 'active' and l.currency = p_currency
  order by
    (l.id = (select pr.share_target_ledger_id from public.ledger_prefs pr
             where pr.user_id = p_user_id and pr.ledger_id = p_shared_ledger_id)) is not true,
    (l.id = (select p.last_ledger_id from public.profiles p where p.id = p_user_id)) is not true,
    (l.id::text = (select p.last_used_ledger ->> p_currency from public.profiles p where p.id = p_user_id)) is not true,
    l.created_at
  limit 1;
$$;

-- Personal copies keep the shared entry's currency and rate; their converted amount is the member's
-- shares_settle. Otherwise unchanged from Phase 4.
create or replace function public.sync_personal_copies()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ledger record;
  v_member record;
  v_share bigint;
  v_settle bigint;
  v_target uuid;
begin
  select * into v_ledger from public.ledgers where id = new.ledger_id;
  if v_ledger.kind <> 'shared' or not new.is_split or new.type = 'repayment' then
    return null;
  end if;
  for v_member in
    select m.*, coalesce(pr.share_handling, 'ask') as handling
    from public.ledger_members m
    left join public.ledger_prefs pr on pr.user_id = m.user_id and pr.ledger_id = m.ledger_id
    where m.ledger_id = new.ledger_id and m.user_id is not null
  loop
    v_share := coalesce((new.shares ->> v_member.id::text)::bigint, 0);
    v_settle := coalesce((new.shares_settle ->> v_member.id::text)::bigint, 0);
    if v_member.handling = 'each' and v_member.left_at is null and new.deleted_at is null and v_share > 0 then
      select e.ledger_id into v_target
      from public.entries e join public.ledgers pl on pl.id = e.ledger_id
      where e.source_entry_id = new.id and pl.owner_id = v_member.user_id
      limit 1;
      if v_target is null then
        v_target := public.personal_ledger_for(v_member.user_id, new.ledger_id, v_ledger.currency);
      end if;
      if v_target is not null then
        insert into public.entries
          (ledger_id, type, amount_minor, category_code, date, note, created_at, created_by,
           source_entry_id, source_ledger_id, currency, fx_rate, fx_source, amount_settle_minor)
        values
          (v_target, new.type, v_share, new.category_code, new.date, new.note, new.created_at, new.created_by,
           new.id, new.ledger_id, new.currency, new.fx_rate, 'split', v_settle)
        on conflict (ledger_id, source_entry_id) where source_entry_id is not null do update
          set type = excluded.type, amount_minor = excluded.amount_minor, category_code = excluded.category_code,
              date = excluded.date, note = excluded.note, deleted_at = null, currency = excluded.currency,
              fx_rate = excluded.fx_rate, fx_source = 'split', amount_settle_minor = excluded.amount_settle_minor;
      end if;
    else
      update public.entries e set deleted_at = now()
      from public.ledgers pl
      where e.source_entry_id = new.id and e.deleted_at is null
        and pl.id = e.ledger_id and pl.owner_id = v_member.user_id;
    end if;
  end loop;
  return null;
end;
$$;
