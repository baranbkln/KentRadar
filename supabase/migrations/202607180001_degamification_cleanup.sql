drop trigger if exists sync_clan_score_after_user_total_change
  on public.user_score_totals;

drop trigger if exists sync_clan_score_after_membership_change
  on public.clan_members;

drop function if exists public.get_public_clan_members(uuid);
drop function if exists public.create_clan(text, text, text, text);
drop function if exists public.create_clan(text, text);
drop function if exists public.join_clan(uuid);
drop function if exists public.leave_clan();
drop function if exists public.sync_clan_score_after_user_total_change();
drop function if exists public.sync_clan_score_after_membership_change();
drop function if exists public.refresh_clan_total_score(uuid);

drop table if exists public.clan_members cascade;
drop table if exists public.clans cascade;

delete from public.moderation_reports
where target_type = 'clan';

alter table public.moderation_reports
  drop constraint if exists moderation_reports_target_type_check;

alter table public.moderation_reports
  add constraint moderation_reports_target_type_check
  check (target_type in ('user', 'issue'));

drop function if exists public.get_my_command_center();

create function public.get_my_command_center()
returns table (
  confirmed_points integer,
  pending_points integer,
  level_label text,
  global_rank integer,
  current_streak_days integer,
  longest_streak_days integer,
  report_count integer,
  resolved_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  return query
  select
    coalesce(ust.confirmed_points, 0),
    coalesce(ust.pending_points, 0),
    coalesce(ust.level_label, public.calculate_score_level(0)),
    nullif(period_total.rank_cache, 0),
    coalesce(profile.current_streak_days, 0),
    coalesce(profile.longest_streak_days, 0),
    (
      select count(*)::integer
      from public.issue_user_reports as iur
      where iur.user_id = v_user_id
        and iur.withdrawn_at is null
    ),
    (
      select count(distinct ir.issue_id)::integer
      from public.issue_reports as ir
      join public.road_issues as ri on ri.id = ir.issue_id
      where ir.user_id = v_user_id
        and ir.report_type = 'solved'
        and ri.status = 'solved'
    )
  from public.profiles as profile
  left join public.user_score_totals as ust
    on ust.user_id = profile.id
  left join public.user_score_period_totals as period_total
    on period_total.user_id = profile.id
    and period_total.period_type = 'all_time'
    and period_total.period_start = public.score_period_start('all_time')
  where profile.id = v_user_id
  limit 1;
end;
$$;

drop function if exists public.get_my_civic_dashboard();

create function public.get_my_civic_dashboard()
returns table (
  active_report_count integer,
  withdrawn_report_count integer,
  watched_issue_count integer,
  verification_count integer,
  damage_report_count integer,
  solved_report_count integer,
  resolved_count integer,
  false_report_count integer,
  received_verification_count integer,
  received_damage_count integer,
  received_solved_count integer,
  received_false_report_count integer,
  received_watcher_count integer,
  active_reporter_count_on_my_issues integer,
  avg_open_days_on_my_active_issues numeric,
  highest_interaction_issue_id uuid,
  highest_interaction_score integer,
  highest_interaction_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();

  return query
  with my_active_issues as (
    select
      ri.id,
      ri.category,
      ri.reporter_count,
      ri.verification_count,
      ri.damage_count,
      ri.solved_count,
      ri.false_report_count,
      public.count_issue_watchers(ri.id) as watcher_count,
      greatest(
        0,
        floor(extract(epoch from (now() - ri.first_reported_at)) / 86400)
      )::integer as open_days
    from public.issue_user_reports as iur
    join public.road_issues as ri on ri.id = iur.issue_id
    where iur.user_id = v_user_id
      and iur.withdrawn_at is null
  ),
  my_counts as (
    select
      (
        select count(*)::integer
        from public.issue_user_reports as iur
        where iur.user_id = v_user_id
          and iur.withdrawn_at is null
      ) as active_report_count,
      (
        select count(*)::integer
        from public.issue_user_reports as iur
        where iur.user_id = v_user_id
          and iur.withdrawn_at is not null
      ) as withdrawn_report_count,
      (
        select count(*)::integer
        from public.issue_watchers as iw
        where iw.user_id = v_user_id
      ) as watched_issue_count,
      (
        select count(*)::integer
        from public.issue_user_verifications as iuv
        where iuv.user_id = v_user_id
      ) as verification_count,
      (
        select count(*)::integer
        from public.issue_reports as ir
        where ir.user_id = v_user_id
          and ir.report_type = 'damage'
      ) as damage_report_count,
      (
        select count(*)::integer
        from public.issue_reports as ir
        where ir.user_id = v_user_id
          and ir.report_type = 'solved'
      ) as solved_report_count,
      (
        select count(distinct ir.issue_id)::integer
        from public.issue_reports as ir
        join public.road_issues as ri on ri.id = ir.issue_id
        where ir.user_id = v_user_id
          and ir.report_type = 'solved'
          and ri.status = 'solved'
      ) as resolved_count,
      (
        select count(*)::integer
        from public.issue_reports as ir
        where ir.user_id = v_user_id
          and ir.report_type = 'false_report'
      ) as false_report_count
  ),
  impact_counts as (
    select
      coalesce(sum(mai.verification_count), 0)::integer as received_verification_count,
      coalesce(sum(mai.damage_count), 0)::integer as received_damage_count,
      coalesce(sum(mai.solved_count), 0)::integer as received_solved_count,
      coalesce(sum(mai.false_report_count), 0)::integer as received_false_report_count,
      coalesce(sum(mai.watcher_count), 0)::integer as received_watcher_count,
      coalesce(sum(mai.reporter_count), 0)::integer as active_reporter_count_on_my_issues,
      round(coalesce(avg(mai.open_days), 0)::numeric, 1) as avg_open_days_on_my_active_issues
    from my_active_issues as mai
  ),
  highest_issue as (
    select
      mai.id as highest_interaction_issue_id,
      (
        mai.reporter_count +
        (mai.verification_count * 2) +
        (mai.damage_count * 4) +
        mai.solved_count +
        mai.false_report_count +
        mai.watcher_count
      )::integer as highest_interaction_score,
      mai.category::text as highest_interaction_label
    from my_active_issues as mai
    order by
      (
        mai.reporter_count +
        (mai.verification_count * 2) +
        (mai.damage_count * 4) +
        mai.solved_count +
        mai.false_report_count +
        mai.watcher_count
      ) desc,
      mai.open_days desc,
      mai.id asc
    limit 1
  )
  select
    mc.active_report_count,
    mc.withdrawn_report_count,
    mc.watched_issue_count,
    mc.verification_count,
    mc.damage_report_count,
    mc.solved_report_count,
    mc.resolved_count,
    mc.false_report_count,
    ic.received_verification_count,
    ic.received_damage_count,
    ic.received_solved_count,
    ic.received_false_report_count,
    ic.received_watcher_count,
    ic.active_reporter_count_on_my_issues,
    ic.avg_open_days_on_my_active_issues,
    hi.highest_interaction_issue_id,
    coalesce(hi.highest_interaction_score, 0),
    hi.highest_interaction_label
  from my_counts as mc
  cross join impact_counts as ic
  left join highest_issue as hi on true;
end;
$$;

drop function if exists public.get_public_leaderboard(text, integer, integer);

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
  user_public_code text,
  username text,
  avatar_style text
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
    current_period.rank_cache,
    coalesce(
      nullif(profile.username, ''),
      concat(
        'Katkıcı #',
        upper(right(replace(current_period.user_id::text, '-', ''), 4))
      )
    ),
    public.calculate_score_level(
      coalesce(all_time.confirmed_points, current_period.confirmed_points)
    ),
    current_period.confirmed_points,
    v_period,
    current_period.user_id = v_current_user_id,
    upper(right(replace(current_period.user_id::text, '-', ''), 4)),
    profile.username,
    coalesce(profile.avatar_style, 'cyan_user')
  from public.user_score_period_totals as current_period
  left join public.user_score_period_totals as all_time
    on all_time.user_id = current_period.user_id
    and all_time.period_type = 'all_time'
    and all_time.period_start = public.score_period_start('all_time')
  left join public.profiles as profile
    on profile.id = current_period.user_id
  where current_period.period_type = v_period_type
    and current_period.period_start = v_period_start
    and current_period.confirmed_points > 0
    and current_period.rank_cache > 0
    and coalesce(profile.is_suspended, false) = false
  order by current_period.rank_cache asc
  limit v_limit
  offset v_offset;
end;
$$;

drop function if exists public.get_public_issue_reporter_identity(uuid);

create function public.get_public_issue_reporter_identity(
  p_issue_id uuid
)
returns table (
  target_user_id uuid,
  username text,
  avatar_style text,
  public_display_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    case when auth.uid() is null then null else ri.created_by end,
    profile.username,
    coalesce(profile.avatar_style, 'cyan_user'),
    coalesce(
      nullif(profile.username, ''),
      concat(
        'Katkıcı #',
        upper(right(replace(ri.created_by::text, '-', ''), 4))
      )
    )
  from public.road_issues as ri
  left join public.profiles as profile on profile.id = ri.created_by
  where ri.id = p_issue_id
    and ri.reporter_count > 0
  limit 1;
$$;

revoke all on function public.get_my_command_center()
  from public, anon, authenticated;
grant execute on function public.get_my_command_center()
  to authenticated;

revoke all on function public.get_my_civic_dashboard()
  from public, anon, authenticated;
grant execute on function public.get_my_civic_dashboard()
  to authenticated;

revoke all on function public.get_public_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer, integer)
  to anon, authenticated;

revoke all on function public.get_public_issue_reporter_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_issue_reporter_identity(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
