alter table public.issue_reports
  add column if not exists reputation_weight numeric(4, 2)
  not null default 1.00
  check (reputation_weight >= 1.00 and reputation_weight <= 5.00);

alter table public.issue_user_verifications
  add column if not exists reputation_weight numeric(4, 2)
  not null default 1.00
  check (reputation_weight >= 1.00 and reputation_weight <= 5.00);

alter table public.road_issues
  add column if not exists weighted_verification_score numeric(10, 2)
    not null default 0 check (weighted_verification_score >= 0),
  add column if not exists weighted_solved_score numeric(10, 2)
    not null default 0 check (weighted_solved_score >= 0),
  add column if not exists weighted_false_score numeric(10, 2)
    not null default 0 check (weighted_false_score >= 0);

create or replace function public.reputation_weight_for_points(
  p_confirmed_points integer
)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when coalesce(p_confirmed_points, 0) >= 3000 then 5.00::numeric
    when coalesce(p_confirmed_points, 0) >= 1500 then 3.50::numeric
    when coalesce(p_confirmed_points, 0) >= 700 then 2.50::numeric
    when coalesce(p_confirmed_points, 0) >= 300 then 2.00::numeric
    when coalesce(p_confirmed_points, 0) >= 100 then 1.50::numeric
    else 1.00::numeric
  end;
$$;

create or replace function public.get_user_reputation_weight(p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.reputation_weight_for_points(
    coalesce(
      (
        select ust.confirmed_points
        from public.user_score_totals as ust
        where ust.user_id = p_user_id
      ),
      0
    )
  );
$$;

alter table public.user_score_events
  drop constraint if exists user_score_events_points_check;
alter table public.user_score_events
  add constraint user_score_events_points_check
  check (points <> 0 and points between -100000 and 100000);

alter table public.user_score_totals
  drop constraint if exists user_score_totals_confirmed_points_check;
alter table public.user_score_totals
  drop constraint if exists user_score_totals_pending_points_check;
alter table public.user_score_totals
  drop constraint if exists user_score_totals_all_time_points_check;

create or replace function public.refresh_user_score_totals(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed_points integer;
  v_pending_points integer;
  v_reversed_points integer;
  v_ignored_points integer;
begin
  if p_user_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 0)
  );

  select
    coalesce(sum(se.points) filter (where se.status = 'confirmed'), 0)::integer,
    coalesce(sum(se.points) filter (where se.status = 'pending'), 0)::integer,
    coalesce(sum(abs(se.points)) filter (where se.status = 'reversed'), 0)::integer,
    coalesce(sum(abs(se.points)) filter (where se.status = 'ignored'), 0)::integer
  into
    v_confirmed_points,
    v_pending_points,
    v_reversed_points,
    v_ignored_points
  from public.user_score_events as se
  where se.user_id = p_user_id;

  insert into public.user_score_totals as ust (
    user_id,
    confirmed_points,
    pending_points,
    reversed_points,
    ignored_points,
    all_time_points,
    level_label,
    updated_at
  )
  values (
    p_user_id,
    v_confirmed_points,
    v_pending_points,
    v_reversed_points,
    v_ignored_points,
    v_confirmed_points,
    public.calculate_score_level(v_confirmed_points),
    now()
  )
  on conflict (user_id)
  do update set
    confirmed_points = excluded.confirmed_points,
    pending_points = excluded.pending_points,
    reversed_points = excluded.reversed_points,
    ignored_points = excluded.ignored_points,
    all_time_points = excluded.all_time_points,
    level_label = excluded.level_label,
    updated_at = now();
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
begin
  if p_user_id is null or p_points = 0 then
    return null;
  end if;

  if p_status not in ('pending', 'confirmed', 'reversed', 'ignored') then
    raise exception 'invalid_score_event_status';
  end if;

  insert into public.user_score_events as se (
    user_id,
    issue_id,
    source_user_id,
    event_type,
    points,
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
    p_points,
    p_status,
    p_reason,
    p_dedupe_key,
    case when p_status = 'confirmed' then now() else null end,
    case when p_status = 'reversed' then now() else null end
  )
  on conflict (dedupe_key) do nothing
  returning se.id into v_event_id;

  if v_event_id is not null then
    perform public.refresh_user_score_totals(p_user_id);
  end if;

  return v_event_id;
