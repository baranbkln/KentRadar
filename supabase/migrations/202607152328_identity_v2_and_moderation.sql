alter table public.profiles
  add column if not exists username text,
  add column if not exists avatar_style text not null default 'cyan_user',
  add column if not exists is_premium boolean not null default false;

update public.profiles
set avatar_style = 'cyan_user'
where avatar_style is null or avatar_style = 'default';

alter table public.profiles
  alter column avatar_style set default 'cyan_user',
  alter column avatar_style set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_format_check
      check (username is null or username ~ '^[a-zA-Z0-9_]{3,15}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_avatar_style_check'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_style_check
      check (avatar_style in ('cyan_user', 'amber_shield', 'emerald_compass', 'slate_wrench'));
  end if;
end;
$$;

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null;

create table if not exists public.banned_words (
  word text primary key,
  created_at timestamptz not null default now()
);

insert into public.banned_words (word)
values
  ('kurdistan'),
  ('pkk'),
  ('teror'),
  ('kufur_placeholder_1'),
  ('kufur_placeholder_2')
on conflict do nothing;

create or replace function public.is_username_clean(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.banned_words as bw
    where lower(regexp_replace(p_username, '[^a-zA-Z0-9]', '', 'g'))
      like '%' || lower(bw.word) || '%'
  );
$$;

create or replace function public.update_player_profile(
  p_username text,
  p_avatar_style text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_username text := btrim(p_username);
begin
  if v_caller_id is null then
    raise exception 'Oturum açmanız gerekiyor.';
  end if;

  if v_username is null or v_username !~ '^[a-zA-Z0-9_]{3,15}$' then
    raise exception 'Kullanıcı adı 3-15 karakter olmalı; yalnızca harf, rakam ve alt çizgi içerebilir.';
  end if;

  if p_avatar_style is null or p_avatar_style not in (
    'cyan_user',
    'amber_shield',
    'emerald_compass',
    'slate_wrench'
  ) then
    raise exception 'Geçersiz avatar seçimi.';
  end if;

  if not public.is_username_clean(v_username) then
    raise exception 'Bu kullanıcı adı yasaklı kelime içeriyor.';
  end if;

  insert into public.profiles (id, username, avatar_style)
  values (v_caller_id, v_username, p_avatar_style)
  on conflict (id) do update
  set username = excluded.username,
      avatar_style = excluded.avatar_style;
exception
  when unique_violation then
    raise exception 'Bu kullanıcı adı zaten alınmış.';
end;
$$;

create table if not exists public.moderation_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'clan', 'issue')),
  target_id uuid not null,
  reason text not null,
  description text not null,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.moderation_reports
  add column if not exists description text;

update public.moderation_reports
set description = reason
where description is null;

alter table public.moderation_reports
  alter column description set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'moderation_reports_description_length_check'
  ) then
    alter table public.moderation_reports
      add constraint moderation_reports_description_length_check
      check (char_length(btrim(description)) between 10 and 1000);
  end if;
end;
$$;

create index if not exists moderation_reports_status_created_idx
  on public.moderation_reports (status, created_at desc);

create index if not exists moderation_reports_reporter_created_idx
  on public.moderation_reports (reporter_id, created_at desc);

create unique index if not exists moderation_reports_one_pending_target_idx
  on public.moderation_reports (reporter_id, target_type, target_id)
  where status = 'pending';

alter table public.moderation_reports enable row level security;

drop policy if exists "Authenticated users can create moderation reports"
  on public.moderation_reports;
create policy "Authenticated users can create moderation reports"
on public.moderation_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
  and status = 'pending'
  and not exists (
    select 1
    from public.profiles as caller
    where caller.id = auth.uid()
      and caller.is_suspended = true
  )
);

drop policy if exists "Admins can read moderation reports"
  on public.moderation_reports;
create policy "Admins can read moderation reports"
on public.moderation_reports
for select
to authenticated
using (public.is_current_user_admin());

drop policy if exists "Admins can update moderation reports"
  on public.moderation_reports;
create policy "Admins can update moderation reports"
on public.moderation_reports
for update
to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

drop policy if exists "Anyone authenticated can create a report"
  on public.moderation_reports;
drop policy if exists "Only admins can view or update reports"
  on public.moderation_reports;

grant insert, select, update on public.moderation_reports to authenticated;

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
  avatar_style text
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
    coalesce(profile.avatar_style, 'cyan_user') as avatar_style
  from public.user_score_period_totals as current_period
  left join public.user_score_period_totals as all_time
    on all_time.user_id = current_period.user_id
    and all_time.period_type = 'all_time'
    and all_time.period_start = public.score_period_start('all_time')
  left join public.profiles as profile
    on profile.id = current_period.user_id
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

create or replace function public.get_public_issue_reporter_identity(
  p_issue_id uuid
)
returns table (
  target_user_id uuid,
  username text,
  avatar_style text,
  public_display_name text
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
    )
  from public.road_issues as ri
  left join public.profiles as profile on profile.id = ri.created_by
  where ri.id = p_issue_id
    and ri.reporter_count > 0
  limit 1;
$$;

revoke all on function public.is_username_clean(text)
  from public, anon, authenticated;
revoke all on function public.update_player_profile(text, text)
  from public, anon, authenticated;
grant execute on function public.update_player_profile(text, text)
  to authenticated;

revoke all on function public.get_public_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(text, integer, integer)
  to anon, authenticated;

revoke all on function public.get_public_issue_reporter_identity(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_issue_reporter_identity(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
