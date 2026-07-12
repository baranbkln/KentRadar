create or replace function public.get_public_issues_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom integer,
  p_category_filter text,
  p_status_filter text
)
returns table (
  id uuid,
  latitude double precision,
  longitude double precision,
  city text,
  district text,
  neighborhood text,
  location_label text,
  category public.road_issue_category,
  severity public.road_issue_severity,
  status public.road_issue_status,
  first_reported_at timestamptz,
  last_verified_at timestamptz,
  verification_count integer,
  damage_count integer,
  solved_count integer,
  false_report_count integer,
  reporter_count integer,
  watcher_count integer,
  severity_score_avg numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_envelope extensions.geography;
  v_category_filters text[];
  v_status_filters text[];
begin
  if p_min_lat is null
    or p_max_lat is null
    or p_min_lat < -90
    or p_max_lat > 90
    or p_min_lat >= p_max_lat
  then
    raise exception 'invalid_latitude_bounds' using errcode = '22023';
  end if;

  if p_min_lng is null
    or p_max_lng is null
    or p_min_lng < -180
    or p_max_lng > 180
    or p_min_lng >= p_max_lng
  then
    raise exception 'invalid_longitude_bounds' using errcode = '22023';
  end if;

  if p_zoom is null or p_zoom < 0 or p_zoom > 22 then
    raise exception 'invalid_map_zoom' using errcode = '22023';
  end if;

  v_envelope := extensions.st_makeenvelope(
    p_min_lng,
    p_min_lat,
    p_max_lng,
    p_max_lat,
    4326
  )::extensions.geography;

  v_category_filters := case
    when nullif(btrim(p_category_filter), '') is null
      or lower(btrim(p_category_filter)) = 'all'
      then null
    else regexp_split_to_array(p_category_filter, '\s*,\s*')
  end;

  v_status_filters := case
    when nullif(btrim(p_status_filter), '') is null
      or lower(btrim(p_status_filter)) = 'all'
      then null
    else regexp_split_to_array(p_status_filter, '\s*,\s*')
  end;

  return query
  select
    ri.id,
    ri.latitude,
    ri.longitude,
    ri.city,
    ri.district,
    ri.neighborhood,
    ri.location_label,
    ri.category,
    ri.severity,
    ri.status,
    ri.first_reported_at,
    ri.last_verified_at,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    ri.false_report_count,
    ri.reporter_count,
    (
      select count(*)::integer
      from public.issue_watchers as iw
      where iw.issue_id = ri.id
    ) as watcher_count,
    ri.severity_score_avg,
    ri.created_at,
    ri.updated_at
  from public.road_issues as ri
  where ri.reporter_count > 0
    and ri.latitude > p_min_lat
    and ri.latitude < p_max_lat
    and ri.longitude > p_min_lng
    and ri.longitude < p_max_lng
    and extensions.st_intersects(ri.geog, v_envelope)
    and (
      v_category_filters is null
      or ri.category::text = any(v_category_filters)
    )
    and (
      v_status_filters is null
      or ri.status::text = any(v_status_filters)
    )
  order by
    ri.last_verified_at desc nulls last,
    ri.created_at desc,
    ri.id;
end;
$$;

revoke all on function public.get_public_issues_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.get_public_issues_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
