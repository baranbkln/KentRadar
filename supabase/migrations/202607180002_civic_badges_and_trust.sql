create table if not exists public.badges (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null unique,
  description text not null,
  icon_name text not null,
  color_theme text not null default 'slate'
    check (color_theme in ('slate', 'blue', 'emerald')),
  requirement_type text not null
    check (
      requirement_type in (
        'report_count',
        'resolved_count',
        'confirmed_points'
      )
    ),
  requirement_value integer not null check (requirement_value > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists user_badges_user_awarded_idx
  on public.user_badges (user_id, awarded_at desc);

create index if not exists user_badges_badge_idx
  on public.user_badges (badge_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

drop policy if exists "Badges are publicly readable" on public.badges;
create policy "Badges are publicly readable"
on public.badges
for select
to anon, authenticated
using (true);

drop policy if exists "Users can read their own badges" on public.user_badges;
create policy "Users can read their own badges"
on public.user_badges
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.badges from anon, authenticated;
revoke all on table public.user_badges from anon, authenticated;
grant select on table public.badges to anon, authenticated;
grant select on table public.user_badges to authenticated;

insert into public.badges (
  name,
  description,
  icon_name,
  color_theme,
  requirement_type,
  requirement_value
)
values
  (
    'İlk Adım',
    'İlk aktif yol sorunu bildirimini yaptı.',
    'map-pin-check',
    'blue',
    'report_count',
    1
  ),
  (
    'Çözüm Ortağı',
    'En az bir yol sorununun çözüm sürecine katkı sağladı.',
    'badge-check',
    'emerald',
    'resolved_count',
    1
  ),
  (
    'Sivil Lider',
    '5.000 kesinleşmiş katkı puanına ulaştı.',
    'shield-check',
    'slate',
    'confirmed_points',
    5000
  )
on conflict (name) do update
set
  description = excluded.description,
  icon_name = excluded.icon_name,
  color_theme = excluded.color_theme,
  requirement_type = excluded.requirement_type,
  requirement_value = excluded.requirement_value;

create or replace function public.user_meets_badge_requirement(
  p_user_id uuid,
  p_requirement_type text,
  p_requirement_value integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case p_requirement_type
    when 'report_count' then (
      select count(*) >= p_requirement_value
      from public.issue_user_reports as iur
      where iur.user_id = p_user_id
        and iur.withdrawn_at is null
    )
    when 'resolved_count' then (
      select count(distinct ir.issue_id) >= p_requirement_value
      from public.issue_reports as ir
      join public.road_issues as ri on ri.id = ir.issue_id
      where ir.user_id = p_user_id
        and ir.report_type = 'solved'
        and ri.status = 'solved'
    )
    when 'confirmed_points' then (
      select coalesce(ust.confirmed_points, 0) >= p_requirement_value
      from (select 1) as seed
      left join public.user_score_totals as ust on ust.user_id = p_user_id
    )
    else false
  end;
$$;

create or replace function public.award_eligible_badges(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted_count integer := 0;
  v_row_count integer;
  v_badge record;
begin
  if p_user_id is null then
    return 0;
  end if;

  for v_badge in
    select
      badge.id,
      badge.requirement_type,
      badge.requirement_value
    from public.badges as badge
  loop
    if public.user_meets_badge_requirement(
      p_user_id,
      v_badge.requirement_type,
      v_badge.requirement_value
    ) then
      insert into public.user_badges (user_id, badge_id)
      values (p_user_id, v_badge.id)
      on conflict (user_id, badge_id) do nothing;

      get diagnostics v_row_count = row_count;
      v_inserted_count := v_inserted_count + v_row_count;
    end if;
  end loop;

  return v_inserted_count;
end;
$$;

create or replace function public.award_badge(p_badge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_badge public.badges%rowtype;
  v_row_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select badge.*
  into v_badge
  from public.badges as badge
  where badge.id = p_badge_id;

  if not found then
    raise exception 'badge_not_found';
  end if;

  if not public.user_meets_badge_requirement(
    v_user_id,
    v_badge.requirement_type,
    v_badge.requirement_value
  ) then
    return false;
  end if;

  insert into public.user_badges (user_id, badge_id)
  values (v_user_id, v_badge.id)
  on conflict (user_id, badge_id) do nothing;

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

create or replace function public.get_my_badges()
returns table (
  badge_id uuid,
  name text,
  description text,
  icon_name text,
  color_theme text,
  requirement_type text,
  requirement_value integer,
  awarded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  perform public.award_eligible_badges(v_user_id);

  return query
  select
    badge.id,
    badge.name,
    badge.description,
    badge.icon_name,
    badge.color_theme,
    badge.requirement_type,
    badge.requirement_value,
    ub.awarded_at
  from public.user_badges as ub
  join public.badges as badge on badge.id = ub.badge_id
  where ub.user_id = v_user_id
  order by ub.awarded_at desc, badge.requirement_value desc, badge.id;
end;
$$;

create or replace function public.get_public_issue_reporter_badges(
  p_issue_id uuid,
  p_limit integer default 3
)
returns table (
  badge_id uuid,
  name text,
  description text,
  icon_name text,
  color_theme text,
  requirement_value integer,
  awarded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    badge.id,
    badge.name,
    badge.description,
    badge.icon_name,
    badge.color_theme,
    badge.requirement_value,
    ub.awarded_at
  from public.road_issues as ri
  join public.user_badges as ub on ub.user_id = ri.created_by
  join public.badges as badge on badge.id = ub.badge_id
  where ri.id = p_issue_id
    and ri.reporter_count > 0
  order by badge.requirement_value desc, ub.awarded_at desc, badge.id
  limit greatest(1, least(coalesce(p_limit, 3), 3));
$$;

create or replace function public.sync_user_badges_after_score_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_eligible_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists sync_user_badges_after_score_change
  on public.user_score_totals;
create trigger sync_user_badges_after_score_change
after insert or update of confirmed_points on public.user_score_totals
for each row
execute function public.sync_user_badges_after_score_change();

create or replace function public.sync_user_badges_after_report_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_eligible_badges(new.user_id);
  return new;
end;
$$;

drop trigger if exists sync_user_badges_after_report_change
  on public.issue_user_reports;
create trigger sync_user_badges_after_report_change
after insert or update of withdrawn_at on public.issue_user_reports
for each row
execute function public.sync_user_badges_after_report_change();

create or replace function public.sync_resolution_badges_after_issue_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user record;
begin
  if new.status = 'solved'
    and old.status is distinct from new.status
  then
    for v_user in
      select distinct ir.user_id
      from public.issue_reports as ir
      where ir.issue_id = new.id
        and ir.report_type = 'solved'
    loop
      perform public.award_eligible_badges(v_user.user_id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_resolution_badges_after_issue_change
  on public.road_issues;
create trigger sync_resolution_badges_after_issue_change
after update of status on public.road_issues
for each row
execute function public.sync_resolution_badges_after_issue_change();

do $$
declare
  v_profile record;
begin
  for v_profile in
    select profile.id
    from public.profiles as profile
  loop
    perform public.award_eligible_badges(v_profile.id);
  end loop;
end;
$$;

alter table public.road_issues
  add column if not exists created_by_trusted_reporter boolean
  not null default false;

create index if not exists road_issues_trusted_reporter_idx
  on public.road_issues (created_by_trusted_reporter)
  where created_by_trusted_reporter = true;

create or replace function public.apply_trusted_reporter_to_new_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed_points integer;
begin
  select coalesce(ust.confirmed_points, 0)
  into v_confirmed_points
  from public.user_score_totals as ust
  where ust.user_id = new.created_by;

  if coalesce(v_confirmed_points, 0) >= 1000 then
    new.created_by_trusted_reporter := true;

    if new.status = 'new' then
      new.status := 'verified';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_trusted_reporter_to_new_issue
  on public.road_issues;
create trigger apply_trusted_reporter_to_new_issue
before insert on public.road_issues
for each row
execute function public.apply_trusted_reporter_to_new_issue();

create or replace function public.refresh_road_issue_reputation_state(
  p_issue_id uuid
)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_current_status public.road_issue_status;
  v_next_status public.road_issue_status;
  v_reporter_count integer;
  v_verification_count integer;
  v_solved_count integer;
  v_false_report_count integer;
  v_solved_user_count integer;
  v_verification_weight numeric(10, 2);
  v_solved_weight numeric(10, 2);
  v_false_weight numeric(10, 2);
  v_effective_verification_weight numeric(10, 2);
  v_effective_solved_weight numeric(10, 2);
  v_first_solved_at timestamptz;
  v_last_solved_at timestamptz;
  v_last_verified_at timestamptz;
  v_last_opposing_activity_at timestamptz;
  v_first_reported_at timestamptz;
  v_created_by_trusted_reporter boolean;
begin
  select
    ri.status,
    ri.reporter_count,
    ri.first_reported_at,
    ri.created_by_trusted_reporter
  into
    v_current_status,
    v_reporter_count,
    v_first_reported_at,
    v_created_by_trusted_reporter
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  select
    count(*)::integer,
    coalesce(sum(iuv.reputation_weight), 0)::numeric(10, 2),
    max(iuv.verified_at)
  into
    v_verification_count,
    v_verification_weight,
    v_last_verified_at
  from public.issue_user_verifications as iuv
  where iuv.issue_id = p_issue_id;

  select
    count(*) filter (where ir.report_type = 'solved')::integer,
    count(distinct ir.user_id) filter (where ir.report_type = 'solved')::integer,
    count(*) filter (where ir.report_type = 'false_report')::integer,
    coalesce(
      sum(ir.reputation_weight) filter (where ir.report_type = 'solved'),
      0
    )::numeric(10, 2),
    coalesce(
      sum(ir.reputation_weight) filter (where ir.report_type = 'false_report'),
      0
    )::numeric(10, 2),
    min(ir.created_at) filter (where ir.report_type = 'solved'),
    max(ir.created_at) filter (where ir.report_type = 'solved')
  into
    v_solved_count,
    v_solved_user_count,
    v_false_report_count,
    v_solved_weight,
    v_false_weight,
    v_first_solved_at,
    v_last_solved_at
  from public.issue_reports as ir
  where ir.issue_id = p_issue_id
    and ir.report_type in ('solved', 'false_report');

  select max(activity.activity_at)
  into v_last_opposing_activity_at
  from (
    select iuv.verified_at as activity_at
    from public.issue_user_verifications as iuv
    where iuv.issue_id = p_issue_id

    union all

    select ir.created_at as activity_at
    from public.issue_reports as ir
    where ir.issue_id = p_issue_id
      and ir.report_type in ('created', 'verified', 'damage', 'false_report')

    union all

    select iur.last_reported_at as activity_at
    from public.issue_user_reports as iur
    where iur.issue_id = p_issue_id
      and iur.withdrawn_at is null
  ) as activity;

  v_effective_verification_weight := greatest(
    v_verification_weight - v_false_weight,
    0
  );
  v_effective_solved_weight := greatest(
    v_solved_weight - v_false_weight,
    0
  );

  v_next_status := case
    when v_reporter_count <= 0 then
      'disputed'::public.road_issue_status
    when v_false_weight >= 3.00
      and v_false_weight >= greatest(v_verification_weight, v_solved_weight)
      then 'disputed'::public.road_issue_status
    when v_effective_solved_weight >= 6.00
      and v_solved_user_count >= 2
      and v_last_solved_at is not null
      and now() - v_first_reported_at >= interval '24 hours'
      and coalesce(v_last_opposing_activity_at, v_last_solved_at) <= v_last_solved_at
      then 'solved'::public.road_issue_status
    when v_effective_solved_weight >= 3.00
      and v_last_solved_at is not null
      and coalesce(v_last_opposing_activity_at, v_last_solved_at) <= v_last_solved_at
      then 'likely_solved'::public.road_issue_status
    when v_effective_verification_weight >= 5.00 then
      'active'::public.road_issue_status
    when v_effective_verification_weight >= 2.00 then
      'verified'::public.road_issue_status
    when v_created_by_trusted_reporter
      and v_current_status in ('new', 'verified')
      and v_verification_count = 0
      and v_solved_count = 0
      and v_false_report_count = 0
      then 'verified'::public.road_issue_status
    when v_current_status = 'stale'
      and v_verification_count = 0
      and v_solved_count = 0
      and v_false_report_count = 0
      then 'stale'::public.road_issue_status
    else 'new'::public.road_issue_status
  end;

  update public.road_issues as ri
  set
    verification_count = v_verification_count,
    solved_count = v_solved_count,
    false_report_count = v_false_report_count,
    weighted_verification_score = v_effective_verification_weight,
    weighted_solved_score = v_effective_solved_weight,
    weighted_false_score = v_false_weight,
    first_solved_reported_at = v_first_solved_at,
    last_solved_reported_at = v_last_solved_at,
    last_verified_at = v_last_verified_at,
    last_activity_at = v_last_opposing_activity_at,
    status = v_next_status,
    solved_at = case
      when v_next_status = 'solved' and ri.status is distinct from 'solved'
        then now()
      when v_next_status = 'solved'
        then coalesce(ri.solved_at, now())
      else null
    end,
    updated_at = now()
  where ri.id = p_issue_id;

  return v_next_status;
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
  public_display_name text,
  confirmed_points integer,
  is_trusted_reporter boolean
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
    ),
    coalesce(ust.confirmed_points, 0),
    coalesce(ust.confirmed_points, 0) >= 1000
  from public.road_issues as ri
  left join public.profiles as profile on profile.id = ri.created_by
  left join public.user_score_totals as ust on ust.user_id = ri.created_by
  where ri.id = p_issue_id
    and ri.reporter_count > 0
  limit 1;
$$;

revoke all on function public.user_meets_badge_requirement(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.award_eligible_badges(uuid)
  from public, anon, authenticated;
revoke all on function public.award_badge(uuid)
  from public, anon, authenticated;
grant execute on function public.award_badge(uuid) to authenticated;

revoke all on function public.get_my_badges()
  from public, anon, authenticated;
grant execute on function public.get_my_badges() to authenticated;

revoke all on function public.get_public_issue_reporter_badges(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_issue_reporter_badges(uuid, integer)
  to anon, authenticated;

revoke all on function public.get_public_issue_reporter_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_issue_reporter_identity(uuid)
  to anon, authenticated;

revoke all on function public.apply_trusted_reporter_to_new_issue()
  from public, anon, authenticated;
revoke all on function public.sync_user_badges_after_score_change()
  from public, anon, authenticated;
revoke all on function public.sync_user_badges_after_report_change()
  from public, anon, authenticated;
revoke all on function public.sync_resolution_badges_after_issue_change()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
