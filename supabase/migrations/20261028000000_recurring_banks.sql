-- Go Dutch: Phase 4 — recurring payments (subscriptions, Afterpay, recurring splits) and bank balances.
-- Additive on top of the Phase 1–3 migrations. See spec.md §13.4.
-- Charges are recorded by the server: hourly by pg_cron (all users), and whenever the app syncs
-- (public.run_my_recurring), so a phone that was off for a week catches up too.

-- ---------------------------------------------------------------------------
-- Profiles: time zone (whose "today" a charge falls on) and the bank reminder interval

alter table public.profiles
  add column time_zone text not null default 'Australia/Sydney' check (char_length(time_zone) between 1 and 64),
  add column bank_reminder text not null default 'weekly' check (bank_reminder in ('weekly', 'monthly'));

-- The user's local calendar day. Falls back to Sydney when the saved zone is unknown.
create function public.local_today(p_user_id uuid)
returns date
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_zone text;
begin
  select time_zone into v_zone from public.profiles where id = p_user_id;
  begin
    return (now() at time zone coalesce(v_zone, 'Australia/Sydney'))::date;
  exception when others then
    return (now() at time zone 'Australia/Sydney')::date;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recurring payments

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('regular', 'instalment', 'split')),
  name text not null check (char_length(name) between 1 and 40),
  -- regular / split: each charge. instalment: the total.
  amount_minor bigint not null check (amount_minor > 0 and amount_minor < 1000000000000),
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  category_code text not null check (char_length(category_code) between 1 and 20),
  frequency text not null check (frequency in ('weekly', 'fortnightly', 'monthly', 'yearly')),
  start_date date not null,
  remind_day_before boolean not null default false,
  instalments int check (instalments between 2 and 52),
  payer_member_id uuid references public.ledger_members (id),
  source text check (source in ('apple')),
  -- Charges done: recorded, or already past when the payment was added. Kept by the server.
  paid_count int not null default 0 check (paid_count >= 0),
  -- Next charge not recorded yet; null once an instalment plan is paid off. Kept by the server.
  next_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((kind = 'instalment') = (instalments is not null)),
  check ((kind = 'split') = (payer_member_id is not null))
);
create index recurring_owner_idx on public.recurring (owner_id);
create index recurring_due_idx on public.recurring (next_date) where deleted_at is null;

-- Date of charge p_n (0 = first). Months and years count from the start date (31st → 30th → 31st).
create function public.recurring_date(p_start date, p_frequency text, p_n int)
returns date
language sql immutable
as $$
  select case p_frequency
    when 'weekly' then p_start + 7 * p_n
    when 'fortnightly' then p_start + 14 * p_n
    when 'monthly' then (p_start + make_interval(months => p_n))::date
    when 'yearly' then (p_start + make_interval(years => p_n))::date
  end;
$$;

-- Amount of charge p_seq. Instalments: equal parts, remainder on the first payment.
create function public.recurring_amount(p_kind text, p_amount bigint, p_instalments int, p_seq int)
returns bigint
language sql immutable
as $$
  select case
    when p_kind <> 'instalment' then p_amount
    when p_seq = 0 then p_amount / p_instalments + p_amount % p_instalments
    else p_amount / p_instalments
  end;
$$;

-- Charges dated before p_today (they count as paid when a payment is added: never recorded twice).
create function public.recurring_charges_before(p_start date, p_frequency text, p_instalments int, p_today date)
returns int
language plpgsql immutable
as $$
declare
  v_n int := 0;
