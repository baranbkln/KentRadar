alter table public.profiles
  add column if not exists current_streak_days integer not null default 0,
  add column if not exists longest_streak_days integer not null default 0,
  add column if not exists last_action_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_current_streak_days_check;
alter table public.profiles
  add constraint profiles_current_streak_days_check
  check (current_streak_days >= 0);

alter table public.profiles
  drop constraint if exists profiles_longest_streak_days_check;
alter table public.profiles
  add constraint profiles_longest_streak_days_check
  check (longest_streak_days >= 0);

alter table public.user_score_events
  add column if not exists bonus_type text,
  add column if not exists base_points integer;

update public.user_score_events as se
set base_points = se.points
where se.base_points is null;

alter table public.user_score_events
  alter column base_points set not null;

alter table public.user_score_events
  drop constraint if exists user_score_events_bonus_type_check;
alter table public.user_score_events
  add constraint user_score_events_bonus_type_check
  check (
    bonus_type is null
    or bonus_type in ('CRITICAL_HIT', 'COLD_CASE', 'STREAK_BONUS')
  );

alter table public.user_score_events
  drop constraint if exists user_score_events_base_points_check;
alter table public.user_score_events
  add constraint user_score_events_base_points_check
  check (base_points <> 0 and base_points between -100000 and 100000);

create or replace function public.update_user_streak(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_current_streak integer;
  v_longest_streak integer;
  v_last_action_at timestamptz;
  v_today_utc date := (clock_timestamp() at time zone 'UTC')::date;
  v_last_action_date_utc date;
  v_next_streak integer;
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'user_id_required';
  end if;

  select
    p.current_streak_days,
    p.longest_streak_days,
    p.last_action_at
  into
    v_current_streak,
    v_longest_streak,
    v_last_action_at
  from public.profiles as p
  where p.id = p_user_id
  for update;

  if not found then
    return;
  end if;

  v_last_action_date_utc :=
    (v_last_action_at at time zone 'UTC')::date;

  if v_last_action_at is null then
    v_next_streak := 1;
  elsif v_last_action_date_utc = v_today_utc then
    v_next_streak := greatest(v_current_streak, 1);
  elsif v_last_action_date_utc = v_today_utc - 1 then
    v_next_streak := greatest(v_current_streak, 0) + 1;
  else
    v_next_streak := 1;
  end if;

  update public.profiles as p
  set
    current_streak_days = v_next_streak,
    longest_streak_days = greatest(v_longest_streak, v_next_streak),
    last_action_at = clock_timestamp()
  where p.id = p_user_id;
end;
$$;

create or replace function public.calculate_dynamic_score(
  p_issue_id uuid,
  p_base_score integer
)
returns table (
  final_score integer,
  applied_bonus text
)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_issue_created_at timestamptz;
  v_issue_status public.road_issue_status;
begin
  if p_base_score is null or p_base_score = 0 then
    raise exception using
      errcode = '22023',
      message = 'base_score_required';
  end if;

  if p_base_score < 0 then
    return query
    select p_base_score, null::text;
    return;
  end if;

  if p_issue_id is not null then
    select
      ri.created_at,
      ri.status
    into
      v_issue_created_at,
      v_issue_status
    from public.road_issues as ri
    where ri.id = p_issue_id;
  end if;

  if v_issue_created_at is not null
    and v_issue_created_at < clock_timestamp() - interval '30 days'
    and v_issue_status <> 'solved'
  then
    return query
    select p_base_score * 2, 'COLD_CASE'::text;
    return;
  end if;

  if pg_catalog.random() < 0.10 then
    return query
    select p_base_score * 3, 'CRITICAL_HIT'::text;
    return;
  end if;

  return query
  select p_base_score, null::text;
end;
$$;

create or replace function public.award_score_event(
  p_user_id uuid,
  p_issue_id uuid,
  p_source_user_id uuid,
  p_event_type text,
  p_points integer,
  p_status text,
  p_reason text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_final_points integer := p_points;
  v_bonus_type text;
  v_is_direct_user_action boolean;
begin
  if p_user_id is null or p_points = 0 then
    return null;
  end if;

  if p_status not in ('pending', 'confirmed', 'reversed', 'ignored') then
    raise exception 'invalid_score_event_status';
  end if;

  v_is_direct_user_action := p_event_type in (
    'issue_report_created',
    'issue_verified_by_user',
    'damage_reported_by_user',
    'issue_solved_reported_by_user',
    'issue_false_reported_by_user'
  );

  if p_points > 0
    and p_status in ('pending', 'confirmed')
    and v_is_direct_user_action
  then
    select
      dynamic_score.final_score,
      dynamic_score.applied_bonus
    into
      v_final_points,
      v_bonus_type
    from public.calculate_dynamic_score(
      p_issue_id,
      p_points
    ) as dynamic_score;
  end if;

  insert into public.user_score_events as se (
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
    finalized_at,
    reversed_at
  )
  values (
    p_user_id,
    p_issue_id,
    p_source_user_id,
    p_event_type,
    v_final_points,
    p_points,
    v_bonus_type,
    p_status,
    p_reason,
    p_dedupe_key,
    case when p_status = 'confirmed' then now() else null end,
    case when p_status = 'reversed' then now() else null end
  )
  on conflict (dedupe_key) do nothing
  returning se.id into v_event_id;

  if v_event_id is not null then
    if v_is_direct_user_action
      and p_points > 0
      and p_status in ('pending', 'confirmed')
    then
      perform public.update_user_streak(p_user_id);
    end if;

    perform public.refresh_user_score_totals(p_user_id);
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.update_user_streak(uuid)
  from public, anon, authenticated;
revoke all on function public.calculate_dynamic_score(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.award_score_event(
  uuid,
  uuid,
  uuid,
  text,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;

notify pgrst, 'reload schema';
