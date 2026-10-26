-- Go Dutch: Phase 3 — friends, placeholder friends, invites, shared ledgers, split entries.
-- Additive on top of 20261026000000_init.sql. See spec.md §13.

-- ---------------------------------------------------------------------------
-- Profiles: the name friends see

alter table public.profiles
  add column display_name text not null default '' check (char_length(display_name) <= 40);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(split_part(new.email, '@', 1), ''), 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ledger members: a stable member key (entries point at it), placeholder friends, leaving

alter table public.ledger_members drop constraint ledger_members_pkey;
alter table public.ledger_members add column id uuid not null default gen_random_uuid() primary key;
alter table public.ledger_members alter column user_id drop not null;
alter table public.ledger_members add column placeholder_id uuid;
alter table public.ledger_members add column display_name text not null default '';
alter table public.ledger_members add column left_at timestamptz;
alter table public.ledger_members
  add constraint ledger_members_who check (user_id is not null or placeholder_id is not null);
create unique index ledger_members_ledger_user_key on public.ledger_members (ledger_id, user_id)
  where user_id is not null;

-- Members who left can no longer see the ledger; their debts stay in it.
create or replace function public.is_ledger_member(p_ledger_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ledger_members m
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create or replace function public.is_active_ledger_member(p_ledger_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.ledger_members m
    join public.ledgers l on l.id = m.ledger_id
    where m.ledger_id = p_ledger_id and m.user_id = auth.uid() and m.left_at is null and l.status = 'active'
  );
$$;

-- Personal ledgers get their owner as member automatically; shared ledgers are set up by
-- create_shared_ledger() with member keys chosen on the device.
create or replace function public.add_ledger_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ledger_members (ledger_id, user_id, display_name)
  select new.id, new.owner_id, coalesce(p.display_name, '')
  from (select 1) one
  left join public.profiles p on p.id = new.owner_id
  on conflict do nothing;
  return new;
end;
$$;

drop trigger ledgers_add_owner on public.ledgers;
create trigger ledgers_add_owner after insert on public.ledgers
  for each row when (new.kind = 'personal') execute function public.add_ledger_owner();

-- An owner who left a shared ledger must not keep seeing it.
drop policy "ledgers: members read" on public.ledgers;
create policy "ledgers: members read" on public.ledgers
  for select to authenticated
  using ((kind = 'personal' and owner_id = auth.uid()) or public.is_ledger_member(id));

-- ---------------------------------------------------------------------------
-- Ledger prefs: how my share reaches my personal ledger

alter table public.ledger_prefs
  add column share_handling text not null default 'ask' check (share_handling in ('each', 'never', 'ask'));

-- ---------------------------------------------------------------------------
-- Entries: who paid, who owes what, personal copies

alter table public.entries
  add column payer_member_id uuid references public.ledger_members (id),
  add column shares jsonb,
  add column recorded_on_behalf boolean not null default false,
  add column source_entry_id uuid references public.entries (id) on delete set null,
  add column source_ledger_id uuid references public.ledgers (id) on delete set null;

create unique index entries_copy_key on public.entries (ledger_id, source_entry_id)
  where source_entry_id is not null;

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
    new.created_by := auth.uid();
  else
    if new.ledger_id <> old.ledger_id then
      raise exception 'entry ledger cannot change' using errcode = 'check_violation';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.last_edited_by := auth.uid();

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

-- The personal ledger a member's share goes to: last used for that currency, else the oldest one.
create function public.personal_ledger_for(p_user_id uuid, p_currency text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (
      select l.id from public.profiles p
      join public.ledgers l
        on l.id::text = p.last_used_ledger ->> p_currency
      where p.id = p_user_id and l.owner_id = p_user_id and l.kind = 'personal'
        and l.status = 'active' and l.currency = p_currency
    ),
    (
      select l.id from public.ledgers l
      where l.owner_id = p_user_id and l.kind = 'personal' and l.status = 'active' and l.currency = p_currency
      order by l.created_at
      limit 1
    )
  );
$$;

-- "Add every entry to my personal ledger": keep each such member's personal copy in step
-- with the shared entry (created, changed and deleted together).
create function public.sync_personal_copies()
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
          (ledger_id, type, amount_minor, category_code, date, note, created_at, source_entry_id, source_ledger_id)
        values
          (v_target, new.type, v_share, new.category_code, new.date, new.note, new.created_at, new.id, new.ledger_id)
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

create trigger entries_personal_copies after insert or update on public.entries
  for each row execute function public.sync_personal_copies();

-- Edit history of shared entries, so everyone can see who changed what.
create table public.entry_history (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.entries (id) on delete cascade,
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  edited_by uuid,
  edited_at timestamptz not null default now(),
  previous jsonb not null
);
create index entry_history_entry_idx on public.entry_history (entry_id);

create function public.record_entry_history()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.ledgers where id = new.ledger_id and kind = 'shared') then
    insert into public.entry_history (entry_id, ledger_id, edited_by, previous)
    values (old.id, old.ledger_id, auth.uid(), to_jsonb(old));
  end if;
  return null;
