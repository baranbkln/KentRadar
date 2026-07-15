create index if not exists road_issues_public_reporter_rank_idx
  on public.road_issues (reporter_count desc, updated_at desc, id)
  where reporter_count > 0;

create index if not exists road_issues_public_verification_rank_idx
  on public.road_issues (verification_count desc, last_verified_at desc, id)
  where reporter_count > 0 and verification_count > 0;

create index if not exists road_issues_public_damage_rank_idx
  on public.road_issues (damage_count desc, updated_at desc, id)
  where reporter_count > 0 and damage_count > 0;

create index if not exists road_issues_public_oldest_rank_idx
  on public.road_issues (first_reported_at asc, id)
  where reporter_count > 0;

create index if not exists road_issues_public_newest_rank_idx
  on public.road_issues (created_at desc, id)
  where reporter_count > 0;

create index if not exists road_issues_public_recently_verified_rank_idx
  on public.road_issues (last_verified_at desc, id)
  where reporter_count > 0 and last_verified_at is not null;

create or replace function public.get_paginated_issues(
  p_limit integer default 20,
  p_offset integer default 0,
  p_category text default null,
  p_status text default null,
  p_sort_by text default 'newest'
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
  updated_at timestamptz,
  open_days integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_category text := nullif(lower(btrim(p_category)), '');
  v_status text := nullif(lower(btrim(p_status)), '');
  v_sort_by text := coalesce(nullif(lower(btrim(p_sort_by)), ''), 'newest');
  v_signal_filter text;
  v_order_by text;
begin
  if v_category = 'all' then
    v_category := null;
  end if;

  if v_status = 'all' then
    v_status := null;
  end if;

  if v_sort_by = 'recently_added' then
    v_sort_by := 'newest';
  end if;

  if v_sort_by not in (
    'newest',
    'most_reported',
    'most_verified',
    'most_damage',
    'longest_open',
    'recently_verified'
  ) then
    raise exception 'invalid_issue_sort' using errcode = '22023';
  end if;

  v_signal_filter := case v_sort_by
    when 'most_verified' then 'and ri.verification_count > 0'
    when 'most_damage' then 'and ri.damage_count > 0'
    when 'recently_verified' then 'and ri.last_verified_at is not null'
    else ''
  end;

  v_order_by := case v_sort_by
    when 'most_reported' then
      'ri.reporter_count desc, ri.updated_at desc, ri.id asc'
    when 'most_verified' then
      'ri.verification_count desc, ri.last_verified_at desc, ri.id asc'
    when 'most_damage' then
      'ri.damage_count desc, ri.updated_at desc, ri.id asc'
    when 'longest_open' then
      'ri.first_reported_at asc, ri.id asc'
    when 'recently_verified' then
      'ri.last_verified_at desc, ri.id asc'
    else
      'ri.created_at desc, ri.id asc'
  end;

  return query execute format(
    $query$
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
        ),
        ri.severity_score_avg,
        ri.created_at,
        ri.updated_at,
        greatest(
          floor(extract(epoch from (now() - ri.first_reported_at)) / 86400),
          0
        )::integer
      from public.road_issues as ri
      where ri.reporter_count > 0
        and ($1 is null or ri.category::text = $1)
        and ($2 is null or ri.status::text = $2)
        %s
      order by %s
      limit $3
      offset $4
    $query$,
    v_signal_filter,
    v_order_by
  ) using v_category, v_status, v_limit, v_offset;
end;
$$;

revoke all on function public.get_paginated_issues(
  integer,
  integer,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.get_paginated_issues(
  integer,
  integer,
  text,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