begin
  while v_n < least(coalesce(p_instalments, 5000), 5000)
        and public.recurring_date(p_start, p_frequency, v_n) < p_today loop
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Checks a recurring payment belongs where it says, and keeps paid_count / next_date
-- (the device can't set them; they're worked out here, and advanced when charges are recorded).
create function public.guard_recurring_write()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ledger public.ledgers;
  v_recording boolean := coalesce(current_setting('gd.recording', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.owner_id <> old.owner_id or new.kind <> old.kind then
      raise exception 'recurring owner and kind cannot change' using errcode = 'check_violation';
    end if;
    new.created_at := old.created_at;
  end if;

  if not v_recording then
    select * into v_ledger from public.ledgers where id = new.ledger_id;
    if new.kind = 'split' then
      if v_ledger.kind is distinct from 'shared' or not public.is_active_ledger_member(new.ledger_id) then
        raise exception 'recurring splits go in a shared ledger you belong to' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from public.ledger_members m
        where m.id = new.payer_member_id and m.ledger_id = new.ledger_id and m.left_at is null
      ) then
        raise exception 'payer is not a member of this ledger' using errcode = 'check_violation';
      end if;
    elsif v_ledger.kind is distinct from 'personal' or v_ledger.owner_id <> new.owner_id then
      raise exception 'recurring payments go in your own personal ledger' using errcode = 'check_violation';
    end if;

    if tg_op = 'INSERT'
       or new.start_date <> old.start_date or new.frequency <> old.frequency
       or new.instalments is distinct from old.instalments then
      -- A new or rescheduled payment starts from today: earlier charges count as paid.
      new.paid_count := public.recurring_charges_before(
        new.start_date, new.frequency, new.instalments, public.local_today(new.owner_id));
    else
      new.paid_count := old.paid_count;
    end if;
  end if;

  new.next_date := case
    when new.instalments is not null and new.paid_count >= new.instalments then null
    else public.recurring_date(new.start_date, new.frequency, new.paid_count)
  end;
  return new;
end;
$$;

create trigger recurring_guard before insert or update on public.recurring
  for each row execute function public.guard_recurring_write();
create trigger recurring_touch before insert or update on public.recurring
  for each row execute function public.touch_updated_at();

alter table public.recurring enable row level security;

-- Members of a shared ledger see its recurring splits (for the "Weekly · auto-split" tag).
create policy "recurring: read own and shared splits" on public.recurring
  for select to authenticated
  using (owner_id = auth.uid() or (kind = 'split' and public.is_ledger_member(ledger_id)));
create policy "recurring: create own" on public.recurring
  for insert to authenticated with check (owner_id = auth.uid());
create policy "recurring: change own" on public.recurring
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- No delete policy: the app sets deleted_at so other devices sync the removal.

-- ---------------------------------------------------------------------------
-- Entries recorded by a recurring payment: one per charge, never twice

alter table public.entries
  add column recurring_id uuid references public.recurring (id) on delete set null,
  add column recurring_seq int check (recurring_seq >= 0);
create unique index entries_recurring_key on public.entries (recurring_id, recurring_seq)
  where recurring_id is not null;

-- Same rules as before. created_by / last_edited_by come from the signed-in user; the hourly
-- job has no user, so it keeps what the server function set (the payment's owner).
create or replace function public.guard_entry_write()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
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

  select kind into v_kind from public.ledgers where id = new.ledger_id;
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
  return new;
end;
$$;

-- Personal copies of shared entries now name who created the shared entry, so copies made by
-- the hourly job (no signed-in user) have a creator too. Otherwise unchanged from Phase 3.
create or replace function public.sync_personal_copies()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_ledger record;
  v_member record;
  v_share bigint;
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
    if v_member.handling = 'each' and v_member.left_at is null and new.deleted_at is null and v_share > 0 then
      select e.ledger_id into v_target
      from public.entries e join public.ledgers pl on pl.id = e.ledger_id
      where e.source_entry_id = new.id and pl.owner_id = v_member.user_id
      limit 1;
      if v_target is null then
        v_target := public.personal_ledger_for(v_member.user_id, v_ledger.currency);
      end if;
      if v_target is not null then
        insert into public.entries
          (ledger_id, type, amount_minor, category_code, date, note, created_at, created_by,
           source_entry_id, source_ledger_id)
        values
          (v_target, new.type, v_share, new.category_code, new.date, new.note, new.created_at, new.created_by,
           new.id, new.ledger_id)
        on conflict (ledger_id, source_entry_id) where source_entry_id is not null do update
          set type = excluded.type, amount_minor = excluded.amount_minor, category_code = excluded.category_code,
              date = excluded.date, note = excluded.note, deleted_at = null;
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

-- Records every charge of p_owner's recurring payments due on or before p_today (their local day).
-- Splits are shared equally between the ledger's current members (remainder by member key).
-- Ended ledgers and payments whose owner or payer left skip the charge. Returns how many were recorded.
create function public.record_due_recurring(p_owner uuid, p_today date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recurring;
  v_ledger public.ledgers;
  v_date date;
  v_amount bigint;
  v_paid int;
  v_steps int;
  v_recorded int := 0;
  v_ids uuid[];
  v_shares jsonb;
  v_base bigint;
  v_rem bigint;
  v_i int;
begin
  perform set_config('gd.recording', 'on', true);
  for r in
    select * from public.recurring
    where owner_id = p_owner and deleted_at is null and next_date is not null and next_date <= p_today
    order by next_date
    for update
  loop
    select * into v_ledger from public.ledgers where id = r.ledger_id;
    v_paid := r.paid_count;
    v_steps := 0;
    while (r.instalments is null or v_paid < r.instalments) and v_steps < 60 loop
      v_date := public.recurring_date(r.start_date, r.frequency, v_paid);
      exit when v_date > p_today;
      v_amount := public.recurring_amount(r.kind, r.amount_minor, r.instalments, v_paid);
      if v_ledger.status = 'active' and v_amount > 0 then
        if r.kind = 'split' then
          select array_agg(m.id order by m.id) into v_ids
          from public.ledger_members m where m.ledger_id = r.ledger_id and m.left_at is null;
          if exists (select 1 from public.ledger_members m
                     where m.ledger_id = r.ledger_id and m.user_id = r.owner_id and m.left_at is null)
             and r.payer_member_id = any (v_ids) then
            v_base := v_amount / array_length(v_ids, 1);
            v_rem := v_amount % array_length(v_ids, 1);
            v_shares := '{}'::jsonb;
            for v_i in 1 .. array_length(v_ids, 1) loop
              v_shares := v_shares || jsonb_build_object(v_ids[v_i]::text, v_base + case when v_i <= v_rem then 1 else 0 end);
            end loop;
            insert into public.entries
              (ledger_id, type, is_split, amount_minor, category_code, date, note, payer_member_id, shares,
               created_by, last_edited_by, recurring_id, recurring_seq)
            values
              (r.ledger_id, 'expense', true, v_amount, r.category_code, v_date, r.name, r.payer_member_id, v_shares,
               r.owner_id, r.owner_id, r.id, v_paid)
            on conflict (recurring_id, recurring_seq) where recurring_id is not null do nothing;
            if found then v_recorded := v_recorded + 1; end if;
          end if;
        else
          insert into public.entries
            (ledger_id, type, amount_minor, category_code, date, note, created_by, last_edited_by,
             recurring_id, recurring_seq)
          values
            (r.ledger_id, 'expense', v_amount, r.category_code, v_date, r.name, r.owner_id, r.owner_id, r.id, v_paid)
          on conflict (recurring_id, recurring_seq) where recurring_id is not null do nothing;
          if found then v_recorded := v_recorded + 1; end if;
        end if;
      end if;
      v_paid := v_paid + 1;
      v_steps := v_steps + 1;
    end loop;
    update public.recurring set paid_count = v_paid where id = r.id;
  end loop;
  perform set_config('gd.recording', '', true);
  return v_recorded;
end;
$$;

-- Called by the app when it syncs: saves the phone's time zone, then records the caller's due charges.
create function public.run_my_recurring(p_time_zone text default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  if p_time_zone is not null and char_length(p_time_zone) between 1 and 64 then
    begin
      perform now() at time zone p_time_zone;
      update public.profiles set time_zone = p_time_zone where id = v_me and time_zone <> p_time_zone;
    exception when others then
      null; -- unknown zone: keep the saved one
    end;
  end if;
  return public.record_due_recurring(v_me, public.local_today(v_me));
end;
$$;

-- Hourly job: every user with something due in their own time zone.
create function public.run_all_recurring()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
  v_total int := 0;
begin
  for v_owner in
    select distinct owner_id from public.recurring
    where deleted_at is null and next_date is not null and next_date <= current_date + 1
  loop
    v_total := v_total + public.record_due_recurring(v_owner, public.local_today(v_owner));
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bank accounts: no bank connection, just a name, a currency, linked ledgers and the balances typed in

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  linked_ledger_ids uuid[] not null default '{}',
  -- [{date, balanceMinor, gapMinor, at}], oldest first, at most 24 kept by the app.
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array' and jsonb_array_length(checks) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index bank_accounts_owner_idx on public.bank_accounts (owner_id);

create trigger bank_accounts_touch before insert or update on public.bank_accounts
  for each row execute function public.touch_updated_at();

alter table public.bank_accounts enable row level security;
create policy "bank_accounts: own rows" on public.bank_accounts
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privileges and realtime

revoke all on public.recurring, public.bank_accounts from anon, authenticated;
grant select, insert, update on public.recurring, public.bank_accounts to authenticated;

revoke execute on function
  public.local_today(uuid),
  public.guard_recurring_write(),
  public.record_due_recurring(uuid, date),
  public.run_my_recurring(text),
  public.run_all_recurring()
  from public, anon, authenticated;
grant execute on function public.run_my_recurring(text) to authenticated;

alter publication supabase_realtime add table public.recurring, public.bank_accounts;

-- ---------------------------------------------------------------------------
-- Hourly schedule (pg_cron). Skipped where pg_cron isn't available (local tests); if it can't be set
-- up here, enable "Cron" in the Supabase dashboard and run the cron.schedule line below once.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('go-dutch-recurring', '7 * * * *', 'select public.run_all_recurring()');
    exception when others then
      raise notice 'pg_cron not set up (%). Enable Cron, then run: select cron.schedule(''go-dutch-recurring'', ''7 * * * *'', ''select public.run_all_recurring()'');', sqlerrm;
    end;
  end if;
end;
$$;
