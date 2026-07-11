alter table public.road_issues
  add column if not exists solved_at timestamptz,
  add column if not exists first_solved_reported_at timestamptz,
  add column if not exists last_solved_reported_at timestamptz,
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_count integer not null default 0 check (reopened_count >= 0),
  add column if not exists last_activity_at timestamptz;

create index if not exists road_issues_status_category_solved_idx
  on public.road_issues (status, category, last_solved_reported_at desc, solved_at desc);

create index if not exists road_issues_last_activity_idx
  on public.road_issues (last_activity_at desc);

update public.road_issues as ri
set
  last_activity_at = coalesce(ri.last_activity_at, ri.last_verified_at, ri.updated_at, ri.created_at),
  first_solved_reported_at = case
    when ri.solved_count > 0 then coalesce(ri.first_solved_reported_at, ri.updated_at, ri.created_at)
    else ri.first_solved_reported_at
  end,
  last_solved_reported_at = case
    when ri.solved_count > 0 then coalesce(ri.last_solved_reported_at, ri.updated_at, ri.created_at)
    else ri.last_solved_reported_at
  end,
  solved_at = case
    when ri.solved_count >= 2 and ri.status = 'solved' then coalesce(ri.solved_at, ri.updated_at, ri.created_at)
    else ri.solved_at
  end;

create or replace function public.reopen_road_issue_for_active_signal(
  p_issue_id uuid,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reopened boolean := false;
  v_row_count integer := 0;
begin
  update public.road_issues as ri
  set status = case
        when ri.verification_count >= 5 then 'active'::public.road_issue_status
        when ri.verification_count >= 2 then 'verified'::public.road_issue_status
        else 'active'::public.road_issue_status
      end,
      reopened_at = now(),
      reopened_count = ri.reopened_count + 1,
      last_activity_at = now(),
      updated_at = now()
  where ri.id = p_issue_id
    and ri.status in ('likely_solved', 'solved')
    and (
      p_force
      or (
        ri.status = 'likely_solved'
        and coalesce(ri.last_solved_reported_at, ri.updated_at, ri.created_at) >= now() - interval '14 days'
      )
      or (
        ri.status = 'solved'
        and coalesce(ri.solved_at, ri.last_solved_reported_at, ri.updated_at, ri.created_at) >= now() - interval '7 days'
      )
    );

  get diagnostics v_row_count = row_count;
  v_reopened := v_row_count > 0;

  return v_reopened;
end;
$$;

create or replace function public.apply_road_issue_status(p_issue_id uuid)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_status public.road_issue_status;
begin
  select
    case
      when ri.reporter_count = 0 then 'disputed'::public.road_issue_status
      when ri.false_report_count >= ri.verification_count and ri.false_report_count >= 3 then 'disputed'::public.road_issue_status
      when ri.status in ('active', 'verified')
        and ri.last_solved_reported_at is not null
        and coalesce(ri.last_activity_at, ri.created_at) > ri.last_solved_reported_at
        then ri.status
      when ri.solved_count >= 2
        and coalesce(ri.last_activity_at, ri.created_at) <= coalesce(ri.last_solved_reported_at, ri.created_at)
        then 'solved'::public.road_issue_status
      when ri.solved_count >= 1
        and coalesce(ri.last_activity_at, ri.created_at) <= coalesce(ri.last_solved_reported_at, ri.created_at)
        then 'likely_solved'::public.road_issue_status
      when ri.verification_count >= 5 then 'active'::public.road_issue_status
      when ri.verification_count >= 2 then 'verified'::public.road_issue_status
      else 'new'::public.road_issue_status
    end
  into v_next_status
  from public.road_issues as ri
  where ri.id = p_issue_id;

  if v_next_status is null then
    raise exception 'issue_not_found';
  end if;

  update public.road_issues as ri
  set status = v_next_status,
      solved_at = case
        when v_next_status = 'solved' then coalesce(ri.solved_at, now())
        else ri.solved_at
      end,
      updated_at = now()
  where ri.id = p_issue_id;

  return v_next_status;
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
  v_distance_meters numeric(10, 2);
  v_report_id uuid;
  v_issue_status public.road_issue_status;
  v_reopened boolean := false;
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
    'verified',
    p_latitude,
    p_longitude,
    v_distance_meters
  )
  returning ir.id into v_report_id;

  insert into public.issue_user_verifications as iuv (
    issue_id,
    user_id,
    report_id,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    v_report_id,
    p_latitude,
    p_longitude,
    v_distance_meters
  );

  perform public.refresh_road_issue_verification_aggregates(p_issue_id);
  v_reopened := public.reopen_road_issue_for_active_signal(p_issue_id, true);

  update public.road_issues as ri
  set trust_score = ri.trust_score + 1,
      last_activity_at = now(),
      updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

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
#variable_conflict use_column
declare
  v_user_id uuid;
  v_issue_geog extensions.geography(Point, 4326);
  v_user_geog extensions.geography(Point, 4326);
  v_distance_meters numeric(10, 2);
  v_report_id uuid;
  v_issue_status public.road_issue_status;
  v_reopened boolean := false;
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
  v_distance_meters := round(extensions.st_distance(v_issue_geog, v_user_geog)::numeric, 2);

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
    v_distance_meters
  )
  returning ir.id into v_report_id;

  v_reopened := public.reopen_road_issue_for_active_signal(p_issue_id, true);

  update public.road_issues as ri
  set damage_count = ri.damage_count + 1,
      trust_score = ri.trust_score + 0.5,
      last_activity_at = now(),
      updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    case
      when v_reopened then 'Sorun yeniden aktif hale getirildi.'
      else 'Araç hasarı bildirimi kaydedildi.'
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
        trust_score = greatest(ri.trust_score - 0.5, 0),
        last_solved_reported_at = (
          select max(ir.created_at)
          from public.issue_reports as ir
          where ir.issue_id = p_issue_id
            and ir.report_type = 'solved'
        ),
        first_solved_reported_at = (
          select min(ir.created_at)
          from public.issue_reports as ir
          where ir.issue_id = p_issue_id
            and ir.report_type = 'solved'
        ),
        solved_at = case when ri.solved_count - 1 >= 2 then ri.solved_at else null end,
        updated_at = now()
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
      first_solved_reported_at = coalesce(ri.first_solved_reported_at, now()),
      last_solved_reported_at = now(),
      trust_score = ri.trust_score + 0.5,
      updated_at = now()
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    case
      when v_issue_status = 'likely_solved' then 'Çözüldü bildirimi alındı. Sorun çözülmüş olabilir.'
      when v_issue_status = 'solved' then 'Çözüldü bildirimi alındı.'
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
        trust_score = ri.trust_score + 1,
        updated_at = now()
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
      trust_score = greatest(ri.trust_score - 1, 0),
      updated_at = now()
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

