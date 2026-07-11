create index if not exists user_score_events_status_finalized_idx
  on public.user_score_events (status, finalized_at desc, created_at desc);

create index if not exists user_score_events_user_status_finalized_idx
  on public.user_score_events (user_id, status, finalized_at desc, created_at desc);

create index if not exists user_score_totals_confirmed_points_idx
  on public.user_score_totals (confirmed_points desc);

create or replace function public.get_public_leaderboard(
  p_period text default 'all_time',
  p_limit integer default 25
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
security definer
set search_path = public
as $$
declare
  v_period text := coalesce(nullif(p_period, ''), 'all_time');
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 50));
  v_current_user_id uuid := auth.uid();
  v_period_start timestamptz;
begin
  if v_period not in ('week', 'month', 'all_time') then
    v_period := 'all_time';
  end if;

  if v_period = 'week' then
    v_period_start := date_trunc('week', now());
  elsif v_period = 'month' then
    v_period_start := date_trunc('month', now());
  else
    v_period_start := null;
  end if;

  if v_period = 'all_time' then
    return query
    with ranked as (
      select
        ust.user_id,
        ust.level_label,
        ust.confirmed_points as points,
        upper(right(replace(ust.user_id::text, '-', ''), 4)) as public_code,
        row_number() over (
          order by ust.confirmed_points desc, ust.updated_at asc, ust.user_id asc
        )::integer as row_rank
      from public.user_score_totals as ust
      where ust.confirmed_points > 0
    )
    select
      ranked.row_rank as rank,
      concat('Katkıcı #', ranked.public_code) as public_display_name,
      ranked.level_label,
      ranked.points,
      v_period as period,
      ranked.user_id = v_current_user_id as is_current_user,
      ranked.public_code as user_public_code
    from ranked
    where ranked.row_rank <= v_limit
    order by ranked.row_rank;

    return;
  end if;

  return query
  with period_scores as (
    select
      se.user_id,
      sum(se.points)::integer as points,
      max(coalesce(se.finalized_at, se.created_at)) as last_event_at
    from public.user_score_events as se
    where se.status = 'confirmed'
      and coalesce(se.finalized_at, se.created_at) >= v_period_start
    group by se.user_id
  ),
  ranked as (
    select
      ps.user_id,
      coalesce(ust.level_label, public.calculate_score_level(ps.points)) as level_label,
      ps.points,
      upper(right(replace(ps.user_id::text, '-', ''), 4)) as public_code,
      row_number() over (
        order by ps.points desc, ps.last_event_at asc, ps.user_id asc
      )::integer as row_rank
    from period_scores as ps
    left join public.user_score_totals as ust on ust.user_id = ps.user_id
    where ps.points > 0
  )
  select
    ranked.row_rank as rank,
    concat('Katkıcı #', ranked.public_code) as public_display_name,
    ranked.level_label,
    ranked.points,
    v_period as period,
    ranked.user_id = v_current_user_id as is_current_user,
    ranked.public_code as user_public_code
  from ranked
  where ranked.row_rank <= v_limit
  order by ranked.row_rank;
end;
$$;

revoke all on function public.get_public_leaderboard(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
