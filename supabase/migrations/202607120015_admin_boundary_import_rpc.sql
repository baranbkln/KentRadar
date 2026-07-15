create or replace function public.insert_admin_boundary(
  p_name text,
  p_level text,
  p_parent_id uuid,
  p_geojson_geom text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_name text := btrim(p_name);
  v_geom extensions.geometry(MultiPolygon, 4326);
  v_boundary_id uuid;
  v_parent_level text;
begin
  if v_name is null or length(v_name) = 0 then
    raise exception using
      errcode = '22023',
      message = 'boundary_name_required';
  end if;

  if p_level not in ('city', 'district', 'neighborhood') then
    raise exception using
      errcode = '22023',
      message = 'invalid_admin_level';
  end if;

  if p_level = 'city' and p_parent_id is not null then
    raise exception using
      errcode = '22023',
      message = 'city_parent_must_be_null';
  end if;

  if p_level in ('district', 'neighborhood') then
    if p_parent_id is null then
      raise exception using
        errcode = '22023',
        message = 'boundary_parent_required';
    end if;

    select ab.admin_level
    into v_parent_level
    from public.admin_boundaries as ab
    where ab.id = p_parent_id;

    if v_parent_level is null then
      raise exception using
        errcode = '23503',
        message = 'boundary_parent_not_found';
    end if;

    if (p_level = 'district' and v_parent_level <> 'city')
      or (p_level = 'neighborhood' and v_parent_level <> 'district')
    then
      raise exception using
        errcode = '22023',
        message = 'invalid_boundary_parent_level';
    end if;
  end if;

  begin
    v_geom := extensions.st_multi(
      extensions.st_collectionextract(
        extensions.st_makevalid(
          extensions.st_force2d(
            extensions.st_setsrid(
              extensions.st_geomfromgeojson(p_geojson_geom),
              4326
            )
          )
        ),
        3
      )
    )::extensions.geometry(MultiPolygon, 4326);
  exception
    when others then
      raise exception using
        errcode = '22023',
        message = 'invalid_geojson_geometry';
  end;

  if v_geom is null or extensions.st_isempty(v_geom) then
    raise exception using
      errcode = '22023',
      message = 'empty_polygon_geometry';
  end if;

  select ab.id
  into v_boundary_id
  from public.admin_boundaries as ab
  where ab.admin_level = p_level
    and lower(ab.name) = lower(v_name)
    and ab.parent_id is not distinct from p_parent_id
  order by ab.id
  limit 1
  for update;

  if v_boundary_id is null then
    insert into public.admin_boundaries (
      admin_level,
      name,
      parent_id,
      geom
    )
    values (
      p_level,
      v_name,
      p_parent_id,
      v_geom
    )
    returning id into v_boundary_id;
  else
    update public.admin_boundaries as ab
    set
      name = v_name,
      geom = v_geom
    where ab.id = v_boundary_id;
  end if;

  return v_boundary_id;
end;
$$;

revoke all on function public.insert_admin_boundary(text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.insert_admin_boundary(text, text, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