end;
$$;

create or replace function public.apply_false_issue_penalty(p_issue_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original_reporter_id uuid;
begin
  select ri.created_by
  into v_original_reporter_id
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  return public.award_score_event(
    v_original_reporter_id,
    p_issue_id,
    null,
    'issue_false_penalty',
    -20,
    'confirmed',
    'community_disputed_issue',
    concat('issue_false_penalty:', p_issue_id, ':', v_original_reporter_id)
  );
end;
$$;

-- Normalize legacy score events before reputation snapshots are calculated.
update public.user_score_events as se
set
  points = 10,
  status = case
    when se.status = 'reversed' then 'reversed'
    when exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = se.issue_id
        and iur.user_id = se.user_id
        and iur.withdrawn_at is null
    ) and exists (
      select 1
      from public.issue_user_verifications as iuv
      where iuv.issue_id = se.issue_id
        and iuv.user_id <> se.user_id
    ) then 'confirmed'
    when exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = se.issue_id
        and iur.user_id = se.user_id
        and iur.withdrawn_at is null
    ) then 'pending'
    else 'reversed'
  end,
  finalized_at = case
    when exists (
      select 1
      from public.issue_user_verifications as iuv
      where iuv.issue_id = se.issue_id
        and iuv.user_id <> se.user_id
    ) then coalesce(se.finalized_at, now())
    else se.finalized_at
  end,
  reversed_at = case
    when not exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = se.issue_id
        and iur.user_id = se.user_id
        and iur.withdrawn_at is null
    ) then coalesce(se.reversed_at, now())
    else se.reversed_at
  end,
  reason = 'point_economy_create_issue'
where se.event_type = 'issue_report_created';

update public.user_score_events as se
set
  points = 5,
  status = case when se.status = 'reversed' then 'reversed' else 'confirmed' end,
  finalized_at = case
    when se.status <> 'reversed' then coalesce(se.finalized_at, now())
    else se.finalized_at
  end,
  reason = 'point_economy_verification'
where se.event_type = 'issue_verified_by_user';

update public.user_score_events as se
set
  points = 15,
  status = case
    when se.status = 'reversed' then 'reversed'
    when not exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = se.issue_id
        and ir.user_id = se.user_id
        and ir.report_type = 'solved'
    ) then 'reversed'
    when exists (
      select 1
      from public.road_issues as ri
      where ri.id = se.issue_id
        and ri.status = 'solved'
    ) then 'confirmed'
    else 'pending'
  end,
  finalized_at = case
    when exists (
      select 1
      from public.road_issues as ri
      where ri.id = se.issue_id
        and ri.status = 'solved'
    ) then coalesce(se.finalized_at, now())
    else se.finalized_at
  end,
  reversed_at = case
    when not exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = se.issue_id
        and ir.user_id = se.user_id
        and ir.report_type = 'solved'
    ) then coalesce(se.reversed_at, now())
    else se.reversed_at
  end,
  reason = 'point_economy_solved_escrow'
where se.event_type = 'issue_solved_reported_by_user';

update public.user_score_events as se
set
  status = 'ignored',
  reason = 'retired_by_point_economy',
  finalized_at = null,
  reversed_at = null
where se.event_type in (
  'issue_report_verified_bonus',
  'damage_reported_by_user',
  'issue_damage_received_bonus',
  'issue_solved_bonus',
  'issue_false_reported_by_user'
)
  and se.status <> 'ignored';

do $$
declare
  v_user record;
begin
  for v_user in
    select distinct se.user_id
    from public.user_score_events as se
  loop
    perform public.refresh_user_score_totals(v_user.user_id);
  end loop;
end;
$$;

update public.issue_reports as ir
set reputation_weight = public.get_user_reputation_weight(ir.user_id)
where ir.report_type in ('verified', 'solved', 'false_report');

update public.issue_user_verifications as iuv
set reputation_weight = public.get_user_reputation_weight(iuv.user_id);

