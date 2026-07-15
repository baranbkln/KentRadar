create table if not exists public.admin_boundaries (
  id uuid primary key default gen_random_uuid(),
  admin_level text not null
    check (admin_level in ('city', 'district', 'neighborhood')),
  name text not null check (length(btrim(name)) > 0),
  parent_id uuid references public.admin_boundaries (id) on delete restrict,
  geom extensions.geometry(MultiPolygon, 4326) not null
);

create index if not exists admin_boundaries_geom_gist_idx
  on public.admin_boundaries
  using gist (geom);

create index if not exists admin_boundaries_admin_level_idx
  on public.admin_boundaries (admin_level);

create index if not exists admin_boundaries_name_idx
  on public.admin_boundaries (name);

create index if not exists admin_boundaries_parent_id_idx
  on public.admin_boundaries (parent_id);

alter table public.admin_boundaries enable row level security;

revoke all on table public.admin_boundaries from anon, authenticated;
grant all on table public.admin_boundaries to service_role;

alter table public.road_issues
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists neighborhood text;

create or replace function public.assign_road_issue_admin_boundaries()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_point extensions.geometry(Point, 4326);
  v_city_id uuid;
  v_district_id uuid;
begin
  new.city := null;
  new.district := null;
  new.neighborhood := null;

  if new.latitude is null
    or new.longitude is null
    or new.latitude < -90
    or new.latitude > 90
    or new.longitude < -180
    or new.longitude > 180
  then
    return new;
  end if;

  v_point := extensions.st_setsrid(
    extensions.st_makepoint(new.longitude, new.latitude),
    4326
  );

  select
    ab.id,
    ab.name
  into
    v_city_id,
    new.city
  from public.admin_boundaries as ab
  where ab.admin_level = 'city'
    and ab.geom && v_point
    and extensions.st_intersects(ab.geom, v_point)
  order by extensions.st_area(ab.geom) asc, ab.id
  limit 1;

  select
    ab.id,
    ab.name
  into
    v_district_id,
    new.district
  from public.admin_boundaries as ab
  where ab.admin_level = 'district'
    and ab.geom && v_point
    and extensions.st_intersects(ab.geom, v_point)
  order by
    case when ab.parent_id = v_city_id then 0 else 1 end,
    extensions.st_area(ab.geom) asc,
    ab.id
  limit 1;

  select ab.name
  into new.neighborhood
  from public.admin_boundaries as ab
  where ab.admin_level = 'neighborhood'
    and ab.geom && v_point
    and extensions.st_intersects(ab.geom, v_point)
  order by
    case when ab.parent_id = v_district_id then 0 else 1 end,
    extensions.st_area(ab.geom) asc,
    ab.id
  limit 1;

  return new;
end;
$$;

drop trigger if exists assign_road_issue_admin_boundaries_trigger
  on public.road_issues;

create trigger assign_road_issue_admin_boundaries_trigger
before insert or update of latitude, longitude on public.road_issues
for each row
execute function public.assign_road_issue_admin_boundaries();

create or replace function public.backfill_road_issues_boundaries()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_issue record;
  v_updated_count integer := 0;
begin
  for v_issue in
    select ri.id
    from public.road_issues as ri
    where ri.city is null
    order by ri.id
    for update skip locked
  loop
    update public.road_issues as ri
    set
      latitude = ri.latitude,
      longitude = ri.longitude
    where ri.id = v_issue.id;

    v_updated_count := v_updated_count + 1;
  end loop;

  return v_updated_count;
end;
$$;

revoke all on function public.assign_road_issue_admin_boundaries()
  from public, anon, authenticated;

revoke all on function public.backfill_road_issues_boundaries()
  from public, anon, authenticated;
grant execute on function public.backfill_road_issues_boundaries()
  to service_role;

notify pgrst, 'reload schema';
