-- Go Dutch: Phase 6 (part 3) — who changed a ledger rate, and the no-login share page.
-- See spec.md §6A.2, §6B, §13.6. Run after 20261031000000_fx_rates.sql. Safe to run again.

-- ---------------------------------------------------------------------------
-- Rate change notices: "Amy changed the JPY rate to 0.211" for the other members.
-- The server records who changed each rate and when; whatever the app sends for it is ignored.

alter table public.ledgers add column if not exists rate_changes jsonb not null default '{}'::jsonb;

create or replace function public.note_rate_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
  v_rate text;
begin
  if tg_op = 'INSERT' then
    new.rate_changes := '{}'::jsonb;
    return new;
  end if;
  new.rate_changes := coalesce(old.rate_changes, '{}'::jsonb);
  -- Malformed rates are left to the valid_rates check to refuse.
  if new.rates is distinct from old.rates and jsonb_typeof(new.rates) = 'object' then
    for v_code, v_rate in select key, value from jsonb_each_text(new.rates) loop
      if (old.rates ->> v_code) is distinct from v_rate then
        new.rate_changes := new.rate_changes || jsonb_build_object(
          v_code, jsonb_build_object('by', auth.uid(), 'rate', v_rate, 'at', now())
        );
      end if;
    end loop;
    -- Forget currencies that no longer have a rate.
    new.rate_changes := new.rate_changes - coalesce(
      array(select jsonb_object_keys(new.rate_changes) except select jsonb_object_keys(new.rates)),
      '{}'::text[]
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ledgers_rate_changes on public.ledgers;
create trigger ledgers_rate_changes before insert or update on public.ledgers
  for each row execute function public.note_rate_changes();

-- ---------------------------------------------------------------------------
-- Share links (§6B.1): one live link per shared ledger; anyone with it can view, not edit.

create table if not exists public.ledger_share_links (
  ledger_id uuid primary key references public.ledgers (id) on delete cascade,
  -- 32 random hex characters (122 random bits), not guessable.
  token text not null unique check (token ~ '^[a-f0-9]{32}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.ledger_share_links enable row level security;
drop policy if exists "ledger_share_links: members read" on public.ledger_share_links;
create policy "ledger_share_links: members read" on public.ledger_share_links
  for select to authenticated using (public.is_ledger_member(ledger_id));

-- Members who joined from a share link: the others see "Ben joined from the share link".
alter table public.ledger_members add column if not exists claimed_via_share boolean not null default false;
alter table public.ledger_members add column if not exists share_joined_at timestamptz;

-- Join requests from the share page (§6B.3). Written only by request_join / answer_join_request.
create table if not exists public.ledger_join_requests (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The requester's name when they asked, for the members deciding.
  requester_name text not null default '',
  -- The member without an account they say they are; null = "I'm not on the list" (a new member).
  member_id uuid references public.ledger_members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz
);
create unique index if not exists ledger_join_requests_one_pending
  on public.ledger_join_requests (ledger_id, user_id) where status = 'pending';
create unique index if not exists ledger_join_requests_member_pending
  on public.ledger_join_requests (member_id) where status = 'pending' and member_id is not null;

alter table public.ledger_join_requests enable row level security;
drop policy if exists "ledger_join_requests: requester and members read" on public.ledger_join_requests;
create policy "ledger_join_requests: requester and members read" on public.ledger_join_requests
  for select to authenticated using (user_id = auth.uid() or public.is_ledger_member(ledger_id));

revoke all on public.ledger_share_links, public.ledger_join_requests from anon, authenticated;
grant select on public.ledger_share_links, public.ledger_join_requests to authenticated;

-- The live link of a shared ledger, made if there is none. p_regenerate: replace it with a new one
-- (the old link stops working). Members only. Returns the token.
create or replace function public.create_share_link(p_ledger_id uuid, p_regenerate boolean default false)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null or not public.is_ledger_member(p_ledger_id)
     or not exists (select 1 from public.ledgers where id = p_ledger_id and kind = 'shared') then
    raise exception 'not a member of this shared ledger' using errcode = 'insufficient_privilege';
  end if;
  if not p_regenerate then
    select token into v_token from public.ledger_share_links
    where ledger_id = p_ledger_id and revoked_at is null;
    if found then
      return v_token;
    end if;
  end if;
  v_token := replace(gen_random_uuid()::text, '-', '');
  insert into public.ledger_share_links (ledger_id, token, created_by)
  values (p_ledger_id, v_token, auth.uid())
  on conflict (ledger_id) do update
    set token = excluded.token, created_by = excluded.created_by, created_at = now(), revoked_at = null;
  return v_token;
end;
$$;

-- Turns the link off at once. Members only.
create or replace function public.revoke_share_link(p_ledger_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_ledger_member(p_ledger_id) then
    raise exception 'not a member of this shared ledger' using errcode = 'insufficient_privilege';
  end if;
  update public.ledger_share_links set revoked_at = now()
  where ledger_id = p_ledger_id and revoked_at is null;
  return 'ok';
end;
$$;

-- What the share page shows (§6B.2), for anyone with a live link, signed in or not. Null when the
-- link is unknown, turned off, or the ledger is gone. Never includes emails or account ids, and
-- nothing from other ledgers.
create or replace function public.get_shared_ledger(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ledger public.ledgers;
begin
  select l.* into v_ledger
  from public.ledger_share_links s
  join public.ledgers l on l.id = s.ledger_id
  where s.token = p_token and s.revoked_at is null and l.kind = 'shared';
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'ledger', jsonb_build_object(
      'id', v_ledger.id,
      'name', v_ledger.name,
      'currency', v_ledger.currency,
      'status', v_ledger.status,
      'ownerMemberId', (
        select m.id from public.ledger_members m
        where m.ledger_id = v_ledger.id and m.user_id = v_ledger.owner_id limit 1
      )
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'name', m.display_name,
        'hasAccount', m.user_id is not null,
        'left', m.left_at is not null,
        'claimPending', exists (
          select 1 from public.ledger_join_requests r where r.member_id = m.id and r.status = 'pending'
        )
      ) order by m.joined_at, m.id)
      from public.ledger_members m where m.ledger_id = v_ledger.id
    ), '[]'::jsonb),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'type', e.type,
        'isSplit', e.is_split,
        'amountMinor', e.amount_minor,
        'currency', e.currency,
        'fxRate', e.fx_rate::text,
        'fxSource', e.fx_source,
        'amountSettleMinor', e.amount_settle_minor,
        'shares', e.shares,
        'sharesSettle', e.shares_settle,
        'payerMemberId', e.payer_member_id,
        'categoryCode', e.category_code,
        'date', e.date,
        'note', e.note,
        'recordedOnBehalf', e.recorded_on_behalf,
        'createdAt', e.created_at
      ) order by e.date desc, e.created_at desc)
      from public.entries e where e.ledger_id = v_ledger.id and e.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- Asks to join from the share page. p_member_id: the member without an account I say I am, or
