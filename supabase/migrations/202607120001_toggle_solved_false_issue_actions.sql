drop function if exists public.get_issue_user_state(uuid);

create or replace function public.get_issue_user_state(p_issue_id uuid)
returns table (
  issue_id uuid,
  has_active_report boolean,
  has_withdrawn_report boolean,
  has_damage_report boolean,
  has_verified boolean,
  has_solved_report boolean,
  has_false_report boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();

  return query
  select
    p_issue_id as issue_id,
    exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = p_issue_id
        and iur.user_id = v_user_id
        and iur.withdrawn_at is null
    ) as has_active_report,
    exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = p_issue_id
        and iur.user_id = v_user_id
        and iur.withdrawn_at is not null
    ) as has_withdrawn_report,
    exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = p_issue_id
        and ir.user_id = v_user_id
        and ir.report_type = 'damage'
    ) as has_damage_report,
    exists (
      select 1
      from public.issue_user_verifications as iuv
      where iuv.issue_id = p_issue_id
        and iuv.user_id = v_user_id
    ) as has_verified,
    exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = p_issue_id
        and ir.user_id = v_user_id
        and ir.report_type = 'solved'
    ) as has_solved_report,
    exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = p_issue_id
        and ir.user_id = v_user_id
        and ir.report_type = 'false_report'
    ) as has_false_report;
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
  v_report_id uuid;
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

  select ir.id
  into v_report_id
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'solved'
  limit 1;

  if v_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_report_id;

    update public.road_issues as ri
    set solved_count = greatest(ri.solved_count - 1, 0),
        trust_score = greatest(ri.trust_score - 0.5, 0)
    where ri.id = p_issue_id;

    v_issue_status := public.apply_road_issue_status(p_issue_id);

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
  v_distance_meters := round(extensions.st_distance(v_issue_geog, v_user_geog)::numeric, 2);

  if v_distance_meters > 500 then
    raise exception 'proximity_required';
  end if;

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'solved',
    p_latitude,
    p_longitude,
    v_distance_meters
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set solved_count = ri.solved_count + 1,
      trust_score = ri.trust_score + 0.5
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    'Çözüldü bildirimi alındı.'::text as message;
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
  v_distance_meters numeric(10, 2);
  v_report_id uuid;
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

  select ir.id
  into v_report_id
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.user_id = v_user_id
    and ir.report_type = 'false_report'
  limit 1;

  if v_report_id is not null then
    delete from public.issue_reports as ir
    where ir.id = v_report_id;

    update public.road_issues as ri
    set false_report_count = greatest(ri.false_report_count - 1, 0),
        trust_score = ri.trust_score + 1
    where ri.id = p_issue_id;

    v_issue_status := public.apply_road_issue_status(p_issue_id);

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
  v_distance_meters := round(extensions.st_distance(v_issue_geog, v_user_geog)::numeric, 2);

  if v_distance_meters > 500 then
    raise exception 'proximity_required';
  end if;

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'false_report',
    p_latitude,
    p_longitude,
    v_distance_meters
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set false_report_count = ri.false_report_count + 1,
      trust_score = greatest(ri.trust_score - 1, 0)
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    'Yanlış bildirim geri bildirimi alındı.'::text as message;
end;
$$;

revoke all on function public.get_issue_user_state(uuid) from public, anon, authenticated;
revoke all on function public.report_solved(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_false_issue(uuid, double precision, double precision) from public, anon, authenticated;

grant execute on function public.get_issue_user_state(uuid) to authenticated;
grant execute on function public.report_solved(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_false_issue(uuid, double precision, double precision) to authenticated;
