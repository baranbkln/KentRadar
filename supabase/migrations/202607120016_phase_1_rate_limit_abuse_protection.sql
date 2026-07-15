create table if not exists public.user_action_cooldown_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists user_action_cooldown_events_user_created_idx
  on public.user_action_cooldown_events (user_id, created_at desc);

alter table public.user_action_cooldown_events enable row level security;

revoke all on table public.user_action_cooldown_events
  from public, anon, authenticated;

create or replace function public.check_user_action_cooldown(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_recent_action_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'user_action_cooldown:' || p_user_id::text,
      0
    )
  );

  delete from public.user_action_cooldown_events as uace
  where uace.user_id = p_user_id
    and uace.created_at <= v_now - interval '60 seconds';

  select count(*)::integer
  into v_recent_action_count
  from public.user_action_cooldown_events as uace
  where uace.user_id = p_user_id
    and uace.created_at > v_now - interval '60 seconds';

  if v_recent_action_count >= 5 then
    raise exception using
      errcode = 'P0001',
      message = 'RATE_LIMIT: Çok fazla işlem yaptınız. Lütfen 1 dakika bekleyin.';
  end if;

  insert into public.user_action_cooldown_events (user_id, created_at)
  values (p_user_id, v_now);
end;
$$;

revoke all on function public.check_user_action_cooldown(uuid)
  from public, anon, authenticated;

-- Preserve the existing, hardened action implementations as private cores.
alter function public.verify_issue(uuid, double precision, double precision)
  rename to verify_issue_rate_limited_core;
alter function public.report_solved(uuid, double precision, double precision)
  rename to report_solved_rate_limited_core;
alter function public.report_false_issue(uuid, double precision, double precision)
  rename to report_false_issue_rate_limited_core;

revoke all on function public.verify_issue_rate_limited_core(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;
revoke all on function public.report_solved_rate_limited_core(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;
revoke all on function public.report_false_issue_rate_limited_core(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;

create or replace function public.verify_issue(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.check_user_action_cooldown(v_user_id);

  return query
  select
    result.issue_id,
    result.report_id,
    result.status,
    result.distance_to_issue_meters,
    result.message
  from public.verify_issue_rate_limited_core(
    p_issue_id,
    p_latitude,
    p_longitude
  ) as result;
end;
$$;

create or replace function public.report_solved(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.check_user_action_cooldown(v_user_id);

  return query
  select
    result.issue_id,
    result.report_id,
    result.status,
    result.distance_to_issue_meters,
    result.message
  from public.report_solved_rate_limited_core(
    p_issue_id,
    p_latitude,
    p_longitude
  ) as result;
end;
$$;

create or replace function public.report_false_issue(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.check_user_action_cooldown(v_user_id);

  return query
  select
    result.issue_id,
    result.report_id,
    result.status,
    result.distance_to_issue_meters,
    result.message
  from public.report_false_issue_rate_limited_core(
    p_issue_id,
    p_latitude,
    p_longitude
  ) as result;
end;
$$;

-- New issue/user report inserts also enter the same cooldown window.
create or replace function public.score_issue_user_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_user_action_cooldown(new.user_id);

  perform public.award_score_event(
    new.user_id,
    new.issue_id,
    null,
    'issue_report_created',
    10,
    'pending',
    'new_issue_report_escrow',
    concat('issue_report_created:', new.issue_id, ':', new.user_id)
  );

  return new;
end;
$$;

revoke all on function public.verify_issue(
  uuid,
  double precision,
  double precision
) from public, anon;
revoke all on function public.report_solved(
  uuid,
  double precision,
  double precision
) from public, anon;
revoke all on function public.report_false_issue(
  uuid,
  double precision,
  double precision
) from public, anon;
revoke all on function public.score_issue_user_report_insert()
  from public, anon, authenticated;

grant execute on function public.verify_issue(
  uuid,
  double precision,
  double precision
) to authenticated;
grant execute on function public.report_solved(
  uuid,
  double precision,
  double precision
) to authenticated;
grant execute on function public.report_false_issue(
  uuid,
  double precision,
  double precision
) to authenticated;

notify pgrst, 'reload schema';
