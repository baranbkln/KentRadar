alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_suspended boolean not null default false;

alter table public.road_issues
  add column if not exists is_hidden boolean not null default false;

create index if not exists profiles_admin_idx
  on public.profiles (id)
  where is_admin = true and is_suspended = false;

create index if not exists profiles_suspended_idx
  on public.profiles (id)
  where is_suspended = true;

create index if not exists road_issues_hidden_idx
  on public.road_issues (is_hidden, updated_at desc);

create table if not exists public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete restrict,
  action_type text not null check (length(btrim(action_type)) > 0),
  target_id uuid not null,
  reason text not null check (
    length(btrim(reason)) between 3 and 2000
  ),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_admin_created_idx
  on public.admin_audit_logs (admin_id, created_at desc);

create index if not exists admin_audit_logs_target_created_idx
  on public.admin_audit_logs (target_id, created_at desc);

create index if not exists admin_audit_logs_action_created_idx
  on public.admin_audit_logs (action_type, created_at desc);

alter table public.admin_audit_logs enable row level security;

create or replace function public.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.is_admin = true
      and p.is_suspended = false
  );
$$;

create or replace function public.is_current_user_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles as p
    where p.id = auth.uid()
      and p.is_suspended = false
  );
$$;

drop policy if exists "Admins can read audit logs"
  on public.admin_audit_logs;
create policy "Admins can read audit logs"
on public.admin_audit_logs
for select
to authenticated
using (public.is_current_user_admin());

drop policy if exists "Admins can read profiles"
  on public.profiles;
create policy "Admins can read profiles"
on public.profiles
for select
to authenticated
using (public.is_current_user_admin());

drop policy if exists "Road issues are publicly readable"
  on public.road_issues;
create policy "Road issues are publicly readable"
on public.road_issues
for select
to anon, authenticated
using (
  is_hidden = false
  or public.is_current_user_admin()
);

drop policy if exists "Active users can insert road issues"
  on public.road_issues;
create policy "Active users can insert road issues"
on public.road_issues
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_current_user_active()
);

drop policy if exists "Active users can insert issue reports"
  on public.issue_reports;
create policy "Active users can insert issue reports"
on public.issue_reports
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_current_user_active()
);

drop policy if exists "Active users can insert issue verifications"
  on public.issue_user_verifications;
create policy "Active users can insert issue verifications"
on public.issue_user_verifications
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_current_user_active()
);

create or replace function public.enforce_active_user_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return new;
  end if;

  if not public.is_current_user_active() then
    raise exception 'account_suspended'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

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
        and ri.is_hidden = false
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
stable
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
    ri.id,
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
    )::integer,
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
    )
  from public.road_issues as ri
  where ri.status = 'solved'::public.road_issue_status
    and ri.is_hidden = false
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
    case when v_period = 'most_reported'
      then ri.reporter_count
    end desc nulls last,
    case when v_period = 'most_reported'
      then ri.verification_count
    end desc nulls last,
    ri.solved_at desc,
    ri.id asc
  limit v_limit
  offset v_offset;
end;
$$;

drop trigger if exists enforce_active_user_road_issue_insert
  on public.road_issues;
create trigger enforce_active_user_road_issue_insert
before insert on public.road_issues
for each row
execute function public.enforce_active_user_insert();

drop trigger if exists enforce_active_user_issue_report_insert
  on public.issue_reports;
create trigger enforce_active_user_issue_report_insert
before insert on public.issue_reports
for each row
execute function public.enforce_active_user_insert();

drop trigger if exists enforce_active_user_verification_insert
  on public.issue_user_verifications;
create trigger enforce_active_user_verification_insert
before insert on public.issue_user_verifications
for each row
execute function public.enforce_active_user_insert();

