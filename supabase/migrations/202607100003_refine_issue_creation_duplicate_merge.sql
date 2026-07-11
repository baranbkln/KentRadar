alter table public.road_issues
  add column if not exists reporter_count integer not null default 0;

alter table public.road_issues
  add column if not exists severity_score_avg numeric(4, 2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'road_issues_reporter_count_nonnegative'
  ) then
    alter table public.road_issues
      add constraint road_issues_reporter_count_nonnegative
      check (reporter_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'road_issues_severity_score_avg_range'
  ) then
    alter table public.road_issues
      add constraint road_issues_severity_score_avg_range
      check (severity_score_avg >= 0 and severity_score_avg <= 3);
  end if;
end;
$$;

create table if not exists public.issue_user_reports (
  issue_id uuid not null references public.road_issues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  severity public.road_issue_severity not null,
  first_reported_at timestamptz not null default now(),
  last_reported_at timestamptz not null default now(),
  report_count integer not null default 1 check (report_count > 0),
  primary key (issue_id, user_id)
);

create index if not exists issue_user_reports_user_last_reported_idx
  on public.issue_user_reports (user_id, last_reported_at desc);

create index if not exists road_issues_reporter_count_idx
  on public.road_issues (reporter_count desc);

alter table public.issue_user_reports enable row level security;

drop policy if exists "Users can read their own issue user reports"
on public.issue_user_reports;

create policy "Users can read their own issue user reports"
on public.issue_user_reports
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.issue_user_reports from anon, authenticated;
grant select on public.issue_user_reports to authenticated;

create or replace function public.road_issue_severity_score(
  p_severity public.road_issue_severity
)
returns integer
language sql
immutable
as $$
  select case p_severity
    when 'low'::public.road_issue_severity then 1
    when 'medium'::public.road_issue_severity then 2
    when 'high'::public.road_issue_severity then 3
  end;
$$;

create or replace function public.road_issue_severity_from_score(
  p_score numeric
)
returns public.road_issue_severity
language sql
immutable
as $$
  select case
    when p_score < 1.5 then 'low'::public.road_issue_severity
    when p_score < 2.5 then 'medium'::public.road_issue_severity
    else 'high'::public.road_issue_severity
  end;
$$;

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
      reporter_count = v_reporter_count,
      verification_count = v_reporter_count
  where ri.id = p_issue_id;

  return v_aggregated_severity;
end;
$$;

insert into public.issue_user_reports (
  issue_id,
  user_id,
  severity,
  first_reported_at,
  last_reported_at,
  report_count
)
select
  ir.issue_id,
  ir.user_id,
  ri.severity,
  min(ir.created_at),
  max(ir.created_at),
  count(*)::integer
from public.issue_reports as ir
join public.road_issues as ri
  on ri.id = ir.issue_id
where ir.report_type in ('created', 'verified')
group by ir.issue_id, ir.user_id, ri.severity
on conflict (issue_id, user_id) do update
set severity = excluded.severity,
    first_reported_at = least(
      public.issue_user_reports.first_reported_at,
      excluded.first_reported_at
    ),
    last_reported_at = greatest(
      public.issue_user_reports.last_reported_at,
      excluded.last_reported_at
    ),
    report_count = greatest(
      public.issue_user_reports.report_count,
      excluded.report_count
    );

do $$
declare
  v_issue record;
begin
  for v_issue in
    select ri.id
    from public.road_issues as ri
  loop
    perform public.refresh_road_issue_reporter_aggregates(v_issue.id);
    perform public.apply_road_issue_status(v_issue.id);
  end loop;
end;
$$;

drop function if exists public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean
);

create function public.create_issue_or_merge_duplicate(
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
    ri.verification_count desc,
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
      'verified',
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
    set last_verified_at = now(),
        trust_score = ri.trust_score + 1
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

create or replace view public.road_issue_public_stats
with (security_invoker = true)
as
select
  ri.id,
  ri.latitude,
  ri.longitude,
  ri.category,
  ri.severity,
  ri.status,
  ri.first_reported_at,
  ri.last_verified_at,
  ri.verification_count,
  ri.damage_count,
  ri.solved_count,
  ri.false_report_count,
  ri.created_at,
  ri.updated_at,
  ri.reporter_count,
  ri.severity_score_avg
from public.road_issues as ri;

revoke all on function public.road_issue_severity_score(
  public.road_issue_severity
) from public, anon, authenticated;

revoke all on function public.road_issue_severity_from_score(
  numeric
) from public, anon, authenticated;

revoke all on function public.refresh_road_issue_reporter_aggregates(
  uuid
) from public, anon, authenticated;

grant execute on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean
) to authenticated;

grant select on public.road_issue_public_stats to anon, authenticated;

notify pgrst, 'reload schema';
