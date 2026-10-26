-- Go Dutch: Phase 5 — appearance settings, home photo storage, deleting an account.
-- Additive on top of the Phase 1–4 migrations. See spec.md §13.5.

-- ---------------------------------------------------------------------------
-- Appearance (Settings → Appearance): background and accent themes, bubble transparency, home photo

alter table public.profiles
  add column bg_theme text not null default 'cream' check (bg_theme in ('cream', 'butter', 'blush', 'mint', 'sky')),
  add column accent_theme text not null default 'marigold'
    check (accent_theme in ('marigold', 'terracotta', 'rose', 'plum', 'sea')),
  add column bubble_opacity text not null default 'solid' check (bubble_opacity in ('solid', 'semi', 'clear')),
  -- Path in the private "home-photos" bucket: <user id>/<file>.
  add column home_photo_path text check (home_photo_path is null or home_photo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$');

-- Photos live in a private bucket, one folder per user; the app shows them with short-lived signed URLs.
-- Only on Supabase (the storage schema doesn't exist in the local test database).
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('home-photos', 'home-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
    on conflict (id) do nothing;
    execute $p$
      create policy "home photos: own folder" on storage.objects
        for all to authenticated
        using (bucket_id = 'home-photos' and (storage.foldername(name))[1] = auth.uid()::text)
        with check (bucket_id = 'home-photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Deleting an account (required by the App Store)

-- Ownership of a shared ledger may move to another member, but only while an account is being deleted.
create or replace function public.guard_ledger_update()
returns trigger
language plpgsql
as $$
begin
  if new.currency <> old.currency then
    raise exception 'ledger currency cannot change' using errcode = 'check_violation';
  end if;
  if new.owner_id <> old.owner_id and coalesce(current_setting('gd.deleting_account', true), '') = 'on' then
    null;
  elsif new.kind <> old.kind or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
    raise exception 'ledger kind, owner and created_at cannot change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Deletes the caller's account and everything only they can see (personal ledgers, recurring payments,
-- bank accounts, friends, placeholder friends, invites). In shared ledgers their member stays under the
-- same name without an account, like a member who left: entries keep pointing at it, so everyone
-- else's balances still add up. A shared ledger nobody with an account is left in is deleted.
create function public.delete_my_account()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ledger uuid;
  v_next uuid;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;
  perform set_config('gd.deleting_account', 'on', true);

  -- Shared ledgers I created would be deleted with my account: hand them to another member first.
  for v_ledger in select id from public.ledgers where owner_id = v_me and kind = 'shared' loop
    select m.user_id into v_next from public.ledger_members m
    where m.ledger_id = v_ledger and m.user_id is not null and m.user_id <> v_me and m.left_at is null
    order by m.id limit 1;
    if v_next is not null then
      update public.ledgers set owner_id = v_next where id = v_ledger;
    end if;
  end loop;

  update public.ledger_members m
  set user_id = null,
      placeholder_id = coalesce(m.placeholder_id, gen_random_uuid()),
      left_at = coalesce(m.left_at, now())
  from public.ledgers l
  where l.id = m.ledger_id and l.kind = 'shared' and m.user_id = v_me;

  delete from public.ledgers l
  where l.kind = 'shared' and not exists (
    select 1 from public.ledger_members m where m.ledger_id = l.id and m.user_id is not null and m.left_at is null
  );

  -- Everything else is removed with the user (on delete cascade).
  delete from auth.users where id = v_me;
  perform set_config('gd.deleting_account', '', true);
  return 'deleted';
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