create or replace function public.admin_moderate_issue(
  p_issue_id uuid,
  p_action text,
  p_reason text
)
returns table (
  issue_id uuid,
  action text,
  status public.road_issue_status,
  is_hidden boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin_id uuid := auth.uid();
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_status public.road_issue_status;
  v_is_hidden boolean;
begin
  if v_admin_id is null or not public.is_current_user_admin() then
    raise exception 'admin_required'
      using errcode = '42501';
  end if;

  if v_action not in ('hide', 'resolve', 'reject') then
    raise exception 'invalid_moderation_action'
      using errcode = '22023';
  end if;

  if length(v_reason) < 3 or length(v_reason) > 2000 then
    raise exception 'invalid_moderation_reason'
      using errcode = '22023';
  end if;

  perform 1
  from public.road_issues as ri
  where ri.id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found'
      using errcode = 'P0002';
  end if;

  update public.road_issues as ri
  set
    is_hidden = case
      when v_action = 'resolve' then false
      else true
    end,
    status = case
      when v_action = 'resolve'
        then 'solved'::public.road_issue_status
      else 'disputed'::public.road_issue_status
    end,
    solved_at = case
      when v_action = 'resolve' then coalesce(ri.solved_at, now())
      else ri.solved_at
    end,
    updated_at = now()
  where ri.id = p_issue_id
  returning ri.status, ri.is_hidden
  into v_status, v_is_hidden;

  insert into public.admin_audit_logs (
    admin_id,
    action_type,
    target_id,
    reason
  )
  values (
    v_admin_id,
    case v_action
      when 'hide' then 'hide_issue'
      when 'resolve' then 'resolve_issue'
      else 'reject_issue'
    end,
    p_issue_id,
    v_reason
  );

  return query
  select p_issue_id, v_action, v_status, v_is_hidden;
end;
$$;

create or replace function public.admin_suspend_user(
  p_target_user_id uuid,
  p_reason text
)
returns table (
  target_user_id uuid,
  is_suspended boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_admin_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_admin_id is null or not public.is_current_user_admin() then
    raise exception 'admin_required'
      using errcode = '42501';
  end if;

  if p_target_user_id is null then
    raise exception 'target_user_required'
      using errcode = '22023';
  end if;

  if p_target_user_id = v_admin_id then
    raise exception 'cannot_suspend_self'
      using errcode = '22023';
  end if;

  if length(v_reason) < 3 or length(v_reason) > 2000 then
    raise exception 'invalid_moderation_reason'
      using errcode = '22023';
  end if;

  update public.profiles as p
  set is_suspended = true
  where p.id = p_target_user_id;

  if not found then
    raise exception 'user_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.admin_audit_logs (
    admin_id,
    action_type,
    target_id,
    reason
  )
  values (
    v_admin_id,
    'suspend_user',
    p_target_user_id,
    v_reason
  );

  return query
  select p_target_user_id, true;
end;
$$;

create or replace view public.road_issue_public_stats
with (security_invoker = true)
as
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
  ri.created_at,
  ri.updated_at,
  ri.reporter_count,
  ri.severity_score_avg,
  public.count_issue_watchers(ri.id) as watcher_count
from public.road_issues as ri
where ri.reporter_count > 0
  and (
    ri.is_hidden = false
    or public.is_current_user_admin()
  );

create or replace function public.get_public_issues_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom integer,
  p_category_filter text,
  p_status_filter text
)
returns table (
  result_type text,
  id uuid,
  cluster_id text,
  cluster_count integer,
  cluster_min_latitude double precision,
  cluster_min_longitude double precision,
  cluster_max_latitude double precision,
  cluster_max_longitude double precision,
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
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_envelope extensions.geography;
  v_category_filters text[];
  v_status_filters text[];
  v_grid_size_meters double precision;
begin
  if p_min_lat is null
    or p_max_lat is null
    or p_min_lat < -90
    or p_max_lat > 90
    or p_min_lat >= p_max_lat
  then
    raise exception 'invalid_latitude_bounds' using errcode = '22023';
  end if;

  if p_min_lng is null
    or p_max_lng is null
    or p_min_lng < -180
    or p_max_lng > 180
    or p_min_lng >= p_max_lng
  then
    raise exception 'invalid_longitude_bounds' using errcode = '22023';
  end if;

  if p_zoom is null or p_zoom < 0 or p_zoom > 22 then
    raise exception 'invalid_map_zoom' using errcode = '22023';
  end if;

  v_envelope := extensions.st_makeenvelope(
    p_min_lng,
    p_min_lat,
    p_max_lng,
    p_max_lat,
    4326
  )::extensions.geography;

  v_category_filters := case
    when nullif(btrim(p_category_filter), '') is null
      or lower(btrim(p_category_filter)) = 'all'
      then null
    else regexp_split_to_array(p_category_filter, '\s*,\s*')
  end;

  v_status_filters := case
    when nullif(btrim(p_status_filter), '') is null
      or lower(btrim(p_status_filter)) = 'all'
      then null
    else regexp_split_to_array(p_status_filter, '\s*,\s*')
  end;

  if p_zoom < 10 then
    v_grid_size_meters := case
      when p_zoom <= 4 then 300000
      when p_zoom = 5 then 150000
      when p_zoom = 6 then 80000
      when p_zoom = 7 then 40000
      when p_zoom = 8 then 20000
      else 10000
    end;

    return query
    with filtered_issues as materialized (
      select
        ri.id as issue_id,
        ri.latitude as issue_latitude,
        ri.longitude as issue_longitude,
        extensions.st_transform(
          ri.geog::extensions.geometry,
          3857
        ) as point_3857
      from public.road_issues as ri
      where ri.reporter_count > 0
        and ri.is_hidden = false
        and ri.latitude > p_min_lat
        and ri.latitude < p_max_lat
        and ri.longitude > p_min_lng
        and ri.longitude < p_max_lng
        and extensions.st_intersects(ri.geog, v_envelope)
        and (
          v_category_filters is null
          or ri.category::text = any(v_category_filters)
        )
        and (
          v_status_filters is null
          or ri.status::text = any(v_status_filters)
        )
    ),
    grid_members as (
      select
        fi.issue_id,
        fi.issue_latitude,
        fi.issue_longitude,
        floor(
          extensions.st_x(fi.point_3857) / v_grid_size_meters
        )::bigint as grid_x,
        floor(
          extensions.st_y(fi.point_3857) / v_grid_size_meters
        )::bigint as grid_y
      from filtered_issues as fi
    ),
    grid_clusters as (
      select
        gm.grid_x,
        gm.grid_y,
        count(*)::integer as issue_count,
        avg(gm.issue_latitude)::double precision as center_latitude,
        avg(gm.issue_longitude)::double precision as center_longitude,
        min(gm.issue_latitude)::double precision as min_latitude,
        min(gm.issue_longitude)::double precision as min_longitude,
        max(gm.issue_latitude)::double precision as max_latitude,
        max(gm.issue_longitude)::double precision as max_longitude
      from grid_members as gm
      group by gm.grid_x, gm.grid_y
    )
    select
      'cluster'::text,
      null::uuid,
      concat('z', p_zoom, ':', gc.grid_x, ':', gc.grid_y)::text,
      gc.issue_count,
      gc.min_latitude,
      gc.min_longitude,
      gc.max_latitude,
      gc.max_longitude,
      gc.center_latitude,
      gc.center_longitude,
      null::text,
      null::text,
      null::text,
      null::text,
      null::public.road_issue_category,
      null::public.road_issue_severity,
      null::public.road_issue_status,
      null::timestamptz,
      null::timestamptz,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::integer,
      null::numeric,
      null::timestamptz,
      null::timestamptz
    from grid_clusters as gc
    order by gc.issue_count desc, gc.grid_x, gc.grid_y;

    return;
  end if;

  return query
  select
    'issue'::text,
    ri.id,
    null::text,
    1::integer,
    ri.latitude,
    ri.longitude,
    ri.latitude,
    ri.longitude,
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
    ri.updated_at
  from public.road_issues as ri
  where ri.reporter_count > 0
    and ri.is_hidden = false
    and ri.latitude > p_min_lat
    and ri.latitude < p_max_lat
    and ri.longitude > p_min_lng
    and ri.longitude < p_max_lng
    and extensions.st_intersects(ri.geog, v_envelope)
    and (
      v_category_filters is null
      or ri.category::text = any(v_category_filters)
    )
    and (
      v_status_filters is null
      or ri.status::text = any(v_status_filters)
    )
  order by
    ri.last_verified_at desc nulls last,
    ri.created_at desc,
    ri.id;
end;
$$;

revoke all on table public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;

revoke all on function public.is_current_user_admin()
  from public, anon, authenticated;
grant execute on function public.is_current_user_admin()
  to anon, authenticated;
revoke all on function public.is_current_user_active()
  from public, anon, authenticated;
grant execute on function public.is_current_user_active()
  to authenticated;
revoke all on function public.enforce_active_user_insert()
  from public, anon, authenticated;

revoke all on function public.admin_moderate_issue(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_moderate_issue(uuid, text, text)
  to authenticated;

revoke all on function public.admin_suspend_user(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_suspend_user(uuid, text)
  to authenticated;

grant select on public.road_issue_public_stats to anon, authenticated;

notify pgrst, 'reload schema';
