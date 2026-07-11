create or replace function public.get_my_civic_dashboard()
returns table (
  active_report_count integer,
  withdrawn_report_count integer,
  watched_issue_count integer,
  verification_count integer,
  damage_report_count integer,
  solved_report_count integer,
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
    mc.false_report_count,
    ic.received_verification_count,
    ic.received_damage_count,
    ic.received_solved_count,
    ic.received_false_report_count,
    ic.received_watcher_count,
    ic.active_reporter_count_on_my_issues,
    ic.avg_open_days_on_my_active_issues,
    hi.highest_interaction_issue_id,
    coalesce(hi.highest_interaction_score, 0) as highest_interaction_score,
    hi.highest_interaction_label
  from my_counts as mc
  cross join impact_counts as ic
  left join highest_issue as hi on true;
end;
$$;

revoke all on function public.get_my_civic_dashboard() from public, anon, authenticated;
grant execute on function public.get_my_civic_dashboard() to authenticated;

notify pgrst, 'reload schema';
