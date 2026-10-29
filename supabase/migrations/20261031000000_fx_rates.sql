-- Phase 6 (part 2): market mid rates for the suggested ledger rate, and new users' starred currencies.
-- Run after 20261030000000_fx_categories.sql. Safe to run again.
--
-- fx_rates holds one row per day of mid-market rates against one base currency (USD), written by the
-- Edge Function `fetch-fx-rates` (service role, once a day). It is only used to suggest a ledger rate
-- (mid × 1.015, worked out in the app); entries are always converted with the rate stored on them.

-- New accounts star TWD and JPY (spec §5.2). Existing profiles keep their own choice.
alter table public.profiles alter column starred_currencies set default array['TWD', 'JPY'];

create table if not exists public.fx_rates (
  date date primary key,
  base text not null check (base ~ '^[A-Z]{3}$'),
  -- currency -> rate as text ("32.2" = 1 base in that currency)
  rates jsonb not null check (jsonb_typeof(rates) = 'object'),
  source text not null,
  fetched_at timestamptz not null default now()
);

alter table public.fx_rates enable row level security;

drop policy if exists fx_rates_read on public.fx_rates;
create policy fx_rates_read on public.fx_rates for select to authenticated using (true);
-- No insert/update/delete policy: only the service role (Edge Function) writes.

revoke all on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;

-- One rate of a fx_rates row as numeric: 1 for the base, null when missing or not a positive number.
create or replace function public.fx_rate_of(p_rates jsonb, p_base text, p_code text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_code = p_base then 1::numeric
    when (p_rates ->> p_code) ~ '^\d{1,12}(\.\d{1,12})?$' and (p_rates ->> p_code)::numeric > 0
      then (p_rates ->> p_code)::numeric
  end
$$;

-- Latest mid-market rate: 1 p_from = mid p_to (cross rate through the base, 10 decimals, half-up),
-- as text so no precision is lost on the way to the app. No row when either currency is missing.
create or replace function public.mid_rate(p_from text, p_to text)
returns table (mid text, as_of date)
language sql
stable
security invoker
set search_path = public
as $$
  with latest as (
    select r.date, r.base, r.rates from public.fx_rates r order by r.date desc limit 1
  ), pair as (
    select l.date,
      public.fx_rate_of(l.rates, l.base, p_from) as from_rate,
      public.fx_rate_of(l.rates, l.base, p_to) as to_rate
    from latest l
  )
  select round(p.to_rate / p.from_rate, 10)::text, p.date
  from pair p
  where p.from_rate is not null and p.to_rate is not null
$$;

revoke execute on function public.mid_rate(text, text), public.fx_rate_of(jsonb, text, text) from public, anon;
grant execute on function public.mid_rate(text, text), public.fx_rate_of(jsonb, text, text) to authenticated;
