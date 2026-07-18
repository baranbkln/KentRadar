create or replace function public.get_my_command_center()
returns table (
  confirmed_points integer,
  pending_points integer,
  level_label text,
  global_rank integer,
  current_streak_days integer,
  longest_streak_days integer,
  clan_id uuid,
  clan_name text,
  clan_tag text,
  clan_logo_style text,
  clan_color_theme text,
  clan_total_score integer
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
    clan.id,
    clan.name,
    clan.tag,
    clan.logo_style,
    clan.color_theme,
    coalesce(clan.total_score, 0)
  from public.profiles as profile
  left join public.user_score_totals as ust
    on ust.user_id = profile.id
  left join public.user_score_period_totals as period_total
    on period_total.user_id = profile.id
    and period_total.period_type = 'all_time'
    and period_total.period_start = public.score_period_start('all_time')
  left join public.clan_members as cm
    on cm.user_id = profile.id
  left join public.clans as clan
    on clan.id = cm.clan_id
  where profile.id = v_user_id
  limit 1;
end;
$$;

create or replace function public.create_clan(
  p_name text,
  p_tag text,
  p_logo_style text,
  p_color_theme text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_tag text := upper(btrim(p_tag));
  v_logo_style text := lower(btrim(p_logo_style));
  v_color_theme text := lower(btrim(p_color_theme));
  v_global_rank integer;
  v_clan_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_user_id
      and profile.is_suspended = false
  ) then
    raise exception 'account_not_active';
  end if;

  if exists (
    select 1
    from public.clan_members as cm
    where cm.user_id = v_user_id
  ) then
    raise exception 'already_in_clan';
  end if;

  select nullif(period_total.rank_cache, 0)
  into v_global_rank
  from public.user_score_period_totals as period_total
  where period_total.user_id = v_user_id
    and period_total.period_type = 'all_time'
    and period_total.period_start = public.score_period_start('all_time');

  if v_global_rank is null or v_global_rank > 3 then
    raise exception 'Klan kurmak için genel sıralamada ilk 3''te olmalısınız! (Premium özellik yakında)';
  end if;

  if v_name is null or v_name !~ '^[a-zA-Z0-9]{3,20}$' then
    raise exception 'invalid_clan_name';
  end if;

  if v_tag is null or v_tag !~ '^[A-Z0-9]{3,4}$' then
    raise exception 'invalid_clan_tag';
  end if;

  if v_logo_style not in ('shield', 'swords', 'castle') then
    raise exception 'invalid_clan_logo';
  end if;

  if v_color_theme not in ('rose', 'indigo', 'emerald', 'amber', 'slate') then
    raise exception 'invalid_clan_color';
  end if;

  if not public.is_username_clean(v_name)
    or not public.is_username_clean(v_tag)
  then
    raise exception 'clan_name_not_allowed';
  end if;

  insert into public.clans (
    name,
    tag,
    logo_style,
    color_theme,
    created_by
  )
  values (
    v_name,
    v_tag,
    v_logo_style,
    v_color_theme,
    v_user_id
  )
  returning id into v_clan_id;

  insert into public.clan_members (
    user_id,
    clan_id,
    role
  )
  values (
    v_user_id,
    v_clan_id,
    'leader'
  );

  return v_clan_id;
exception
  when unique_violation then
    if exists (
      select 1
      from public.clans as clan
      where lower(clan.name) = lower(v_name)
    ) then
      raise exception 'clan_name_taken';
    end if;

    if exists (
      select 1
      from public.clans as clan
      where upper(clan.tag) = v_tag
    ) then
      raise exception 'clan_tag_taken';
    end if;

    raise exception 'already_in_clan';
end;
$$;

create or replace function public.create_clan(
  p_name text,
  p_tag text
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.create_clan(p_name, p_tag, 'shield', 'slate');
$$;

revoke all on function public.get_my_command_center()
  from public, anon, authenticated;
grant execute on function public.get_my_command_center()
  to authenticated;

revoke all on function public.create_clan(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_clan(text, text, text, text)
  to authenticated;

revoke all on function public.create_clan(text, text)
  from public, anon, authenticated;
grant execute on function public.create_clan(text, text)
  to authenticated;

notify pgrst, 'reload schema';
