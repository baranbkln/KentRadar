drop function if exists public.get_public_issues_in_bbox(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  text,
  text
);

create function public.get_public_issues_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom integer,
  p_category_filter text,
  p_status_filter text
)
returns table (
  result_type text,
  id uuid,
  cluster_id text,
  cluster_count integer,
  cluster_min_latitude double precision,
  cluster_min_longitude double precision,
  cluster_max_latitude double precision,
  cluster_max_longitude double precision,
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
  v_grid_size_meters double precision;
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

  if p_zoom < 10 then
    v_grid_size_meters := case
      when p_zoom <= 4 then 300000
      when p_zoom = 5 then 150000
      when p_zoom = 6 then 80000
      when p_zoom = 7 then 40000
      when p_zoom = 8 then 20000
      else 10000
    end;

    return query
    with filtered_issues as materialized (
      select
        ri.id as issue_id,
        ri.latitude as issue_latitude,
        ri.longitude as issue_longitude,
        extensions.st_transform(ri.geog::extensions.geometry, 3857) as point_3857
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
    ),
    grid_members as (
      select
        fi.issue_id,
        fi.issue_latitude,
        fi.issue_longitude,
        floor(extensions.st_x(fi.point_3857) / v_grid_size_meters)::bigint as grid_x,
        floor(extensions.st_y(fi.point_3857) / v_grid_size_meters)::bigint as grid_y
      from filtered_issues as fi
    ),
    grid_clusters as (
      select
        gm.grid_x,
        gm.grid_y,
        count(*)::integer as issue_count,
        avg(gm.issue_latitude)::double precision as center_latitude,
        avg(gm.issue_longitude)::double precision as center_longitude,
        min(gm.issue_latitude)::double precision as min_latitude,
        min(gm.issue_longitude)::double precision as min_longitude,
        max(gm.issue_latitude)::double precision as max_latitude,
        max(gm.issue_longitude)::double precision as max_longitude
      from grid_members as gm
      group by gm.grid_x, gm.grid_y
    )
    select
      'cluster'::text,
      null::uuid,
      concat('z', p_zoom, ':', gc.grid_x, ':', gc.grid_y)::text,
      gc.issue_count,
      gc.min_latitude,
      gc.min_longitude,
      gc.max_latitude,
      gc.max_longitude,
      gc.center_latitude,
      gc.center_longitude,
      null::text,
      null::text,
      null::text,
      null::text,
      null::public.road_issue_category,
      null::public.road_issue_severity,
      null::public.road_issue_status,
      null::timestamptz,
      null::timestamptz,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::numeric,
      null::timestamptz,
      null::timestamptz
    from grid_clusters as gc
    order by gc.issue_count desc, gc.grid_x, gc.grid_y;

    return;
  end if;

  return query
  select
    'issue'::text,
    ri.id,
    null::text,
    1::integer,
    ri.latitude,
    ri.longitude,
    ri.latitude,
    ri.longitude,
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
    ),
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
