drop function if exists public.get_my_watched_issues();

create function public.get_my_watched_issues(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  issue_id uuid,
  category public.road_issue_category,
  severity public.road_issue_severity,
  status public.road_issue_status,
  latitude double precision,
  longitude double precision,
  first_reported_at timestamptz,
  last_verified_at timestamptz,
  reporter_count integer,
  verification_count integer,
  damage_count integer,
  solved_count integer,
  false_report_count integer,
  watcher_count integer,
  open_days integer,
  watched_at timestamptz,
  issue_is_public boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_authenticated_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return query
  select
    ri.id,
    ri.category,
    ri.severity,
    ri.status,
    ri.latitude,
    ri.longitude,
    ri.first_reported_at,
    ri.last_verified_at,
    ri.reporter_count,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    ri.false_report_count,
    (
      select count(*)::integer
      from public.issue_watchers as all_iw
      where all_iw.issue_id = ri.id
    ),
    greatest(
      0,
      floor(extract(epoch from (now() - ri.first_reported_at)) / 86400)
    )::integer,
    iw.created_at,
    ri.reporter_count > 0
  from public.issue_watchers as iw
  join public.road_issues as ri on ri.id = iw.issue_id
  where iw.user_id = v_user_id
  order by iw.created_at desc, ri.id
  limit v_limit
  offset v_offset;
end;
$$;

drop function if exists public.get_my_score_events(integer);

create function public.get_my_score_events(
  p_limit integer default 10,
  p_offset integer default 0
)
returns table (
  event_type text,
  points integer,
  status text,
  reason text,
  issue_id uuid,
  created_at timestamptz,
  finalized_at timestamptz,
  reversed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := public.current_authenticated_user_id();
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  return query
  select
    se.event_type,
    se.points,
    se.status,
    se.reason,
    se.issue_id,
    se.created_at,
    se.finalized_at,
    se.reversed_at
  from public.user_score_events as se
  where se.user_id = v_user_id
  order by se.created_at desc, se.id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.get_my_watched_issues(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_watched_issues(integer, integer)
  to authenticated;

revoke all on function public.get_my_score_events(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_score_events(integer, integer)
  to authenticated;

notify pgrst, 'reload schema';
