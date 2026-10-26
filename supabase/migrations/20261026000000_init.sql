-- Go Dutch: Phase 1–2 schema (personal ledgers). See spec.md §13.
-- Amounts are integer minor units; dates are local calendar days; category codes, not labels.
-- Rows are never hard-deleted by the app: entries use deleted_at so other devices can sync the removal.

-- ---------------------------------------------------------------------------
-- Tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'system' check (locale in ('system', 'zh-TW', 'en-AU')),
  starred_currencies text[] not null default array['AUD', 'TWD'],
  last_used_ledger jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  kind text not null check (kind in ('personal', 'shared')),
  status text not null default 'active' check (status in ('active', 'ended')),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ledger_members (
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);
create index ledger_members_user_id_idx on public.ledger_members (user_id);

-- Each user's own tab settings for each ledger (star, manual order).
create table public.ledger_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  starred boolean not null default false,
  sort_order double precision not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, ledger_id)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'repayment')),
  is_split boolean not null default false,
  amount_minor bigint not null check (amount_minor > 0 and amount_minor < 1000000000000),
  category_code text not null check (char_length(category_code) between 1 and 20),
  date date not null,
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid not null default auth.uid(),
  last_edited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index entries_ledger_date_idx on public.entries (ledger_id, date);
create index entries_updated_at_idx on public.entries (updated_at);

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can check membership without recursion)

create function public.is_ledger_member(p_ledger_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ledger_members m
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid()
  );
$$;

create function public.is_active_ledger_member(p_ledger_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ledger_members m
    join public.ledgers l on l.id = m.ledger_id
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid() and l.status = 'active'
  );
$$;

-- ---------------------------------------------------------------------------
-- Triggers

-- updated_at is always server time, so devices can sync incrementally by it.
create function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger ledgers_touch before insert or update on public.ledgers
  for each row execute function public.touch_updated_at();
create trigger ledger_prefs_touch before insert or update on public.ledger_prefs
  for each row execute function public.touch_updated_at();
create trigger entries_touch before insert or update on public.entries
  for each row execute function public.touch_updated_at();

-- A new account gets a profile row.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator of a ledger is its first member.
create function public.add_ledger_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ledger_members (ledger_id, user_id) values (new.id, new.owner_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger ledgers_add_owner after insert on public.ledgers
  for each row execute function public.add_ledger_owner();

-- Currency, kind and owner never change after creation.
create function public.guard_ledger_update()
returns trigger
language plpgsql
as $$
begin
  if new.currency <> old.currency then
    raise exception 'ledger currency cannot change' using errcode = 'check_violation';
  end if;
  if new.kind <> old.kind or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
    raise exception 'ledger kind, owner and created_at cannot change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ledgers_guard before update on public.ledgers
  for each row execute function public.guard_ledger_update();

-- Who created an entry is fixed; who edited it last is whoever is signed in.
-- Entries can be backdated but not dated in the future (one day of slack for time zones).
create function public.guard_entry_write()
returns trigger
language plpgsql
as $$
begin
  if new.date > current_date + 1 then
    raise exception 'entry date cannot be in the future' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    if new.ledger_id <> old.ledger_id then
      raise exception 'entry ledger cannot change' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.last_edited_by := auth.uid();
  return new;
end;
$$;

create trigger entries_guard before insert or update on public.entries
  for each row execute function public.guard_entry_write();

-- ---------------------------------------------------------------------------
-- Row level security

alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.ledger_members enable row level security;
alter table public.ledger_prefs enable row level security;
alter table public.entries enable row level security;

create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "ledgers: members read" on public.ledgers
  for select to authenticated
  using (owner_id = auth.uid() or public.is_ledger_member(id));

-- Phase 2: only personal ledgers can be created from the app. Shared ledgers come in Phase 3.
create policy "ledgers: create personal" on public.ledgers
  for insert to authenticated
  with check (owner_id = auth.uid() and kind = 'personal' and status = 'active');

create policy "ledgers: members update" on public.ledgers
  for update to authenticated
  using (public.is_ledger_member(id))
  with check (public.is_ledger_member(id));

create policy "ledgers: owner deletes personal" on public.ledgers
  for delete to authenticated
  using (owner_id = auth.uid() and kind = 'personal');

-- Membership rows are written only by triggers / server functions.
create policy "ledger_members: members read" on public.ledger_members
  for select to authenticated
  using (public.is_ledger_member(ledger_id));

create policy "ledger_prefs: own rows" on public.ledger_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_ledger_member(ledger_id));

create policy "entries: members read" on public.entries
  for select to authenticated
  using (public.is_ledger_member(ledger_id));

create policy "entries: members add to active ledgers" on public.entries
  for insert to authenticated
  with check (public.is_active_ledger_member(ledger_id));

create policy "entries: members edit in active ledgers" on public.entries
  for update to authenticated
  using (public.is_active_ledger_member(ledger_id))
  with check (public.is_active_ledger_member(ledger_id));
-- No delete policy: the app sets deleted_at instead.

-- ---------------------------------------------------------------------------
-- Privileges and realtime

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.ledgers, public.ledger_prefs, public.entries
  to authenticated;
grant select on public.ledger_members to authenticated;
grant execute on function public.is_ledger_member(uuid), public.is_active_ledger_member(uuid) to authenticated;
revoke all on public.profiles, public.ledgers, public.ledger_members, public.ledger_prefs, public.entries from anon;

alter publication supabase_realtime add table public.profiles, public.ledgers, public.ledger_prefs, public.entries;