-- Keep only the latest state signal if legacy data contains both solved and false.
with ranked_state_signals as (
  select
    ir.id,
    row_number() over (
      partition by ir.issue_id, ir.user_id
      order by ir.created_at desc, ir.id desc
    ) as signal_rank
  from public.issue_reports as ir
  where ir.report_type in ('solved', 'false_report')
)
delete from public.issue_reports as ir
using ranked_state_signals as ranked
where ir.id = ranked.id
  and ranked.signal_rank > 1;

create unique index if not exists issue_reports_one_state_signal_per_user_idx
  on public.issue_reports (issue_id, user_id)
  where report_type in ('solved', 'false_report');

create or replace function public.validate_issue_action_proximity(
  p_issue_geog extensions.geography,
  p_latitude double precision,
  p_longitude double precision,
  p_max_distance_meters numeric default 500
)
returns numeric
language plpgsql
immutable
set search_path = public, extensions
as $$
declare
  v_user_geog extensions.geography(Point, 4326);
  v_distance_meters numeric(10, 2);
begin
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  if p_issue_geog is null then
    raise exception 'issue_location_missing';
  end if;

  if p_max_distance_meters is null or p_max_distance_meters <= 0 then
    raise exception 'invalid_proximity_limit';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  if not extensions.st_dwithin(
    p_issue_geog,
    v_user_geog,
    p_max_distance_meters
  ) then
    raise exception 'proximity_required';
  end if;

  v_distance_meters := round(
    extensions.st_distance(p_issue_geog, v_user_geog)::numeric,
    2
  );

  return v_distance_meters;
end;
$$;

create or replace function public.refresh_road_issue_reputation_state(
  p_issue_id uuid
)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_current_status public.road_issue_status;
  v_next_status public.road_issue_status;
  v_reporter_count integer;
  v_verification_count integer;
  v_solved_count integer;
  v_false_report_count integer;
  v_solved_user_count integer;
  v_verification_weight numeric(10, 2);
  v_solved_weight numeric(10, 2);
  v_false_weight numeric(10, 2);
  v_effective_verification_weight numeric(10, 2);
  v_effective_solved_weight numeric(10, 2);
  v_first_solved_at timestamptz;
  v_last_solved_at timestamptz;
  v_last_verified_at timestamptz;
  v_last_opposing_activity_at timestamptz;
  v_first_reported_at timestamptz;
