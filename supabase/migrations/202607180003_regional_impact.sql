alter table public.road_issues
  add column if not exists city text,
  add column if not exists district text;

create index if not exists road_issues_city_district_public_idx
  on public.road_issues (city, district, status)
  where reporter_count > 0;

drop function if exists public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean,
  boolean,
  text,
  text
);

create function public.create_issue_or_merge_duplicate(
  p_latitude double precision,
  p_longitude double precision,
  p_category public.road_issue_category,
  p_severity public.road_issue_severity,
  p_has_photo boolean default false,
  p_has_damage boolean default false,
  p_city text default null,
  p_district text default null
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
set search_path = public
as $$
#variable_conflict use_column
declare
  v_result record;
  v_city text := nullif(btrim(p_city), '');
  v_district text := nullif(btrim(p_district), '');
begin
  select base_result.*
  into v_result
  from public.create_issue_or_merge_duplicate(
    p_latitude,
    p_longitude,
    p_category,
    p_severity,
    p_has_photo,
    p_has_damage
  ) as base_result;

  update public.road_issues as ri
  set
    city = coalesce(nullif(ri.city, ''), v_city),
    district = coalesce(nullif(ri.district, ''), v_district),
    updated_at = case
      when (
        ri.city is null and v_city is not null
      ) or (
        ri.district is null and v_district is not null
      ) then now()
      else ri.updated_at
    end
  where ri.id = v_result.issue_id;

  return query
  select
    v_result.issue_id::uuid,
    v_result.merged::boolean,
    v_result.report_accepted::boolean,
    v_result.already_reported_by_user::boolean,
    v_result.severity_updated::boolean,
    v_result.damage_report_added::boolean,
    v_result.latitude::double precision,
    v_result.longitude::double precision;
end;
$$;

create or replace function public.get_available_issue_regions()
returns table (
  city text,
  district text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    ri.city,
    ri.district
  from public.road_issues as ri
  where ri.reporter_count > 0
    and ri.city is not null
    and btrim(ri.city) <> ''
  order by ri.city, ri.district nulls first;
$$;

create or replace function public.get_regional_leaderboard(
  p_city text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rank integer,
  city text,
  district text,
  total_resolved integer,
  total_reports integer,
  total_verified integer,
  total_issues integer
)
language sql
stable
security definer
set search_path = public
as $$
  with regional_totals as (
    select
      ri.city,
      ri.district,
      count(*) filter (where ri.status = 'solved')::integer
        as total_resolved,
      coalesce(sum(ri.reporter_count), 0)::integer as total_reports,
      coalesce(sum(ri.verification_count), 0)::integer as total_verified,
      count(*)::integer as total_issues
    from public.road_issues as ri
    where ri.reporter_count > 0
      and ri.city is not null
      and btrim(ri.city) <> ''
      and ri.district is not null
      and btrim(ri.district) <> ''
      and (
        nullif(btrim(p_city), '') is null
        or lower(ri.city) = lower(btrim(p_city))
      )
    group by ri.city, ri.district
  ),
  ranked_regions as (
    select
      row_number() over (
        order by
          rt.total_reports desc,
          rt.total_verified desc,
          rt.total_resolved desc,
          rt.city,
          rt.district
      )::integer as rank,
      rt.city,
      rt.district,
      rt.total_resolved,
      rt.total_reports,
      rt.total_verified,
      rt.total_issues
    from regional_totals as rt
  )
  select
    rr.rank,
    rr.city,
    rr.district,
    rr.total_resolved,
    rr.total_reports,
    rr.total_verified,
    rr.total_issues
  from ranked_regions as rr
  order by rr.rank
  limit greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_local_contributors(
  p_city text,
  p_district text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rank integer,
  public_display_name text,
  level_label text,
  points integer,
  is_current_user boolean,
  user_public_code text,
  username text,
  avatar_style text,
  city text,
  district text
)
language sql
stable
security definer
set search_path = public
as $$
  with contributor_totals as (
    select
      se.user_id,
      sum(se.points)::integer as points
    from public.user_score_events as se
    join public.road_issues as ri on ri.id = se.issue_id
    left join public.profiles as profile on profile.id = se.user_id
    where se.status = 'confirmed'
      and nullif(btrim(p_city), '') is not null
      and lower(ri.city) = lower(btrim(p_city))
      and (
        nullif(btrim(p_district), '') is null
        or lower(ri.district) = lower(btrim(p_district))
      )
      and coalesce(profile.is_suspended, false) = false
    group by se.user_id
    having sum(se.points) > 0
  ),
  ranked_contributors as (
    select
      row_number() over (
        order by ct.points desc, ct.user_id
      )::integer as rank,
      ct.user_id,
      ct.points
    from contributor_totals as ct
  )
  select
    rc.rank,
    coalesce(
      nullif(profile.username, ''),
      concat(
        'Katkıcı #',
        upper(right(replace(rc.user_id::text, '-', ''), 4))
      )
    ) as public_display_name,
    coalesce(
      ust.level_label,
      public.calculate_score_level(coalesce(ust.confirmed_points, 0))
    ) as level_label,
    rc.points,
    rc.user_id = auth.uid() as is_current_user,
    upper(right(replace(rc.user_id::text, '-', ''), 4))
      as user_public_code,
    profile.username,
    coalesce(profile.avatar_style, 'cyan_user') as avatar_style,
    btrim(p_city) as city,
    nullif(btrim(p_district), '') as district
  from ranked_contributors as rc
  left join public.profiles as profile on profile.id = rc.user_id
  left join public.user_score_totals as ust on ust.user_id = rc.user_id
  order by rc.rank
  limit greatest(1, least(coalesce(p_limit, 25), 50))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean,
  boolean,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean,
  boolean,
  text,
  text
) to authenticated;

revoke all on function public.get_available_issue_regions()
  from public, anon, authenticated;
grant execute on function public.get_available_issue_regions()
  to anon, authenticated;

revoke all on function public.get_regional_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_regional_leaderboard(text, integer, integer)
  to anon, authenticated;

revoke all on function public.get_local_contributors(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.get_local_contributors(
  text,
  text,
  integer,
  integer
) to anon, authenticated;

notify pgrst, 'reload schema';
