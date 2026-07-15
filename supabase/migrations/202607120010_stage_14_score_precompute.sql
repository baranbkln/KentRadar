create table if not exists public.user_score_period_totals (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_type text not null
    check (period_type in ('weekly', 'monthly', 'all_time')),
  period_start timestamptz not null,
  confirmed_points integer not null default 0,
  rank_cache integer not null default 0 check (rank_cache >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_type, period_start)
);

create index if not exists user_score_period_totals_ranking_idx
  on public.user_score_period_totals (
    period_type,
    period_start,
    confirmed_points desc,
    updated_at asc,
    user_id
  );

create index if not exists user_score_period_totals_cached_rank_idx
  on public.user_score_period_totals (
    period_type,
    period_start,
    rank_cache
  )
  where confirmed_points > 0;

alter table public.user_score_period_totals enable row level security;

revoke all on table public.user_score_period_totals from anon, authenticated;

create or replace function public.score_period_start(
  p_period_type text,
  p_at timestamptz default now()
)
returns timestamptz
language sql
stable
parallel safe
set search_path = public
as $$
  select case p_period_type
    when 'weekly' then
      date_trunc('week', p_at at time zone 'UTC') at time zone 'UTC'
    when 'monthly' then
      date_trunc('month', p_at at time zone 'UTC') at time zone 'UTC'
    when 'all_time' then
      '1970-01-01 00:00:00+00'::timestamptz
    else null::timestamptz
  end;
$$;

create or replace function public.refresh_user_score_period_totals(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat('score-period-user:', p_user_id::text),
      0
    )
  );

  delete from public.user_score_period_totals as uspt
  where uspt.user_id = p_user_id;

  insert into public.user_score_period_totals (
    user_id,
    period_type,
    period_start,
    confirmed_points,
    rank_cache,
    updated_at
  )
  with confirmed_events as materialized (
    select
      se.points,
      coalesce(se.finalized_at, se.created_at) as confirmed_at
    from public.user_score_events as se
    where se.user_id = p_user_id
      and se.status = 'confirmed'
  ),
  period_totals as (
    select
      'weekly'::text as period_type,
      public.score_period_start('weekly', ce.confirmed_at) as period_start,
      sum(ce.points)::integer as confirmed_points
    from confirmed_events as ce
    group by public.score_period_start('weekly', ce.confirmed_at)

    union all

    select
      'monthly'::text as period_type,
      public.score_period_start('monthly', ce.confirmed_at) as period_start,
      sum(ce.points)::integer as confirmed_points
    from confirmed_events as ce
    group by public.score_period_start('monthly', ce.confirmed_at)

    union all

    select
      'all_time'::text as period_type,
      public.score_period_start('all_time') as period_start,
      coalesce(sum(ce.points), 0)::integer as confirmed_points
    from confirmed_events as ce
  )
  select
    p_user_id,
    pt.period_type,
    pt.period_start,
    pt.confirmed_points,
    0,
    now()
  from period_totals as pt
  where pt.period_start is not null;
end;
$$;

create or replace function public.refresh_score_period_rank_cache(
  p_period_type text,
  p_period_start timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_period_type not in ('weekly', 'monthly', 'all_time')
    or p_period_start is null
  then
    raise exception 'invalid_score_period' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      concat(
        'score-period-rank:',
        p_period_type,
        ':',
        p_period_start::text
      ),
      0
    )
  );

  update public.user_score_period_totals as uspt
  set rank_cache = 0
  where uspt.period_type = p_period_type
    and uspt.period_start = p_period_start
    and uspt.rank_cache <> 0;

  with ranked_totals as materialized (
    select
      uspt.user_id,
      row_number() over (
        order by
          uspt.confirmed_points desc,
          uspt.updated_at asc,
          uspt.user_id asc
      )::integer as calculated_rank
    from public.user_score_period_totals as uspt
    where uspt.period_type = p_period_type
      and uspt.period_start = p_period_start
      and uspt.confirmed_points > 0
  )
  update public.user_score_period_totals as uspt
  set rank_cache = rt.calculated_rank
  from ranked_totals as rt
  where uspt.user_id = rt.user_id
    and uspt.period_type = p_period_type
    and uspt.period_start = p_period_start;