end;
$$;

create trigger entries_history after update on public.entries
  for each row execute function public.record_entry_history();

alter table public.entry_history enable row level security;
create policy "entry_history: members read" on public.entry_history
  for select to authenticated
  using (public.is_ledger_member(ledger_id));

-- ---------------------------------------------------------------------------
-- Friends, placeholder friends, invites

create table public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  friend_name text not null default '',
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table public.placeholder_friends (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  merged_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invites (
  code text primary key check (code ~ '^[a-z0-9]{8,32}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Set for a placeholder friend's personal invite: joining with it merges the placeholder.
  placeholder_id uuid references public.placeholder_friends (id) on delete cascade,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create trigger friendships_touch before insert or update on public.friendships
  for each row execute function public.touch_updated_at();
create trigger placeholder_friends_touch before insert or update on public.placeholder_friends
  for each row execute function public.touch_updated_at();

alter table public.friendships enable row level security;
alter table public.placeholder_friends enable row level security;
alter table public.invites enable row level security;

create policy "friendships: own rows" on public.friendships
  for select to authenticated using (user_id = auth.uid());
create policy "friendships: star own rows" on public.friendships
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "placeholder_friends: own rows" on public.placeholder_friends
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "invites: read own" on public.invites
  for select to authenticated using (created_by = auth.uid());
create policy "invites: create own" on public.invites
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (placeholder_id is null or exists (
      select 1 from public.placeholder_friends p where p.id = placeholder_id and p.owner_id = auth.uid()
    ))
  );

-- ---------------------------------------------------------------------------
-- Server functions (security definer): the only way to change membership or friendships

-- Accept an invite code. Returns 'ok', 'invalid', 'self', 'used' or 'signed-out'.
create function public.accept_invite(p_code text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_invite public.invites;
  v_my_name text;
  v_their_name text;
begin
  if v_me is null then
    return 'signed-out';
  end if;
  select * into v_invite from public.invites where code = lower(trim(p_code));
  if not found then
    return 'invalid';
  end if;
  if v_invite.created_by = v_me then
    return 'self';
  end if;
  if v_invite.placeholder_id is not null and v_invite.used_by is not null and v_invite.used_by <> v_me then
    return 'used';
  end if;

  select display_name into v_my_name from public.profiles where id = v_me;
  select display_name into v_their_name from public.profiles where id = v_invite.created_by;
  insert into public.friendships (user_id, friend_id, friend_name)
  values (v_me, v_invite.created_by, coalesce(v_their_name, '')),
         (v_invite.created_by, v_me, coalesce(v_my_name, ''))
  on conflict do nothing;

  if v_invite.placeholder_id is not null then
    -- The placeholder becomes this account in every ledger it was in.
    update public.ledger_members m
    set user_id = v_me, display_name = coalesce(nullif(v_my_name, ''), m.display_name)
    where m.placeholder_id = v_invite.placeholder_id and m.user_id is null
      and not exists (
        select 1 from public.ledger_members other where other.ledger_id = m.ledger_id and other.user_id = v_me
      );
    update public.placeholder_friends set merged_user_id = v_me where id = v_invite.placeholder_id;
    update public.invites set used_by = v_me, used_at = now() where code = v_invite.code;
  end if;
  return 'ok';
end;
$$;

-- Adds members to a shared ledger. Each must be the caller, a friend, or one of the
-- caller's placeholder friends (already-merged placeholders become their account).
create function public.insert_ledger_members(p_ledger_id uuid, p_members jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_m jsonb;
  v_user uuid;
  v_placeholder uuid;
begin
  for v_m in select * from jsonb_array_elements(p_members) loop
    v_user := nullif(v_m ->> 'uid', '')::uuid;
    v_placeholder := nullif(v_m ->> 'placeholderId', '')::uuid;
    if v_user is not null and v_user <> v_me and not exists (
      select 1 from public.friendships f where f.user_id = v_me and f.friend_id = v_user
    ) then
      raise exception 'members must be your friends' using errcode = 'insufficient_privilege';
    end if;
    if v_user is null then
      if v_placeholder is null then
        raise exception 'member needs an account or a placeholder' using errcode = 'check_violation';
      end if;
      select p.merged_user_id into v_user from public.placeholder_friends p
      where p.id = v_placeholder and p.owner_id = v_me;
      if not found then
        raise exception 'not your placeholder friend' using errcode = 'insufficient_privilege';
      end if;
    end if;
    insert into public.ledger_members (id, ledger_id, user_id, placeholder_id, display_name)
    values ((v_m ->> 'id')::uuid, p_ledger_id, v_user, v_placeholder, left(coalesce(v_m ->> 'name', ''), 40))
    on conflict do nothing;
  end loop;
end;
$$;

-- Creates a shared ledger with its members. The device chooses all ids so it can work offline.
-- Returns 'ok', or 'exists' when retried after a lost response.
create function public.create_shared_ledger(p_ledger jsonb, p_members jsonb)
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
  insert into public.ledgers (id, name, currency, kind, status, owner_id, created_at)
  values (
    v_id, p_ledger ->> 'name', p_ledger ->> 'currency', 'shared', 'active', v_me,
    coalesce((p_ledger ->> 'createdAt')::timestamptz, now())
  );
  perform public.insert_ledger_members(v_id, p_members);
  return 'ok';
end;
$$;

-- Adds members to a shared ledger the caller belongs to.
create function public.add_ledger_members(p_ledger_id uuid, p_members jsonb)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_active_ledger_member(p_ledger_id)
     or not exists (select 1 from public.ledgers where id = p_ledger_id and kind = 'shared') then
    raise exception 'not a member of this shared ledger' using errcode = 'insufficient_privilege';
  end if;
  perform public.insert_ledger_members(p_ledger_id, p_members);
  return 'ok';
end;
$$;

-- Removes a ledger from the caller's tabs. Personal: deleted. Shared: the caller leaves
-- (their debts stay); when the last member with an account leaves, the ledger is deleted.
create function public.leave_ledger(p_ledger_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ledger public.ledgers;
begin
  select * into v_ledger from public.ledgers where id = p_ledger_id;
  if not found then
    return 'gone';
  end if;
  if v_ledger.kind = 'personal' then
    if v_ledger.owner_id <> v_me then
      raise exception 'not your ledger' using errcode = 'insufficient_privilege';
    end if;
    delete from public.ledgers where id = p_ledger_id;
    return 'deleted';
  end if;
  update public.ledger_members set left_at = now()
  where ledger_id = p_ledger_id and user_id = v_me and left_at is null;
  if not found then
    raise exception 'not a member of this ledger' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.ledger_members where ledger_id = p_ledger_id and user_id is not null and left_at is null
  ) then
    delete from public.ledgers where id = p_ledger_id;
    return 'deleted';
  end if;
  return 'left';
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and realtime

revoke all on public.friendships, public.placeholder_friends, public.invites, public.entry_history
  from anon, authenticated;
grant select on public.friendships to authenticated;
grant update (starred) on public.friendships to authenticated;
grant select, insert on public.placeholder_friends to authenticated;
grant update (name) on public.placeholder_friends to authenticated;
grant select, insert on public.invites to authenticated;
grant select on public.entry_history to authenticated;

revoke execute on function
  public.accept_invite(text),
  public.insert_ledger_members(uuid, jsonb),
  public.create_shared_ledger(jsonb, jsonb),
  public.add_ledger_members(uuid, jsonb),
  public.leave_ledger(uuid),
  public.personal_ledger_for(uuid, text)
  from public, anon;
grant execute on function
  public.accept_invite(text),
  public.create_shared_ledger(jsonb, jsonb),
  public.add_ledger_members(uuid, jsonb),
  public.leave_ledger(uuid)
  to authenticated;

alter publication supabase_realtime add table
  public.ledger_members, public.friendships, public.placeholder_friends, public.invites;
