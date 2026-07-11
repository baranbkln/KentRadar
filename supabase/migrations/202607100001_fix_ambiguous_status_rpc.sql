create or replace function public.apply_road_issue_status(p_issue_id uuid)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.road_issue_status;
begin
  update public.road_issues as ri
  set status = case
    when ri.false_report_count >= ri.verification_count and ri.false_report_count >= 3 then 'disputed'::public.road_issue_status
    when ri.solved_count >= 4 then 'solved'::public.road_issue_status
    when ri.solved_count >= 2 then 'likely_solved'::public.road_issue_status
    when ri.verification_count >= 5 then 'active'::public.road_issue_status
    when ri.verification_count >= 2 then 'verified'::public.road_issue_status
    else 'new'::public.road_issue_status
  end
  where ri.id = p_issue_id
  returning ri.status into v_status;

  return v_status;
end;
$$;

create or replace function public.create_issue_or_merge_duplicate(
  p_latitude double precision,
  p_longitude double precision,
  p_category public.road_issue_category,
  p_severity public.road_issue_severity,
  p_has_photo boolean default false
)
returns table (
  issue_id uuid,
  report_id uuid,
  merged boolean,
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
  v_selected_geog extensions.geography(Point, 4326);
  v_existing_issue public.road_issues%rowtype;
  v_new_issue_id uuid;
  v_report_id uuid;
  v_distance numeric(10, 2);
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  if p_category is null then
    raise exception 'category_required';
  end if;

  if p_severity is null then
    raise exception 'severity_required';
  end if;

  v_selected_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  select ri.*
  into v_existing_issue
  from public.road_issues as ri
  where ri.category = p_category
    and ri.status in ('new', 'verified', 'active', 'stale')
    and extensions.st_dwithin(ri.geog, v_selected_geog, 50)
  order by
    extensions.st_distance(ri.geog, v_selected_geog),
    ri.verification_count desc,
    ri.created_at asc
  limit 1
  for update;

  if found then
    if exists (
      select 1
      from public.issue_reports as ir
      where ir.issue_id = v_existing_issue.id
        and ir.user_id = v_user_id
        and ir.report_type in ('created', 'verified')
        and ir.created_at > now() - interval '24 hours'
    ) then
      raise exception 'recent_verification_exists';
    end if;

    v_distance := round(extensions.st_distance(v_existing_issue.geog, v_selected_geog)::numeric, 2);

    insert into public.issue_reports as ir (
      issue_id,
      user_id,
      report_type,
      latitude,
      longitude,
      distance_to_issue_meters,
      has_photo
    )
    values (
      v_existing_issue.id,
      v_user_id,
      'verified',
      p_latitude,
      p_longitude,
      v_distance,
      coalesce(p_has_photo, false)
    )
    returning ir.id into v_report_id;

    update public.road_issues as ri
    set verification_count = ri.verification_count + 1,
        last_verified_at = now(),
        trust_score = ri.trust_score + 1
    where ri.id = v_existing_issue.id;

    v_status := public.apply_road_issue_status(v_existing_issue.id);

    return query
    select
      v_existing_issue.id,
      v_report_id,
      true,
      v_status,
      v_distance,
      'Benzer bir yol sorunu burada zaten var. Bildirimin mevcut kayda eklendi.';

    return;
  end if;

  insert into public.road_issues as ri (
    latitude,
    longitude,
    category,
    severity,
    status,
    trust_score,
    created_by
  )
  values (
    p_latitude,
    p_longitude,
    p_category,
    p_severity,
    'new',
    1,
    v_user_id
  )
  returning ri.id, ri.status into v_new_issue_id, v_status;

  insert into public.issue_reports as ir (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters,
    has_photo
  )
  values (
    v_new_issue_id,
    v_user_id,
    'created',
    p_latitude,
    p_longitude,
    0,
    coalesce(p_has_photo, false)
  )
  returning ir.id into v_report_id;

  return query
  select
    v_new_issue_id,
    v_report_id,
    false,
    v_status,
    0::numeric,
    'Yol sorunu kaydedildi.';
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
declare
  v_user_id uuid;
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.*
  into v_issue
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
    raise exception 'proximity_required';
  end if;

  if exists (
    select 1
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.user_id = v_user_id
      and ir.report_type in ('created', 'verified')
      and ir.created_at > now() - interval '24 hours'
  ) then
    raise exception 'recent_verification_exists';
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
    'verified',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set verification_count = ri.verification_count + 1,
      last_verified_at = now(),
      trust_score = ri.trust_score + 1
  where ri.id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Doğrulama kaydedildi.';
end;
$$;

create or replace function public.report_damage(
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
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.*
  into v_issue
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.user_id = v_user_id
      and ir.report_type = 'damage'
  ) then
    raise exception 'damage_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

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
    'damage',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set damage_count = ri.damage_count + 1,
      trust_score = ri.trust_score + 0.5
  where ri.id = p_issue_id
  returning ri.status into v_status;

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Araç hasarı bildirimi kaydedildi.';
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
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.*
  into v_issue
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.user_id = v_user_id
      and ir.report_type = 'solved'
  ) then
    raise exception 'solved_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
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
    v_distance
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set solved_count = ri.solved_count + 1,
      trust_score = ri.trust_score + 0.5
  where ri.id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Çözülmüş olarak bildirildi.';
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
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select ri.*
  into v_issue
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.user_id = v_user_id
      and ir.report_type = 'false_report'
  ) then
    raise exception 'false_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
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
    v_distance
  )
  returning ir.id into v_report_id;

  update public.road_issues as ri
  set false_report_count = ri.false_report_count + 1,
      trust_score = greatest(ri.trust_score - 1, 0)
  where ri.id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Yanlış konum veya kayıt bildirimi kaydedildi.';
end;
$$;

grant execute on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean
) to authenticated;

grant execute on function public.verify_issue(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_damage(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_solved(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_false_issue(uuid, double precision, double precision) to authenticated;
