create or replace function public.get_public_fixed_issues(
  p_period text,
  p_limit integer,
  p_offset integer
)
returns table (
  issue_id uuid,
  category public.road_issue_category,
  severity public.road_issue_severity,
  status public.road_issue_status,
  reporter_count integer,
  verification_count integer,
  damage_count integer,
  solved_count integer,
  open_days integer,
  first_reported_at timestamptz,
  solved_at timestamptz,
  location_fallback text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(nullif(p_period, ''), 'last_7_days');
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  if v_period not in (
    'last_7_days',
    'last_30_days',
    'fastest_solved',
    'most_reported'
  ) then
    raise exception 'invalid_fixed_issues_period'
      using errcode = '22023';
  end if;

  return query
  select
    ri.id as issue_id,
    ri.category,
    ri.severity,
    ri.status,
    ri.reporter_count,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    greatest(
      0,
      floor(extract(epoch from (ri.solved_at - ri.first_reported_at)) / 86400)
    )::integer as open_days,
    ri.first_reported_at,
    ri.solved_at,
    coalesce(
      nullif(btrim(ri.location_label), ''),
      nullif(
        concat_ws(
          ' / ',
          nullif(btrim(ri.city), ''),
          nullif(btrim(ri.district), '')
        ),
        ''
      ),
      concat(
        round(ri.latitude::numeric, 4)::text,
        ', ',
        round(ri.longitude::numeric, 4)::text
      )
    ) as location_fallback
  from public.road_issues as ri
  where ri.status = 'solved'::public.road_issue_status
    and ri.status <> 'likely_solved'::public.road_issue_status
    and ri.solved_at is not null
    and ri.reporter_count > 0
    and (
      v_period not in ('last_7_days', 'last_30_days')
      or (
        v_period = 'last_7_days'
        and ri.solved_at >= now() - interval '7 days'
      )
      or (
        v_period = 'last_30_days'
        and ri.solved_at >= now() - interval '30 days'
      )
    )
  order by
    case
      when v_period = 'fastest_solved'
        then extract(epoch from (ri.solved_at - ri.first_reported_at))
    end asc nulls last,
    case when v_period = 'most_reported' then ri.reporter_count end desc nulls last,
    case when v_period = 'most_reported' then ri.verification_count end desc nulls last,
    ri.solved_at desc,
    ri.id asc
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.get_public_fixed_issues(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_fixed_issues(text, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
