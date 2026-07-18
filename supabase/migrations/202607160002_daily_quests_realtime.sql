alter table public.user_score_events
  drop constraint if exists user_score_events_bonus_type_check;
alter table public.user_score_events
  add constraint user_score_events_bonus_type_check
  check (
    bonus_type is null
    or bonus_type in (
      'CRITICAL_HIT',
      'COLD_CASE',
      'STREAK_BONUS',
      'DAILY_QUEST'
    )
  );

create table if not exists public.daily_quest_claims (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_date date not null,
  points_awarded integer not null default 50 check (points_awarded > 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_date)
);

create index if not exists daily_quest_claims_claimed_at_idx
  on public.daily_quest_claims (claimed_at desc);

alter table public.daily_quest_claims enable row level security;

drop policy if exists "Users can read their own daily quest claims"
  on public.daily_quest_claims;
create policy "Users can read their own daily quest claims"
on public.daily_quest_claims
for select
to authenticated
using (auth.uid() = user_id);

revoke all on table public.daily_quest_claims from public, anon, authenticated;
grant select on table public.daily_quest_claims to authenticated;

create or replace function public.get_daily_quest_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_quest_date date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  v_day_start timestamptz := (
    date_trunc('day', clock_timestamp() at time zone 'Europe/Istanbul')
    at time zone 'Europe/Istanbul'
  );
  v_target constant integer := 3;
  v_current integer;
  v_bonus_claimed boolean;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select count(*)::integer
  into v_current
  from public.user_score_events as se
  where se.user_id = v_user_id
    and se.created_at >= v_day_start
    and se.status in ('pending', 'confirmed')
    and se.event_type in (
      'issue_report_created',
      'issue_verified_by_user'
    );

  select exists (
    select 1
    from public.daily_quest_claims as claim
    where claim.user_id = v_user_id
      and claim.quest_date = v_quest_date
  )
  into v_bonus_claimed;

  return jsonb_build_object(
    'target', v_target,
    'current', least(v_current, v_target),
    'is_completed', v_current >= v_target,
    'bonus_claimed', v_bonus_claimed
  );
end;
$$;

create or replace function public.claim_daily_quest_bonus()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_quest_date date := (clock_timestamp() at time zone 'Europe/Istanbul')::date;
  v_day_start timestamptz := (
    date_trunc('day', clock_timestamp() at time zone 'Europe/Istanbul')
    at time zone 'Europe/Istanbul'
  );
  v_target constant integer := 3;
  v_current integer;
  v_claimed_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.is_suspended = false
  ) then
    raise exception 'account_not_active';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat('daily-quest:', v_user_id::text, ':', v_quest_date::text),
      0
    )
  );

  select count(*)::integer
  into v_current
  from public.user_score_events as se
  where se.user_id = v_user_id
    and se.created_at >= v_day_start
    and se.status in ('pending', 'confirmed')
    and se.event_type in (
      'issue_report_created',
      'issue_verified_by_user'
    );

  if v_current < v_target then
    raise exception 'daily_quest_not_completed';
  end if;

  insert into public.daily_quest_claims as claim (
    user_id,
    quest_date,
    points_awarded
  )
  values (
    v_user_id,
    v_quest_date,
    50
  )
  on conflict (user_id, quest_date) do nothing
  returning claim.user_id into v_claimed_user_id;

  if v_claimed_user_id is null then
    return jsonb_build_object(
      'target', v_target,
      'current', least(v_current, v_target),
      'is_completed', true,
      'bonus_claimed', true,
      'awarded_points', 0
    );
  end if;

  insert into public.user_score_events (
    user_id,
    issue_id,
    source_user_id,
    event_type,
    points,
    base_points,
    bonus_type,
    status,
    reason,
    dedupe_key,
    finalized_at
  )
  values (
    v_user_id,
    null,
    v_user_id,
    'daily_quest_bonus',
    50,
    50,
    'DAILY_QUEST',
    'confirmed',
    'Günlük operasyon ödülü',
    concat('daily_quest:', v_user_id::text, ':', v_quest_date::text),
    clock_timestamp()
  );

  perform public.refresh_user_score_totals(v_user_id);

  return jsonb_build_object(
    'target', v_target,
    'current', least(v_current, v_target),
    'is_completed', true,
    'bonus_claimed', true,
    'awarded_points', 50
  );
end;
$$;

revoke all on function public.get_daily_quest_status()
  from public, anon, authenticated;
grant execute on function public.get_daily_quest_status()
  to authenticated;

revoke all on function public.claim_daily_quest_bonus()
  from public, anon, authenticated;
grant execute on function public.claim_daily_quest_bonus()
  to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'user_score_events'
  ) then
    alter publication supabase_realtime
      add table public.user_score_events;
  end if;
end;
$$;

notify pgrst, 'reload schema';
