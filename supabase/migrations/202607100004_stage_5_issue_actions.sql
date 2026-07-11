create table if not exists public.issue_user_verifications (
  issue_id uuid not null references public.road_issues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  report_id uuid references public.issue_reports (id) on delete set null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  distance_to_issue_meters numeric(10, 2) not null check (distance_to_issue_meters >= 0),
  verified_at timestamptz not null default now(),
  primary key (issue_id, user_id)
);

create index if not exists issue_user_verifications_user_verified_at_idx
  on public.issue_user_verifications (user_id, verified_at desc);

alter table public.issue_user_verifications enable row level security;

drop policy if exists "Users can read their own issue verifications"
on public.issue_user_verifications;

create policy "Users can read their own issue verifications"
on public.issue_user_verifications
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.issue_user_verifications from anon, authenticated;
grant select on public.issue_user_verifications to authenticated;

create or replace function public.refresh_road_issue_reporter_aggregates(
  p_issue_id uuid
)
returns public.road_issue_severity
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_count integer;
  v_average_score numeric(4, 2);
  v_aggregated_severity public.road_issue_severity;
begin
  select
    count(*)::integer,
    round(avg(public.road_issue_severity_score(iur.severity))::numeric, 2)
  into
    v_reporter_count,
    v_average_score
  from public.issue_user_reports as iur
  where iur.issue_id = p_issue_id;

  if v_reporter_count = 0 then
    select ri.severity
    into v_aggregated_severity
    from public.road_issues as ri
    where ri.id = p_issue_id;

    if v_aggregated_severity is null then
      raise exception 'issue_not_found';
    end if;

    v_average_score := public.road_issue_severity_score(v_aggregated_severity);
  else
    v_aggregated_severity := public.road_issue_severity_from_score(v_average_score);
  end if;

  update public.road_issues as ri
  set severity = v_aggregated_severity,
      severity_score_avg = v_average_score,
      reporter_count = v_reporter_count
  where ri.id = p_issue_id;

  return v_aggregated_severity;
end;
$$;

create or replace function public.refresh_road_issue_verification_aggregates(
  p_issue_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_verification_count integer;
  v_last_verified_at timestamptz;
begin
  select
    count(*)::integer,
    max(iuv.verified_at)
  into
    v_verification_count,
    v_last_verified_at
  from public.issue_user_verifications as iuv
  where iuv.issue_id = p_issue_id;

  update public.road_issues as ri
  set verification_count = v_verification_count,
      last_verified_at = v_last_verified_at
  where ri.id = p_issue_id;

  return v_verification_count;
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

  if v_distance_meters > 150 then
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

  update public.road_issues as ri
  set trust_score = ri.trust_score + 1
  where ri.id = p_issue_id;

  v_issue_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id as issue_id,
    v_report_id as report_id,
    v_issue_status as status,
    v_distance_meters as distance_to_issue_meters,
    'Doğrulama kaydedildi.'::text as message;
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
  merged boolean,
  report_accepted boolean,
  already_reported_by_user boolean,
  severity_updated boolean,
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
  v_new_issue_id uuid;
  v_report_id uuid;
  v_distance_meters numeric(10, 2);
  v_already_reported_by_user boolean;
  v_severity_updated boolean;
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
    and ri.status in ('new', 'verified', 'active', 'stale')
    and extensions.st_dwithin(ri.geog, v_selected_geog, 50)
  order by
    extensions.st_distance(ri.geog, v_selected_geog),
    ri.reporter_count desc,
    ri.created_at asc
  limit 1
  for update;

  if v_existing_issue_id is not null then
    select iur.severity
    into v_existing_user_severity
    from public.issue_user_reports as iur
    where iur.issue_id = v_existing_issue_id
      and iur.user_id = v_user_id
    for update;

    v_already_reported_by_user := found;

    if v_already_reported_by_user then
      v_severity_updated := v_existing_user_severity is distinct from p_severity;

      update public.issue_user_reports as iur
      set severity = p_severity,
          last_reported_at = now(),
          report_count = iur.report_count + 1
      where iur.issue_id = v_existing_issue_id
        and iur.user_id = v_user_id;

      perform public.refresh_road_issue_reporter_aggregates(v_existing_issue_id);
      perform public.apply_road_issue_status(v_existing_issue_id);

      return query
      select
        v_existing_issue_id as issue_id,
        true as merged,
        false as report_accepted,
        true as already_reported_by_user,
        v_severity_updated as severity_updated,
        v_issue_latitude as latitude,
        v_issue_longitude as longitude;

      return;
    end if;

    v_distance_meters := round(
      extensions.st_distance(v_existing_issue_geog, v_selected_geog)::numeric,
      2
    );

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
      report_count
    )
    values (
      v_existing_issue_id,
      v_user_id,
      p_severity,
      now(),
      now(),
      1
    );

    update public.road_issues as ri
    set trust_score = ri.trust_score + 1
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
    report_count
  )
  values (
    v_new_issue_id,
    v_user_id,
    p_severity,
    now(),
    now(),
    1
  );

  perform public.refresh_road_issue_reporter_aggregates(v_new_issue_id);
  perform public.apply_road_issue_status(v_new_issue_id);

  return query
  select
    v_new_issue_id as issue_id,
    false as merged,
    true as report_accepted,
    false as already_reported_by_user,
    false as severity_updated,
    v_issue_latitude as latitude,
    v_issue_longitude as longitude;
end;
$$;

update public.road_issues as ri
set verification_count = counts.verification_count,
    last_verified_at = counts.last_verified_at
from (
  select
    issue_ids.id,
    count(iuv.user_id)::integer as verification_count,
    max(iuv.verified_at) as last_verified_at
  from public.road_issues as issue_ids
  left join public.issue_user_verifications as iuv
    on iuv.issue_id = issue_ids.id
  group by issue_ids.id
) as counts
where ri.id = counts.id;

revoke all on function public.refresh_road_issue_verification_aggregates(
  uuid
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
  boolean
) to authenticated;

notify pgrst, 'reload schema';
