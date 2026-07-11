insert into public.issue_user_reports (
  issue_id,
  user_id,
  severity,
  first_reported_at,
  last_reported_at,
  report_count,
  withdrawn_at
)
select
  ir.issue_id,
  ir.user_id,
  ri.severity,
  min(ir.created_at),
  max(ir.created_at),
  count(*)::integer,
  null::timestamptz
from public.issue_reports as ir
join public.road_issues as ri
  on ri.id = ir.issue_id
where ir.report_type in ('created', 'verified')
  and not exists (
    select 1
    from public.issue_user_verifications as iuv
    where iuv.issue_id = ir.issue_id
      and iuv.user_id = ir.user_id
      and iuv.report_id = ir.id
  )
group by ir.issue_id, ir.user_id, ri.severity
on conflict (issue_id, user_id) do update
set first_reported_at = least(
      public.issue_user_reports.first_reported_at,
      excluded.first_reported_at
    ),
    last_reported_at = greatest(
      public.issue_user_reports.last_reported_at,
      excluded.last_reported_at
    ),
    report_count = greatest(
      public.issue_user_reports.report_count,
      excluded.report_count
    );

do $$
declare
  v_issue record;
begin
  for v_issue in
    select ri.id
    from public.road_issues as ri
  loop
    perform public.refresh_road_issue_reporter_aggregates(v_issue.id);
    perform public.apply_road_issue_status(v_issue.id);
  end loop;
end;
$$;

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
  v_active_report_count integer;
  v_withdrawn_report_count integer;
  v_damage_report_count integer;
  v_verification_count integer;
  v_solved_report_count integer;
  v_false_report_count integer;
begin
  v_user_id := public.current_authenticated_user_id();

  select count(*)::integer
  into v_active_report_count
  from public.issue_user_reports as iur
  where iur.user_id = v_user_id
    and iur.withdrawn_at is null;

  select count(*)::integer
  into v_withdrawn_report_count
  from public.issue_user_reports as iur
  where iur.user_id = v_user_id
    and iur.withdrawn_at is not null;

  select count(*)::integer
  into v_damage_report_count
  from public.issue_reports as ir
  where ir.user_id = v_user_id
    and ir.report_type = 'damage';

  select count(*)::integer
  into v_verification_count
  from public.issue_user_verifications as iuv
  where iuv.user_id = v_user_id;

  select count(*)::integer
  into v_solved_report_count
  from public.issue_reports as ir
  where ir.user_id = v_user_id
    and ir.report_type = 'solved';

  select count(*)::integer
  into v_false_report_count
  from public.issue_reports as ir
  where ir.user_id = v_user_id
    and ir.report_type = 'false_report';

  return query
  select
    v_active_report_count as active_report_count,
    v_withdrawn_report_count as withdrawn_report_count,
    v_damage_report_count as damage_report_count,
    v_verification_count as verification_count,
    v_solved_report_count as solved_report_count,
    v_false_report_count as false_report_count;
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
  ) as profile_rows
  order by profile_rows.reported_at desc;
end;
$$;

grant execute on function public.get_my_profile_summary() to authenticated;
grant execute on function public.get_my_profile_entries() to authenticated;

notify pgrst, 'reload schema';
