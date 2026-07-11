create or replace function public.get_my_profile_summary()
returns table (
  active_report_count integer,
  withdrawn_report_count integer,
  damage_report_count integer,
  verification_count integer,
  solved_report_count integer,
  false_report_count integer
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
      from public.issue_reports as ir
      where ir.user_id = v_user_id
        and ir.report_type = 'damage'
    ) as damage_report_count,
    (
      select count(*)::integer
      from public.issue_user_verifications as iuv
      where iuv.user_id = v_user_id
    ) as verification_count,
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
    ) as false_report_count;
end;
$$;

create or replace function public.get_my_profile_entries()
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
begin
  v_user_id := public.current_authenticated_user_id();

  return query
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
    greatest(floor(extract(epoch from (now() - ri.first_reported_at)) / 86400), 0)::integer as open_days,
    ri.reporter_count > 0 as issue_is_public
  from public.issue_user_reports as iur
  join public.road_issues as ri
    on ri.id = iur.issue_id
  where iur.user_id = v_user_id

  union all

  select
    ir.report_type::text as entry_type,
    ri.id as issue_id,
    ri.category,
    ri.severity,
    ri.status,
    ri.latitude,
    ri.longitude,
    ri.first_reported_at,
    ir.created_at as reported_at,
    null::timestamptz as withdrawn_at,
    ri.reporter_count,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    ri.false_report_count,
    greatest(floor(extract(epoch from (now() - ri.first_reported_at)) / 86400), 0)::integer as open_days,
    ri.reporter_count > 0 as issue_is_public
  from public.issue_reports as ir
  join public.road_issues as ri
    on ri.id = ir.issue_id
  where ir.user_id = v_user_id
    and ir.report_type in ('damage', 'solved', 'false_report')

  union all

  select
    'verified'::text as entry_type,
    ri.id as issue_id,
    ri.category,
    ri.severity,
    ri.status,
    ri.latitude,
    ri.longitude,
    ri.first_reported_at,
    iuv.verified_at as reported_at,
    null::timestamptz as withdrawn_at,
    ri.reporter_count,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    ri.false_report_count,
    greatest(floor(extract(epoch from (now() - ri.first_reported_at)) / 86400), 0)::integer as open_days,
    ri.reporter_count > 0 as issue_is_public
  from public.issue_user_verifications as iuv
  join public.road_issues as ri
    on ri.id = iuv.issue_id
  where iuv.user_id = v_user_id
  order by reported_at desc;
end;
$$;

revoke all on function public.get_my_profile_summary() from public, anon, authenticated;
revoke all on function public.get_my_profile_entries() from public, anon, authenticated;

grant execute on function public.get_my_profile_summary() to authenticated;
grant execute on function public.get_my_profile_entries() to authenticated;

notify pgrst, 'reload schema';