end;
$$;

create or replace function public.refresh_current_score_period_ranks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_score_period_rank_cache(
    'weekly',
    public.score_period_start('weekly')
  );
  perform public.refresh_score_period_rank_cache(
    'monthly',
    public.score_period_start('monthly')
  );
  perform public.refresh_score_period_rank_cache(
    'all_time',
    public.score_period_start('all_time')
  );
end;
$$;

create or replace function public.sync_user_score_period_totals_after_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_user_id uuid;
  v_new_user_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'confirmed' then
      return new;
    end if;

    v_new_user_id := new.user_id;
  elsif tg_op = 'DELETE' then
    if old.status <> 'confirmed' then
      return old;
    end if;

    v_old_user_id := old.user_id;
  else
    if old.status <> 'confirmed' and new.status <> 'confirmed' then
      return new;
    end if;

    if old.user_id = new.user_id
      and old.status = new.status
      and old.points = new.points
      and old.created_at = new.created_at
      and old.finalized_at is not distinct from new.finalized_at
    then
      return new;
    end if;

    v_old_user_id := old.user_id;
    v_new_user_id := new.user_id;
  end if;

  if v_old_user_id is not null then
    perform public.refresh_user_score_period_totals(v_old_user_id);
  end if;

  if v_new_user_id is not null
    and v_new_user_id is distinct from v_old_user_id
  then
    perform public.refresh_user_score_period_totals(v_new_user_id);
  end if;

  perform public.refresh_current_score_period_ranks();

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_user_score_period_totals_after_event
  on public.user_score_events;

create trigger sync_user_score_period_totals_after_event
after insert or update or delete on public.user_score_events
for each row
execute function public.sync_user_score_period_totals_after_event();

do $$
declare
  v_user record;
begin
  for v_user in
    select users_with_scores.user_id
    from (
      select distinct se.user_id
      from public.user_score_events as se

      union

      select ust.user_id
      from public.user_score_totals as ust
    ) as users_with_scores
    order by users_with_scores.user_id
  loop
    perform public.refresh_user_score_period_totals(v_user.user_id);
  end loop;

  perform public.refresh_current_score_period_ranks();
end;
$$;

drop function if exists public.get_public_leaderboard(text, integer);

create function public.get_public_leaderboard(
  p_period text default 'all_time',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  rank integer,
  public_display_name text,
  level_label text,
  points integer,
  period text,
  is_current_user boolean,
  user_public_code text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(nullif(btrim(p_period), ''), 'all_time');
  v_period_type text;
  v_period_start timestamptz;
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_current_user_id uuid := auth.uid();
begin
  if v_period not in ('week', 'month', 'all_time') then
    v_period := 'all_time';
  end if;

  v_period_type := case v_period
    when 'week' then 'weekly'
    when 'month' then 'monthly'
    else 'all_time'
  end;
  v_period_start := public.score_period_start(v_period_type);

  return query
  select
    current_period.rank_cache as rank,
    concat(
      'Katkıcı #',
      upper(right(replace(current_period.user_id::text, '-', ''), 4))
    ) as public_display_name,
    public.calculate_score_level(
      coalesce(all_time.confirmed_points, current_period.confirmed_points)
    ) as level_label,
    current_period.confirmed_points as points,
    v_period as period,
    current_period.user_id = v_current_user_id as is_current_user,
    upper(right(replace(current_period.user_id::text, '-', ''), 4))
      as user_public_code
  from public.user_score_period_totals as current_period
  left join public.user_score_period_totals as all_time
    on all_time.user_id = current_period.user_id
    and all_time.period_type = 'all_time'
    and all_time.period_start = public.score_period_start('all_time')
  where current_period.period_type = v_period_type
    and current_period.period_start = v_period_start
    and current_period.confirmed_points > 0
    and current_period.rank_cache > 0
  order by current_period.rank_cache asc
  limit v_limit
  offset v_offset;
end;
$$;

drop function if exists public.get_my_profile_entries();

create function public.get_my_profile_entries(
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  entry_type text,
  issue_id uuid,
  category public.road_issue_category,
  severity public.road_issue_severity,
  status public.road_issue_status,
  latitude double precision,
  longitude double precision,
  first_reported_at timestamptz,
  reported_at timestamptz,
  withdrawn_at timestamptz,
  reporter_count integer,
  verification_count integer,
  damage_count integer,
  solved_count integer,
  false_report_count integer,
  open_days integer,
  issue_is_public boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 200));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
