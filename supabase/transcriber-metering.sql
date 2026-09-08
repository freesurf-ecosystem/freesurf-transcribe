-- FreeSurf usage metering (anonymous-first)
-- Run once in Supabase SQL Editor on the consolidated project (jstojewashwoswsskwjk).
-- The worker reads `usage` rows and calls `meter_usage` using the service-role (secret) key,
-- so no anon policies are required (service role bypasses RLS).
--
-- Idempotent: safe to re-run. Handles both a fresh setup and an existing table that used the old
-- column name `week_start` (renamed to `period_start`, since we meter by week OR month).

-- Rename the legacy column if this table was created earlier with `week_start`.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usage' and column_name = 'week_start'
  ) then
    alter table public.usage rename column week_start to period_start;
  end if;
end $$;

-- One row per (user_id, metric, period). user_id is TEXT so it can hold either an account UUID
-- or an anonymous id like "anon:dev-xxxx" (no login). period_start is the bucket start date
-- (week start or month start, e.g. "2026-09-01").
create table if not exists public.usage (
  user_id      text    not null,
  metric       text    not null,
  period_start date    not null,
  count        bigint  not null default 0,
  primary key (user_id, metric, period_start)
);

alter table public.usage enable row level security;

-- Upsert + add delta, returning the new running total. Used by the worker's meter_usage RPC.
-- (Drop first: Postgres can't rename an existing input parameter via CREATE OR REPLACE.)
drop function if exists public.meter_usage(text, text, text, bigint);
create function public.meter_usage(
  p_user_id text,
  p_metric  text,
  p_period  text,
  p_delta   bigint
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count bigint;
begin
  insert into public.usage (user_id, metric, period_start, count)
  values (p_user_id, p_metric, p_period::date, p_delta)
  on conflict (user_id, metric, period_start)
  do update set count = public.usage.count + excluded.count
  returning count into new_count;

  return new_count;
end;
$$;

-- Grant execution so the service-role (secret) key can call it over the REST RPC endpoint.
revoke execute on function public.meter_usage(text, text, text, bigint) from public;
grant execute on function public.meter_usage(text, text, text, bigint) to service_role;