begin
  select
    ri.status,
    ri.reporter_count,
    ri.first_reported_at
  into
    v_current_status,
    v_reporter_count,
    v_first_reported_at
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  select
    count(*)::integer,
    coalesce(sum(iuv.reputation_weight), 0)::numeric(10, 2),
    max(iuv.verified_at)
  into
    v_verification_count,
    v_verification_weight,
    v_last_verified_at
  from public.issue_user_verifications as iuv
  where iuv.issue_id = p_issue_id;

  select
    count(*) filter (where ir.report_type = 'solved')::integer,
    count(distinct ir.user_id) filter (where ir.report_type = 'solved')::integer,
    count(*) filter (where ir.report_type = 'false_report')::integer,
    coalesce(
      sum(ir.reputation_weight) filter (where ir.report_type = 'solved'),
      0
    )::numeric(10, 2),
    coalesce(
      sum(ir.reputation_weight) filter (where ir.report_type = 'false_report'),
      0
    )::numeric(10, 2),
    min(ir.created_at) filter (where ir.report_type = 'solved'),
    max(ir.created_at) filter (where ir.report_type = 'solved')
  into
    v_solved_count,
    v_solved_user_count,
    v_false_report_count,
    v_solved_weight,
    v_false_weight,
    v_first_solved_at,
    v_last_solved_at
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.report_type in ('solved', 'false_report');

  select max(activity.activity_at)
  into v_last_opposing_activity_at
  from (
    select iuv.verified_at as activity_at
    from public.issue_user_verifications as iuv
    where iuv.issue_id = p_issue_id

    union all

    select ir.created_at as activity_at
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.report_type in ('created', 'verified', 'damage', 'false_report')

    union all

    select iur.last_reported_at as activity_at
    from public.issue_user_reports as iur
    where iur.issue_id = p_issue_id
      and iur.withdrawn_at is null
  ) as activity;

  v_effective_verification_weight := greatest(
    v_verification_weight - v_false_weight,
    0
  );
  v_effective_solved_weight := greatest(
    v_solved_weight - v_false_weight,
    0
  );

  v_next_status := case
    when v_reporter_count <= 0 then
      'disputed'::public.road_issue_status
    when v_false_weight >= 3.00
      and v_false_weight >= greatest(v_verification_weight, v_solved_weight)
      then 'disputed'::public.road_issue_status
    when v_effective_solved_weight >= 6.00
      and v_solved_user_count >= 2
      and v_last_solved_at is not null
      and now() - v_first_reported_at >= interval '24 hours'
      and coalesce(v_last_opposing_activity_at, v_last_solved_at) <= v_last_solved_at
      then 'solved'::public.road_issue_status
    when v_effective_solved_weight >= 3.00
      and v_last_solved_at is not null
      and coalesce(v_last_opposing_activity_at, v_last_solved_at) <= v_last_solved_at
      then 'likely_solved'::public.road_issue_status
    when v_effective_verification_weight >= 5.00 then
      'active'::public.road_issue_status
    when v_effective_verification_weight >= 2.00 then
      'verified'::public.road_issue_status
    when v_current_status = 'stale'
      and v_verification_count = 0
      and v_solved_count = 0
      and v_false_report_count = 0
      then 'stale'::public.road_issue_status
    else 'new'::public.road_issue_status
  end;

  update public.road_issues as ri
  set
    verification_count = v_verification_count,
    solved_count = v_solved_count,
    false_report_count = v_false_report_count,
    weighted_verification_score = v_effective_verification_weight,
    weighted_solved_score = v_effective_solved_weight,
    weighted_false_score = v_false_weight,
    first_solved_reported_at = v_first_solved_at,
    last_solved_reported_at = v_last_solved_at,
    last_verified_at = v_last_verified_at,
    last_activity_at = v_last_opposing_activity_at,
    status = v_next_status,
    solved_at = case
      when v_next_status = 'solved' and ri.status is distinct from 'solved'
        then now()
      when v_next_status = 'solved'
        then coalesce(ri.solved_at, now())
      else null
    end,
    updated_at = now()
  where ri.id = p_issue_id;

  return v_next_status;
end;
$$;

create or replace function public.apply_road_issue_status(p_issue_id uuid)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.refresh_road_issue_reputation_state(p_issue_id);
end;
$$;