begin
  v_user_id := public.current_authenticated_user_id();

  return query
  select
    profile_rows.entry_type,
    profile_rows.issue_id,
    profile_rows.category,
    profile_rows.severity,
    profile_rows.status,
    profile_rows.latitude,
    profile_rows.longitude,
    profile_rows.first_reported_at,
    profile_rows.reported_at,
    profile_rows.withdrawn_at,
    profile_rows.reporter_count,
    profile_rows.verification_count,
    profile_rows.damage_count,
    profile_rows.solved_count,
    profile_rows.false_report_count,
    profile_rows.open_days,
    profile_rows.issue_is_public
  from (
    select
      case
        when iur.withdrawn_at is null then 'active_report'
        else 'withdrawn_report'
      end::text as entry_type,
      ri.id as issue_id,
      ri.category,
      ri.severity,
      ri.status,
      ri.latitude,
      ri.longitude,
      ri.first_reported_at,
      iur.first_reported_at as reported_at,
      iur.withdrawn_at,
      ri.reporter_count,
      ri.verification_count,
      ri.damage_count,
      ri.solved_count,
      ri.false_report_count,
      greatest(
        floor(extract(epoch from (now() - ri.first_reported_at)) / 86400),
        0
      )::integer as open_days,
      ri.reporter_count > 0 as issue_is_public
    from public.issue_user_reports as iur
    join public.road_issues as ri on ri.id = iur.issue_id
    where iur.user_id = v_user_id

    union all

    select
      ir.report_type::text,
      ri.id,
      ri.category,
      ri.severity,
      ri.status,
      ri.latitude,
      ri.longitude,
      ri.first_reported_at,
      ir.created_at,
      null::timestamptz,
      ri.reporter_count,
      ri.verification_count,
      ri.damage_count,
      ri.solved_count,
      ri.false_report_count,
      greatest(
        floor(extract(epoch from (now() - ri.first_reported_at)) / 86400),
        0
      )::integer,
      ri.reporter_count > 0
    from public.issue_reports as ir
    join public.road_issues as ri on ri.id = ir.issue_id
    where ir.user_id = v_user_id
      and ir.report_type in ('damage', 'solved', 'false_report')

    union all

    select
      'verified'::text,
      ri.id,
      ri.category,
      ri.severity,
      ri.status,
      ri.latitude,
      ri.longitude,
      ri.first_reported_at,
      iuv.verified_at,
      null::timestamptz,
      ri.reporter_count,
      ri.verification_count,
      ri.damage_count,
      ri.solved_count,
      ri.false_report_count,
      greatest(
        floor(extract(epoch from (now() - ri.first_reported_at)) / 86400),
        0
      )::integer,
      ri.reporter_count > 0
    from public.issue_user_verifications as iuv
    join public.road_issues as ri on ri.id = iuv.issue_id
    where iuv.user_id = v_user_id
  ) as profile_rows
  order by profile_rows.reported_at desc, profile_rows.issue_id
  limit v_limit
  offset v_offset;
end;
$$;

revoke all on function public.score_period_start(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refresh_user_score_period_totals(uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_score_period_rank_cache(text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.refresh_current_score_period_ranks()
  from public, anon, authenticated;
revoke all on function public.sync_user_score_period_totals_after_event()
  from public, anon, authenticated;

revoke all on function public.get_public_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer, integer)
  to anon, authenticated;

revoke all on function public.get_my_profile_entries(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_profile_entries(integer, integer)
  to authenticated;

notify pgrst, 'reload schema';