create or replace function public.create_issue_or_merge_duplicate(
  p_latitude double precision,
  p_longitude double precision,
  p_category public.road_issue_category,
  p_severity public.road_issue_severity,
  p_has_photo boolean default false,
  p_has_damage boolean default false
)
returns table (
  issue_id uuid,
  merged boolean,
  report_accepted boolean,
  already_reported_by_user boolean,
  severity_updated boolean,
  damage_report_added boolean,
  latitude double precision,
  longitude double precision
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
  v_selected_geog extensions.geography(Point, 4326);
  v_existing_issue_id uuid;
  v_existing_issue_geog extensions.geography(Point, 4326);
  v_issue_latitude double precision;
  v_issue_longitude double precision;
  v_existing_user_severity public.road_issue_severity;
  v_existing_withdrawn_at timestamptz;
  v_new_issue_id uuid;
  v_report_id uuid;
  v_distance_meters numeric(10, 2);
  v_already_reported_by_user boolean;
  v_severity_updated boolean;
  v_damage_report_added boolean := false;
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

  select
    ri.id,
    ri.geog,
    ri.latitude,
    ri.longitude
  into
    v_existing_issue_id,
    v_existing_issue_geog,
    v_issue_latitude,
    v_issue_longitude
  from public.road_issues as ri
  where ri.category = p_category
    and extensions.st_dwithin(ri.geog, v_selected_geog, 50)
    and (
      ri.status in ('new', 'verified', 'active', 'stale')
      or (
        ri.status = 'likely_solved'
        and coalesce(ri.last_solved_reported_at, ri.updated_at, ri.created_at) >= now() - interval '14 days'
      )
      or (
        ri.status = 'solved'
        and coalesce(ri.solved_at, ri.last_solved_reported_at, ri.updated_at, ri.created_at) >= now() - interval '7 days'
      )
    )
  order by
    case
      when ri.status in ('new', 'verified', 'active', 'stale') then 0
      else 1
    end,
    extensions.st_distance(ri.geog, v_selected_geog),
    ri.reporter_count desc,
    ri.created_at asc
  limit 1
  for update;

  if v_existing_issue_id is not null then
    v_distance_meters := round(
      extensions.st_distance(v_existing_issue_geog, v_selected_geog)::numeric,
      2
    );

    perform public.reopen_road_issue_for_active_signal(v_existing_issue_id, false);

    select
      iur.severity,
      iur.withdrawn_at
    into
      v_existing_user_severity,
      v_existing_withdrawn_at
    from public.issue_user_reports as iur
    where iur.issue_id = v_existing_issue_id
      and iur.user_id = v_user_id
    for update;

    v_already_reported_by_user := found and v_existing_withdrawn_at is null;

    if found then
      v_severity_updated := v_existing_user_severity is distinct from p_severity;

      update public.issue_user_reports as iur
      set severity = p_severity,
          last_reported_at = now(),
          report_count = iur.report_count + 1,
          withdrawn_at = null
      where iur.issue_id = v_existing_issue_id
        and iur.user_id = v_user_id;

      if v_existing_withdrawn_at is not null then
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
          v_existing_issue_id,
          v_user_id,
          'created',
          p_latitude,
          p_longitude,
          v_distance_meters,
          coalesce(p_has_photo, false)
        )
        returning ir.id into v_report_id;
      end if;

      if coalesce(p_has_damage, false) and not exists (
        select 1
        from public.issue_reports as ir
        where ir.issue_id = v_existing_issue_id
          and ir.user_id = v_user_id
          and ir.report_type = 'damage'
      ) then
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
          v_existing_issue_id,
          v_user_id,
          'damage',
          p_latitude,
          p_longitude,
          v_distance_meters,
          false
        );

        update public.road_issues as ri
        set damage_count = ri.damage_count + 1,
            trust_score = ri.trust_score + 0.5
        where ri.id = v_existing_issue_id;

        v_damage_report_added := true;
      end if;

      update public.road_issues as ri
      set last_activity_at = now(),
          updated_at = now()
      where ri.id = v_existing_issue_id;

      perform public.refresh_road_issue_reporter_aggregates(v_existing_issue_id);
      perform public.apply_road_issue_status(v_existing_issue_id);

      return query
      select
        v_existing_issue_id as issue_id,
        true as merged,
        v_existing_withdrawn_at is not null as report_accepted,
        v_already_reported_by_user as already_reported_by_user,
        v_severity_updated as severity_updated,
        v_damage_report_added as damage_report_added,
        v_issue_latitude as latitude,
        v_issue_longitude as longitude;

      return;
    end if;

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
      v_existing_issue_id,
      v_user_id,
      'created',
      p_latitude,
      p_longitude,
      v_distance_meters,
      coalesce(p_has_photo, false)
    )
    returning ir.id into v_report_id;

    insert into public.issue_user_reports as iur (
      issue_id,
      user_id,
      severity,
      first_reported_at,
      last_reported_at,
      report_count,
      withdrawn_at
    )
    values (
      v_existing_issue_id,
      v_user_id,
      p_severity,
      now(),
      now(),
      1,
      null
    );

    if coalesce(p_has_damage, false) then
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
        v_existing_issue_id,
        v_user_id,
        'damage',
        p_latitude,
        p_longitude,
        v_distance_meters,
        false
      );

      update public.road_issues as ri
      set damage_count = ri.damage_count + 1,
          trust_score = ri.trust_score + 0.5
      where ri.id = v_existing_issue_id;

      v_damage_report_added := true;
    end if;

    update public.road_issues as ri
    set trust_score = ri.trust_score + 1,
        last_activity_at = now(),
        updated_at = now()
    where ri.id = v_existing_issue_id;

    perform public.refresh_road_issue_reporter_aggregates(v_existing_issue_id);
    perform public.apply_road_issue_status(v_existing_issue_id);

    return query
    select
      v_existing_issue_id as issue_id,
      true as merged,
      true as report_accepted,
      false as already_reported_by_user,
      false as severity_updated,
      v_damage_report_added as damage_report_added,
      v_issue_latitude as latitude,
      v_issue_longitude as longitude;

    return;
  end if;

  insert into public.road_issues as ri (
    latitude,
    longitude,
    category,
    severity,
    status,
    reporter_count,
    verification_count,
    severity_score_avg,
    trust_score,
    last_activity_at,
    created_by
  )
  values (
    p_latitude,
    p_longitude,
    p_category,
    p_severity,
    'new',
    0,
    0,
    0,
    1,
    now(),
    v_user_id
  )
  returning ri.id, ri.latitude, ri.longitude
  into v_new_issue_id, v_issue_latitude, v_issue_longitude;

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

  insert into public.issue_user_reports as iur (
    issue_id,
    user_id,
    severity,
    first_reported_at,
    last_reported_at,
    report_count,
    withdrawn_at
  )
  values (
    v_new_issue_id,
    v_user_id,
    p_severity,
    now(),
    now(),
    1,
    null
  );

  if coalesce(p_has_damage, false) then
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
      'damage',
      p_latitude,
      p_longitude,
      0,
      false
    );

    update public.road_issues as ri
    set damage_count = ri.damage_count + 1,
        trust_score = ri.trust_score + 0.5
    where ri.id = v_new_issue_id;

    v_damage_report_added := true;
  end if;

  perform public.refresh_road_issue_reporter_aggregates(v_new_issue_id);
  perform public.apply_road_issue_status(v_new_issue_id);

  return query
  select
    v_new_issue_id as issue_id,
    false as merged,
    true as report_accepted,
    false as already_reported_by_user,
    false as severity_updated,
    v_damage_report_added as damage_report_added,
    v_issue_latitude as latitude,
    v_issue_longitude as longitude;
end;
$$;

revoke all on function public.reopen_road_issue_for_active_signal(uuid, boolean) from public, anon, authenticated;
revoke all on function public.apply_road_issue_status(uuid) from public, anon, authenticated;
revoke all on function public.verify_issue(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_damage(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_solved(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_false_issue(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean,
  boolean
) from public, anon, authenticated;

grant execute on function public.verify_issue(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_damage(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_solved(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_false_issue(uuid, double precision, double precision) to authenticated;
grant execute on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';
