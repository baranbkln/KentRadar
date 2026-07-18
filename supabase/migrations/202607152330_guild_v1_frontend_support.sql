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

create or replace function public.get_public_clan_members(p_clan_id uuid)
returns table (
  user_public_code text,
  public_display_name text,
  username text,
  avatar_style text,
  role text,
  joined_at timestamptz,
  confirmed_points integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    upper(right(replace(cm.user_id::text, '-', ''), 4)),
    coalesce(
      nullif(profile.username, ''),
      concat(
        'Katkıcı #',
        upper(right(replace(cm.user_id::text, '-', ''), 4))
      )
    ),
    profile.username,
    coalesce(profile.avatar_style, 'cyan_user'),
    cm.role,
    cm.joined_at,
    coalesce(ust.confirmed_points, 0)
  from public.clan_members as cm
  left join public.profiles as profile on profile.id = cm.user_id
  left join public.user_score_totals as ust on ust.user_id = cm.user_id
  where cm.clan_id = p_clan_id
    and coalesce(profile.is_suspended, false) = false
  order by
    case cm.role
      when 'leader' then 1
      when 'officer' then 2
      else 3
    end,
    coalesce(ust.confirmed_points, 0) desc,
    cm.joined_at asc;
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
  clan_tag text,
  clan_color_theme text
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
    clan.tag,
    clan.color_theme
  from public.road_issues as ri
  left join public.profiles as profile on profile.id = ri.created_by
  left join public.clan_members as cm on cm.user_id = ri.created_by
  left join public.clans as clan on clan.id = cm.clan_id
  where ri.id = p_issue_id
    and ri.reporter_count > 0
  limit 1;
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
  avatar_style text,
  clan_tag text,
  clan_color_theme text
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
    current_period.rank_cache as rank,
    coalesce(
      nullif(profile.username, ''),
      concat(
        'Katkıcı #',
        upper(right(replace(current_period.user_id::text, '-', ''), 4))
      )
    ) as public_display_name,
    public.calculate_score_level(
      coalesce(all_time.confirmed_points, current_period.confirmed_points)
    ) as level_label,
    current_period.confirmed_points as points,
    v_period as period,
    current_period.user_id = v_current_user_id as is_current_user,
    upper(right(replace(current_period.user_id::text, '-', ''), 4))
      as user_public_code,
    profile.username,
    coalesce(profile.avatar_style, 'cyan_user') as avatar_style,
    clan.tag as clan_tag,
    clan.color_theme as clan_color_theme
  from public.user_score_period_totals as current_period
  left join public.user_score_period_totals as all_time
    on all_time.user_id = current_period.user_id
    and all_time.period_type = 'all_time'
    and all_time.period_start = public.score_period_start('all_time')
  left join public.profiles as profile
    on profile.id = current_period.user_id
  left join public.clan_members as cm
    on cm.user_id = current_period.user_id
  left join public.clans as clan
    on clan.id = cm.clan_id
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

revoke all on function public.create_clan(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_clan(text, text, text, text)
  to authenticated;

revoke all on function public.create_clan(text, text)
  from public, anon, authenticated;
grant execute on function public.create_clan(text, text)
  to authenticated;

revoke all on function public.get_public_clan_members(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_clan_members(uuid)
  to anon, authenticated;

revoke all on function public.get_public_issue_reporter_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_issue_reporter_identity(uuid)
  to anon, authenticated;

revoke all on function public.get_public_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