-- null for "I'm not on the list". Returns 'sent', 'pending' (already asked), 'member' (already in
-- it), 'taken' (that member has an account or someone else asked), 'invalid' or 'signed-out'.
create or replace function public.request_join(p_token text, p_member_id uuid default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ledger_id uuid;
  v_member public.ledger_members;
  v_name text;
begin
  if v_me is null then
    return 'signed-out';
  end if;
  select s.ledger_id into v_ledger_id
  from public.ledger_share_links s join public.ledgers l on l.id = s.ledger_id
  where s.token = p_token and s.revoked_at is null and l.kind = 'shared';
  if not found then
    return 'invalid';
  end if;
  if exists (
    select 1 from public.ledger_members where ledger_id = v_ledger_id and user_id = v_me and left_at is null
  ) then
    return 'member';
  end if;
  if exists (
    select 1 from public.ledger_join_requests where ledger_id = v_ledger_id and user_id = v_me and status = 'pending'
  ) then
    return 'pending';
  end if;
  if p_member_id is not null then
    select * into v_member from public.ledger_members where id = p_member_id and ledger_id = v_ledger_id;
    if not found then
      return 'invalid';
    end if;
    if v_member.user_id is not null or exists (
      select 1 from public.ledger_join_requests where member_id = p_member_id and status = 'pending'
    ) then
      return 'taken';
    end if;
  end if;
  select display_name into v_name from public.profiles where id = v_me;
  insert into public.ledger_join_requests (ledger_id, user_id, requester_name, member_id)
  values (v_ledger_id, v_me, coalesce(v_name, ''), p_member_id);
  return 'sent';
end;
$$;

-- Approves or turns down a join request. Only the ledger creator, or any member once the creator
-- has left. Approving a claim makes the requester that member in this ledger only (the creator's
-- placeholder friend and other ledgers stay as they are); otherwise they join as a new member.
-- Either way they become friends with the creator. Returns 'approved', 'rejected', 'taken',
-- 'answered' (already decided) or 'gone'.
create or replace function public.answer_join_request(p_request_id uuid, p_approve boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_req public.ledger_join_requests;
  v_ledger public.ledgers;
  v_name text;
  v_owner_name text;
begin
  select * into v_req from public.ledger_join_requests where id = p_request_id for update;
  if not found then
    return 'gone';
  end if;
  select * into v_ledger from public.ledgers where id = v_req.ledger_id;
  if not public.is_ledger_member(v_ledger.id) or (
    v_me <> v_ledger.owner_id and exists (
      select 1 from public.ledger_members
      where ledger_id = v_ledger.id and user_id = v_ledger.owner_id and left_at is null
    )
  ) then
    raise exception 'only the ledger creator can answer' using errcode = 'insufficient_privilege';
  end if;
  if v_req.status <> 'pending' then
    return 'answered';
  end if;
  if not p_approve then
    update public.ledger_join_requests set status = 'rejected', answered_by = v_me, answered_at = now()
    where id = v_req.id;
    return 'rejected';
  end if;

  select display_name into v_name from public.profiles where id = v_req.user_id;
  v_name := coalesce(nullif(v_name, ''), v_req.requester_name);
  if exists (select 1 from public.ledger_members where ledger_id = v_ledger.id and user_id = v_req.user_id) then
    -- They were in it before and left: back in.
    update public.ledger_members set left_at = null, claimed_via_share = true, share_joined_at = now()
    where ledger_id = v_ledger.id and user_id = v_req.user_id;
  elsif v_req.member_id is not null then
    update public.ledger_members
    set user_id = v_req.user_id, display_name = coalesce(nullif(v_name, ''), display_name),
        claimed_via_share = true, share_joined_at = now()
    where id = v_req.member_id and ledger_id = v_ledger.id and user_id is null;
    if not found then
      update public.ledger_join_requests set status = 'rejected', answered_by = v_me, answered_at = now()
      where id = v_req.id;
      return 'taken';
    end if;
  else
    insert into public.ledger_members (ledger_id, user_id, display_name, claimed_via_share, share_joined_at)
    values (v_ledger.id, v_req.user_id, left(v_name, 40), true, now());
  end if;

  if v_req.user_id <> v_ledger.owner_id then
    select display_name into v_owner_name from public.profiles where id = v_ledger.owner_id;
    insert into public.friendships (user_id, friend_id, friend_name)
    values (v_req.user_id, v_ledger.owner_id, coalesce(v_owner_name, '')),
           (v_ledger.owner_id, v_req.user_id, coalesce(v_name, ''))
    on conflict do nothing;
  end if;
  update public.ledger_join_requests set status = 'approved', answered_by = v_me, answered_at = now()
  where id = v_req.id;
  return 'approved';
end;
$$;

revoke execute on function
  public.create_share_link(uuid, boolean),
  public.revoke_share_link(uuid),
  public.get_shared_ledger(text),
  public.request_join(text, uuid),
  public.answer_join_request(uuid, boolean)
  from public, anon;
grant execute on function
  public.create_share_link(uuid, boolean),
  public.revoke_share_link(uuid),
  public.request_join(text, uuid),
  public.answer_join_request(uuid, boolean)
  to authenticated;
-- The share page works without signing in.
grant execute on function public.get_shared_ledger(text) to anon, authenticated;