create or replace function public.withdraw_issue_report(p_issue_id uuid)
returns table (
  issue_id uuid,
  reporter_count integer,
  status public.road_issue_status,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_created_by uuid;
  v_weighted_false_score numeric(10, 2);
  v_reporter_count integer;
  v_status public.road_issue_status;
  v_withdrawn_at timestamptz;
begin
  v_user_id := public.current_authenticated_user_id();

  select
    ri.created_by,
    ri.weighted_false_score
  into
    v_created_by,
    v_weighted_false_score
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  select iur.withdrawn_at
  into v_withdrawn_at
  from public.issue_user_reports as iur
  where iur.issue_id = p_issue_id
    and iur.user_id = v_user_id
  for update;

  if not found then
    raise exception 'no_issue_report_to_withdraw';
  end if;

  if v_withdrawn_at is not null then
    raise exception 'issue_report_already_withdrawn';
  end if;

  -- A withdrawal never deletes attribution. If negative consensus already
  -- reached the dispute threshold, escrow the original reporter penalty first.
  if v_user_id = v_created_by and v_weighted_false_score >= 3.00 then
    perform public.apply_false_issue_penalty(p_issue_id);
  end if;

  update public.issue_user_reports as iur
  set
    withdrawn_at = now(),
    last_reported_at = now()
  where iur.issue_id = p_issue_id
    and iur.user_id = v_user_id
    and iur.withdrawn_at is null;

  perform public.refresh_road_issue_reporter_aggregates(p_issue_id);
  v_status := public.refresh_road_issue_reputation_state(p_issue_id);

  select ri.reporter_count
  into v_reporter_count
  from public.road_issues as ri
  where ri.id = p_issue_id;

  return query
  select
    p_issue_id as issue_id,
    v_reporter_count as reporter_count,
    v_status as status,
    'Bildirimin geri çekildi.'::text as message;
end;
$$;

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
#variable_conflict use_column
declare
  v_user_id uuid;
  v_issue_geog extensions.geography(Point, 4326);
  v_user_geog extensions.geography(Point, 4326);
  v_previous_status public.road_issue_status;
  v_distance_meters numeric(10, 2);
  v_reputation_weight numeric(4, 2);
  v_report_id uuid;
  v_issue_status public.road_issue_status;
  v_reopened boolean := false;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.geog, ri.status
  into v_issue_geog, v_previous_status
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_user_reports as iur
    where iur.issue_id = p_issue_id
      and iur.user_id = v_user_id
      and iur.withdrawn_at is null
  ) then
    raise exception 'own_issue_report_exists';
  end if;

  if exists (
    select 1
    from public.issue_user_verifications as iuv
    where iuv.issue_id = p_issue_id
      and iuv.user_id = v_user_id
  ) then
    raise exception 'recent_verification_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  if not extensions.st_dwithin(v_issue_geog, v_user_geog, 500) then
    raise exception 'proximity_required';
  end if;

  v_distance_meters := round(
    extensions.st_distance(v_issue_geog, v_user_geog)::numeric,
    2
  );
  v_reputation_weight := public.get_user_reputation_weight(v_user_id);
  v_reopened := v_previous_status in ('likely_solved', 'solved');

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters,
    reputation_weight
  )
  values (
    p_issue_id,
    v_user_id,
    'verified',
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_reputation_weight
  )
  returning ir.id into v_report_id;

  insert into public.issue_user_verifications as iuv (
    issue_id,
    user_id,
    report_id,
    latitude,
    longitude,
    distance_to_issue_meters,
    reputation_weight
  )
  values (
    p_issue_id,
    v_user_id,
    v_report_id,
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_reputation_weight
  );

  update public.road_issues as ri
  set
    trust_score = ri.trust_score + v_reputation_weight,
    last_activity_at = now(),
    reopened_at = case when v_reopened then now() else ri.reopened_at end,
    reopened_count = case
      when v_reopened then ri.reopened_count + 1
      else ri.reopened_count
    end,
    updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.refresh_road_issue_reputation_state(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    case
      when v_reopened then 'Sorun yeniden aktif hale getirildi.'
      else 'Doğrulama kaydedildi.'
    end::text as message;
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
#variable_conflict use_column
declare
  v_user_id uuid;
  v_issue_geog extensions.geography(Point, 4326);
  v_user_geog extensions.geography(Point, 4326);
  v_distance_meters numeric(10, 2);
  v_reputation_weight numeric(4, 2);
  v_report_id uuid;
  v_opposite_report_id uuid;
  v_opposite_weight numeric(4, 2);
  v_issue_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.geog
  into v_issue_geog
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  select ir.id, ir.reputation_weight
  into v_report_id, v_reputation_weight
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'solved'
  limit 1;

  if v_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_report_id;

    update public.road_issues as ri
    set
      trust_score = greatest(ri.trust_score - v_reputation_weight, 0),
      updated_at = now()
    where ri.id = p_issue_id;

    v_issue_status := public.refresh_road_issue_reputation_state(p_issue_id);

    return query
    select
      p_issue_id as issue_id,
      v_report_id as report_id,
      v_issue_status as status,
      null::numeric as distance_to_issue_meters,
      'Çözüldü bildirimi geri çekildi.'::text as message;
    return;
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  if not extensions.st_dwithin(v_issue_geog, v_user_geog, 500) then
    raise exception 'proximity_required';
  end if;

  v_distance_meters := round(
    extensions.st_distance(v_issue_geog, v_user_geog)::numeric,
    2
  );
  v_reputation_weight := public.get_user_reputation_weight(v_user_id);

  select ir.id, ir.reputation_weight
  into v_opposite_report_id, v_opposite_weight
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'false_report'
  limit 1;

  if v_opposite_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_opposite_report_id;
  end if;

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters,
    reputation_weight
  )
  values (
    p_issue_id,
    v_user_id,
    'solved',
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_reputation_weight
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set
    trust_score = greatest(
      ri.trust_score
        + v_reputation_weight
        + coalesce(v_opposite_weight, 0),
      0
    ),
    updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.refresh_road_issue_reputation_state(p_issue_id);

  if v_issue_status = 'solved' then
    perform public.confirm_score_event(
      concat('issue_solved_reported_by_user:', p_issue_id, ':', v_user_id),
      'issue_reached_solved'
    );
  end if;

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    case
      when v_issue_status = 'likely_solved'
        then 'Çözüldü bildirimi alındı. Sorun çözülmüş olabilir.'
      when v_issue_status = 'solved'
        then 'Çözüldü bildirimi alındı.'
      else 'Çözüldü bildirimi alındı.'
    end::text as message;
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
#variable_conflict use_column
declare
  v_user_id uuid;
  v_issue_geog extensions.geography(Point, 4326);
  v_user_geog extensions.geography(Point, 4326);
  v_previous_status public.road_issue_status;
  v_distance_meters numeric(10, 2);
  v_reputation_weight numeric(4, 2);
  v_report_id uuid;
  v_opposite_report_id uuid;
  v_opposite_weight numeric(4, 2);
  v_issue_status public.road_issue_status;
  v_reopened boolean := false;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.geog, ri.status
  into v_issue_geog, v_previous_status
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  select ir.id, ir.reputation_weight
  into v_report_id, v_reputation_weight
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'false_report'
  limit 1;

  if v_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_report_id;

    update public.road_issues as ri
    set
      trust_score = ri.trust_score + v_reputation_weight,
      updated_at = now()
    where ri.id = p_issue_id;

    v_issue_status := public.refresh_road_issue_reputation_state(p_issue_id);

    return query
    select
      p_issue_id as issue_id,
      v_report_id as report_id,
      v_issue_status as status,
      null::numeric as distance_to_issue_meters,
      'Yanlış bildirim geri bildirimi geri çekildi.'::text as message;
    return;
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  if not extensions.st_dwithin(v_issue_geog, v_user_geog, 500) then
    raise exception 'proximity_required';
  end if;

  v_distance_meters := round(
    extensions.st_distance(v_issue_geog, v_user_geog)::numeric,
    2
  );
  v_reputation_weight := public.get_user_reputation_weight(v_user_id);
  v_reopened := v_previous_status in ('likely_solved', 'solved');

  select ir.id, ir.reputation_weight
  into v_opposite_report_id, v_opposite_weight
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'solved'
  limit 1;

  if v_opposite_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_opposite_report_id;
  end if;

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters,
    reputation_weight
  )
  values (
    p_issue_id,
    v_user_id,
    'false_report',
    p_latitude,
    p_longitude,
    v_distance_meters,
    v_reputation_weight
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set
    trust_score = greatest(
      ri.trust_score
        - v_reputation_weight
        - coalesce(v_opposite_weight, 0),
      0
    ),
    last_activity_at = now(),
    reopened_at = case when v_reopened then now() else ri.reopened_at end,
    reopened_count = case
      when v_reopened then ri.reopened_count + 1
      else ri.reopened_count
    end,
    updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.refresh_road_issue_reputation_state(p_issue_id);

  if v_issue_status = 'disputed' then
    perform public.apply_false_issue_penalty(p_issue_id);
  end if;

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    'Yanlış bildirim geri bildirimi alındı.'::text as message;
end;
$$;

create or replace function public.score_issue_user_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

create or replace function public.score_issue_verification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter record;
begin
  if not exists (
    select 1
    from public.issue_user_reports as iur
    where iur.issue_id = new.issue_id
      and iur.user_id = new.user_id
      and iur.withdrawn_at is null
  ) then
    perform public.award_score_event(
      new.user_id,
      new.issue_id,
      null,
      'issue_verified_by_user',
      5,
      'confirmed',
      'independent_verification',
      concat('issue_verified_by_user:', new.issue_id, ':', new.user_id)
    );
  end if;

  for v_reporter in
    select iur.user_id
    from public.issue_user_reports as iur
    where iur.issue_id = new.issue_id
      and iur.withdrawn_at is null
      and iur.user_id <> new.user_id
  loop
    perform public.confirm_score_event(
      concat('issue_report_created:', new.issue_id, ':', v_reporter.user_id),
      'first_independent_verification'
    );
  end loop;

  return new;
end;
$$;

create or replace function public.score_issue_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.report_type = 'solved' then
    perform public.award_score_event(
      new.user_id,
      new.issue_id,
      null,
      'issue_solved_reported_by_user',
      15,
      'pending',
      'solved_consensus_escrow',
      concat('issue_solved_reported_by_user:', new.issue_id, ':', new.user_id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.score_issue_report_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.report_type = 'solved' then
    perform public.reverse_score_event(
      concat('issue_solved_reported_by_user:', old.issue_id, ':', old.user_id),
      'solved_signal_withdrawn'
    );
  end if;

  return old;
end;
$$;

create or replace function public.score_road_issue_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter record;
  v_solver record;
begin
  if old.status = 'solved' and new.status is distinct from 'solved' then
    for v_solver in
      select distinct ir.user_id
      from public.issue_reports as ir
      where ir.issue_id = new.id
        and ir.report_type = 'solved'
    loop
      perform public.reverse_score_event(
        concat('issue_solved_reported_by_user:', new.id, ':', v_solver.user_id),
        'issue_left_solved_state'
      );
    end loop;

  end if;

  if new.status = 'solved' and old.status is distinct from 'solved' then
    for v_solver in
      select distinct ir.user_id
      from public.issue_reports as ir
      where ir.issue_id = new.id
        and ir.report_type = 'solved'
    loop
      perform public.confirm_score_event(
        concat('issue_solved_reported_by_user:', new.id, ':', v_solver.user_id),
        'issue_reached_solved'
      );
    end loop;

  end if;

  if new.status = 'disputed' and old.status is distinct from 'disputed' then
    for v_reporter in
      select iur.user_id
      from public.issue_user_reports as iur
      where iur.issue_id = new.id
    loop
      perform public.reverse_score_event(
        concat('issue_report_created:', new.id, ':', v_reporter.user_id),
        'issue_became_disputed'
      );
    end loop;

    if new.weighted_false_score >= 3.00 then
      perform public.apply_false_issue_penalty(new.id);
    end if;
  end if;

  return new;
end;
$$;

do $$
declare
  v_issue record;
begin
  for v_issue in
    select ri.id
    from public.road_issues as ri
    order by ri.id
  loop
    perform public.refresh_road_issue_reputation_state(v_issue.id);
  end loop;
end;
$$;

do $$
declare
  v_issue record;
  v_user record;
begin
  for v_issue in
    select ri.id
    from public.road_issues as ri
    where ri.status = 'disputed'
      and ri.weighted_false_score >= 3.00
  loop
    perform public.apply_false_issue_penalty(v_issue.id);
  end loop;

  for v_user in
    select distinct se.user_id
    from public.user_score_events as se
  loop
    perform public.refresh_user_score_totals(v_user.user_id);
  end loop;
end;
$$;

revoke all on function public.reputation_weight_for_points(integer)
  from public, anon, authenticated;
revoke all on function public.get_user_reputation_weight(uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_user_score_totals(uuid)
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
revoke all on function public.apply_false_issue_penalty(uuid)
  from public, anon, authenticated;
revoke all on function public.validate_issue_action_proximity(
  extensions.geography,
  double precision,
  double precision,
  numeric
) from public, anon, authenticated;
revoke all on function public.refresh_road_issue_reputation_state(uuid)
  from public, anon, authenticated;
revoke all on function public.apply_road_issue_status(uuid)
  from public, anon, authenticated;
revoke all on function public.score_road_issue_status_update()
  from public, anon, authenticated;
revoke all on function public.score_issue_user_report_insert()
  from public, anon, authenticated;
revoke all on function public.score_issue_verification_insert()
  from public, anon, authenticated;
revoke all on function public.score_issue_report_insert()
  from public, anon, authenticated;
revoke all on function public.score_issue_report_delete()
  from public, anon, authenticated;

revoke all on function public.withdraw_issue_report(uuid)
  from public, anon, authenticated;

revoke all on function public.verify_issue(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;
revoke all on function public.report_solved(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;
revoke all on function public.report_false_issue(
  uuid,
  double precision,
  double precision
) from public, anon, authenticated;

grant execute on function public.verify_issue(
  uuid,
  double precision,
  double precision
) to authenticated;
grant execute on function public.withdraw_issue_report(uuid)
  to authenticated;
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
