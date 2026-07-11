create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.road_issue_category as enum (
  'pothole',
  'collapsed_road',
  'broken_asphalt',
  'manhole_cover',
  'water_accumulation',
  'other'
);

create type public.road_issue_severity as enum (
  'low',
  'medium',
  'high'
);

create type public.road_issue_status as enum (
  'new',
  'verified',
  'active',
  'stale',
  'likely_solved',
  'solved',
  'disputed'
);

create type public.issue_report_type as enum (
  'created',
  'verified',
  'damage',
  'solved',
  'false_report'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  trust_score numeric(10, 2) not null default 0 check (trust_score >= 0),
  created_at timestamptz not null default now()
);

create table public.road_issues (
  id uuid primary key default extensions.gen_random_uuid(),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geog extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
  ) stored,
  category public.road_issue_category not null,
  severity public.road_issue_severity not null,
  status public.road_issue_status not null default 'new',
  first_reported_at timestamptz not null default now(),
  last_verified_at timestamptz,
  verification_count integer not null default 0 check (verification_count >= 0),
  damage_count integer not null default 0 check (damage_count >= 0),
  solved_count integer not null default 0 check (solved_count >= 0),
  false_report_count integer not null default 0 check (false_report_count >= 0),
  trust_score numeric(10, 2) not null default 0 check (trust_score >= 0),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issue_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  issue_id uuid not null references public.road_issues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  report_type public.issue_report_type not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  distance_to_issue_meters numeric(10, 2) not null check (distance_to_issue_meters >= 0),
  has_photo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.issue_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  issue_id uuid not null references public.road_issues (id) on delete cascade,
  report_id uuid not null references public.issue_reports (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index road_issues_geog_idx
  on public.road_issues
  using gist (geog);

create index road_issues_duplicate_lookup_idx
  on public.road_issues
  using gist (geog)
  where status in ('new', 'verified', 'active', 'stale');

create index road_issues_category_status_idx
  on public.road_issues (category, status);

create index road_issues_status_updated_at_idx
  on public.road_issues (status, updated_at desc);

create index road_issues_first_reported_at_idx
  on public.road_issues (first_reported_at asc);

create index road_issues_last_verified_at_idx
  on public.road_issues (last_verified_at desc nulls last);

create index road_issues_verification_count_idx
  on public.road_issues (verification_count desc);

create index road_issues_damage_count_idx
  on public.road_issues (damage_count desc);

create index road_issues_created_by_idx
  on public.road_issues (created_by);

create index issue_reports_issue_created_at_idx
  on public.issue_reports (issue_id, created_at desc);

create index issue_reports_user_created_at_idx
  on public.issue_reports (user_id, created_at desc);

create index issue_reports_type_created_at_idx
  on public.issue_reports (report_type, created_at desc);

create index issue_reports_recent_verification_idx
  on public.issue_reports (issue_id, user_id, created_at desc)
  where report_type in ('created', 'verified');

create unique index issue_reports_one_resolution_signal_per_user_idx
  on public.issue_reports (issue_id, user_id, report_type)
  where report_type in ('damage', 'solved', 'false_report');

create index issue_photos_issue_created_at_idx
  on public.issue_photos (issue_id, created_at desc);

create index issue_photos_report_idx
  on public.issue_photos (report_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_road_issues_updated_at
before update on public.road_issues
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

create or replace function public.validate_issue_coordinates(
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
immutable
as $$
begin
  if p_latitude is null or p_latitude < -90 or p_latitude > 90 then
    raise exception 'invalid_latitude';
  end if;

  if p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid_longitude';
  end if;
end;
$$;

create or replace function public.apply_road_issue_status(p_issue_id uuid)
returns public.road_issue_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.road_issue_status;
begin
  update public.road_issues
  set status = case
    when false_report_count >= verification_count and false_report_count >= 3 then 'disputed'::public.road_issue_status
    when solved_count >= 4 then 'solved'::public.road_issue_status
    when solved_count >= 2 then 'likely_solved'::public.road_issue_status
    when verification_count >= 5 then 'active'::public.road_issue_status
    when verification_count >= 2 then 'verified'::public.road_issue_status
    else 'new'::public.road_issue_status
  end
  where id = p_issue_id
  returning status into v_status;

  return v_status;
end;
$$;

create or replace function public.current_authenticated_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  return v_user_id;
end;
$$;

create or replace function public.create_issue_or_merge_duplicate(
  p_latitude double precision,
  p_longitude double precision,
  p_category public.road_issue_category,
  p_severity public.road_issue_severity,
  p_has_photo boolean default false
)
returns table (
  issue_id uuid,
  report_id uuid,
  merged boolean,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_selected_geog extensions.geography(Point, 4326);
  v_existing_issue public.road_issues%rowtype;
  v_new_issue_id uuid;
  v_report_id uuid;
  v_distance numeric(10, 2);
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  if p_category is null then
    raise exception 'category_required';
  end if;

  if p_severity is null then
    raise exception 'severity_required';
  end if;

  v_selected_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  select *
  into v_existing_issue
  from public.road_issues
  where category = p_category
    and status in ('new', 'verified', 'active', 'stale')
    and extensions.st_dwithin(geog, v_selected_geog, 50)
  order by extensions.st_distance(geog, v_selected_geog), verification_count desc, created_at asc
  limit 1
  for update;

  if found then
    if exists (
      select 1
      from public.issue_reports
      where issue_id = v_existing_issue.id
        and user_id = v_user_id
        and report_type in ('created', 'verified')
        and created_at > now() - interval '24 hours'
    ) then
      raise exception 'recent_verification_exists';
    end if;

    v_distance := round(extensions.st_distance(v_existing_issue.geog, v_selected_geog)::numeric, 2);

    insert into public.issue_reports (
      issue_id,
      user_id,
      report_type,
      latitude,
      longitude,
      distance_to_issue_meters,
      has_photo
    )
    values (
      v_existing_issue.id,
      v_user_id,
      'verified',
      p_latitude,
      p_longitude,
      v_distance,
      coalesce(p_has_photo, false)
    )
    returning id into v_report_id;

    update public.road_issues
    set verification_count = verification_count + 1,
        last_verified_at = now(),
        trust_score = trust_score + 1
    where id = v_existing_issue.id;

    v_status := public.apply_road_issue_status(v_existing_issue.id);

    return query
    select
      v_existing_issue.id,
      v_report_id,
      true,
      v_status,
      v_distance,
      'Benzer bir yol sorunu burada zaten var. Bildirimin mevcut kayda eklendi.';

    return;
  end if;

  insert into public.road_issues (
    latitude,
    longitude,
    category,
    severity,
    status,
    trust_score,
    created_by
  )
  values (
    p_latitude,
    p_longitude,
    p_category,
    p_severity,
    'new',
    1,
    v_user_id
  )
  returning id, status into v_new_issue_id, v_status;

  insert into public.issue_reports (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters,
    has_photo
  )
  values (
    v_new_issue_id,
    v_user_id,
    'created',
    p_latitude,
    p_longitude,
    0,
    coalesce(p_has_photo, false)
  )
  returning id into v_report_id;

  return query
  select
    v_new_issue_id,
    v_report_id,
    false,
    v_status,
    0::numeric,
    'Yol sorunu kaydedildi.';
end;
$$;

create or replace function public.verify_issue(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select *
  into v_issue
  from public.road_issues
  where id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
    raise exception 'proximity_required';
  end if;

  if exists (
    select 1
    from public.issue_reports
    where issue_id = p_issue_id
      and user_id = v_user_id
      and report_type in ('created', 'verified')
      and created_at > now() - interval '24 hours'
  ) then
    raise exception 'recent_verification_exists';
  end if;

  insert into public.issue_reports (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'verified',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning id into v_report_id;

  update public.road_issues
  set verification_count = verification_count + 1,
      last_verified_at = now(),
      trust_score = trust_score + 1
  where id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Doğrulama kaydedildi.';
end;
$$;

create or replace function public.report_damage(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select *
  into v_issue
  from public.road_issues
  where id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports
    where issue_id = p_issue_id
      and user_id = v_user_id
      and report_type = 'damage'
  ) then
    raise exception 'damage_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  insert into public.issue_reports (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'damage',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning id into v_report_id;

  update public.road_issues
  set damage_count = damage_count + 1,
      trust_score = trust_score + 0.5
  where id = p_issue_id
  returning status into v_status;

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Araç hasarı bildirimi kaydedildi.';
end;
$$;

create or replace function public.report_solved(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select *
  into v_issue
  from public.road_issues
  where id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports
    where issue_id = p_issue_id
      and user_id = v_user_id
      and report_type = 'solved'
  ) then
    raise exception 'solved_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
    raise exception 'proximity_required';
  end if;

  insert into public.issue_reports (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'solved',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning id into v_report_id;

  update public.road_issues
  set solved_count = solved_count + 1,
      trust_score = trust_score + 0.5
  where id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Çözülmüş olarak bildirildi.';
end;
$$;

create or replace function public.report_false_issue(
  p_issue_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns table (
  issue_id uuid,
  report_id uuid,
  status public.road_issue_status,
  distance_to_issue_meters numeric,
  message text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_issue public.road_issues%rowtype;
  v_user_geog extensions.geography(Point, 4326);
  v_distance numeric(10, 2);
  v_report_id uuid;
  v_status public.road_issue_status;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.validate_issue_coordinates(p_latitude, p_longitude);

  select *
  into v_issue
  from public.road_issues
  where id = p_issue_id
  for update;

  if not found then
    raise exception 'issue_not_found';
  end if;

  if exists (
    select 1
    from public.issue_reports
    where issue_id = p_issue_id
      and user_id = v_user_id
      and report_type = 'false_report'
  ) then
    raise exception 'false_report_already_exists';
  end if;

  v_user_geog := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;
  v_distance := round(extensions.st_distance(v_issue.geog, v_user_geog)::numeric, 2);

  if v_distance > 150 then
    raise exception 'proximity_required';
  end if;

  insert into public.issue_reports (
    issue_id,
    user_id,
    report_type,
    latitude,
    longitude,
    distance_to_issue_meters
  )
  values (
    p_issue_id,
    v_user_id,
    'false_report',
    p_latitude,
    p_longitude,
    v_distance
  )
  returning id into v_report_id;

  update public.road_issues
  set false_report_count = false_report_count + 1,
      trust_score = greatest(trust_score - 1, 0)
  where id = p_issue_id;

  v_status := public.apply_road_issue_status(p_issue_id);

  return query
  select
    p_issue_id,
    v_report_id,
    v_status,
    v_distance,
    'Yanlış konum veya kayıt bildirimi kaydedildi.';
end;
$$;

create or replace view public.road_issue_public_stats
with (security_invoker = true)
as
select
  id,
  latitude,
  longitude,
  category,
  severity,
  status,
  first_reported_at,
  last_verified_at,
  verification_count,
  damage_count,
  solved_count,
  false_report_count,
  created_at,
  updated_at
from public.road_issues;

alter table public.profiles enable row level security;
alter table public.road_issues enable row level security;
alter table public.issue_reports enable row level security;
alter table public.issue_photos enable row level security;

create policy "Profiles are readable by their owner"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "Users can update their own display name"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Road issues are publicly readable"
on public.road_issues
for select
to anon, authenticated
using (true);

create policy "Users can read their own issue reports"
on public.issue_reports
for select
to authenticated
using (user_id = auth.uid());

create policy "Issue photos are publicly readable"
on public.issue_photos
for select
to anon, authenticated
using (true);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.road_issues from anon, authenticated;
revoke all on table public.issue_reports from anon, authenticated;
revoke all on table public.issue_photos from anon, authenticated;
revoke all on table public.road_issue_public_stats from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant usage on schema extensions to anon, authenticated;

grant usage on type public.road_issue_category to anon, authenticated;
grant usage on type public.road_issue_severity to anon, authenticated;
grant usage on type public.road_issue_status to anon, authenticated;
grant usage on type public.issue_report_type to anon, authenticated;

grant select on public.road_issues to anon, authenticated;
grant select on public.road_issue_public_stats to anon, authenticated;
grant select on public.issue_photos to anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, email, display_name) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

grant select on public.issue_reports to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
revoke all on function public.validate_issue_coordinates(double precision, double precision) from public, anon, authenticated;
revoke all on function public.apply_road_issue_status(uuid) from public, anon, authenticated;
revoke all on function public.current_authenticated_user_id() from public, anon, authenticated;

revoke all on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean
) from public, anon, authenticated;

revoke all on function public.verify_issue(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_damage(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_solved(uuid, double precision, double precision) from public, anon, authenticated;
revoke all on function public.report_false_issue(uuid, double precision, double precision) from public, anon, authenticated;

grant execute on function public.create_issue_or_merge_duplicate(
  double precision,
  double precision,
  public.road_issue_category,
  public.road_issue_severity,
  boolean
) to authenticated;

grant execute on function public.verify_issue(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_damage(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_solved(uuid, double precision, double precision) to authenticated;
grant execute on function public.report_false_issue(uuid, double precision, double precision) to authenticated;
