create table public.clans (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  tag text not null,
  logo_style text not null default 'shield',
  color_theme text not null default 'slate',
  created_by uuid not null references public.profiles (id) on delete restrict,
  total_score integer not null default 0 check (total_score >= 0),
  created_at timestamptz not null default now(),
  constraint clans_name_format_check
    check (name ~ '^[a-zA-Z0-9]{3,20}$'),
  constraint clans_tag_format_check
    check (tag ~ '^[A-Z0-9]{3,4}$')
);

create unique index clans_name_lower_unique_idx
  on public.clans (lower(name));

create unique index clans_tag_upper_unique_idx
  on public.clans (upper(tag));

create index clans_total_score_idx
  on public.clans (total_score desc, created_at asc, id);

create table public.clan_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  clan_id uuid not null references public.clans (id) on delete cascade,
  role text not null default 'member'
    check (role in ('leader', 'officer', 'member')),
  joined_at timestamptz not null default now()
);

create index clan_members_clan_joined_idx
  on public.clan_members (clan_id, joined_at asc, user_id);

create unique index clan_members_one_leader_idx
  on public.clan_members (clan_id)
  where role = 'leader';

alter table public.clans enable row level security;
alter table public.clan_members enable row level security;

create policy "Clans are publicly readable"
on public.clans
for select
to anon, authenticated
using (true);

create policy "Clan memberships are publicly readable"
on public.clan_members
for select
to anon, authenticated
using (true);

revoke all on table public.clans from anon, authenticated;
revoke all on table public.clan_members from anon, authenticated;
grant select on table public.clans to anon, authenticated;
grant select on table public.clan_members to anon, authenticated;

create or replace function public.refresh_clan_total_score(p_clan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_score bigint;
begin
  if p_clan_id is null then
    return;
  end if;

  select coalesce(sum(ust.confirmed_points), 0)::bigint
  into v_total_score
  from public.clan_members as cm
  left join public.user_score_totals as ust on ust.user_id = cm.user_id
  where cm.clan_id = p_clan_id;

  update public.clans as clan
  set total_score = least(greatest(v_total_score, 0), 2147483647)::integer
  where clan.id = p_clan_id;
end;
$$;

create or replace function public.sync_clan_score_after_membership_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_clan_total_score(old.clan_id);
    return old;
  end if;

  perform public.refresh_clan_total_score(new.clan_id);

  if tg_op = 'UPDATE' and old.clan_id is distinct from new.clan_id then
    perform public.refresh_clan_total_score(old.clan_id);
  end if;

  return new;
end;
$$;

create trigger sync_clan_score_after_membership_change
after insert or update or delete on public.clan_members
for each row
execute function public.sync_clan_score_after_membership_change();

create or replace function public.sync_clan_score_after_user_total_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_clan_id uuid;
  v_new_clan_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select cm.clan_id
    into v_old_clan_id
    from public.clan_members as cm
    where cm.user_id = old.user_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    select cm.clan_id
    into v_new_clan_id
    from public.clan_members as cm
    where cm.user_id = new.user_id;
  end if;

  if v_old_clan_id is not null then
    perform public.refresh_clan_total_score(v_old_clan_id);
  end if;

  if v_new_clan_id is not null
    and v_new_clan_id is distinct from v_old_clan_id
  then
    perform public.refresh_clan_total_score(v_new_clan_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger sync_clan_score_after_user_total_change
after insert or update or delete on public.user_score_totals
for each row
execute function public.sync_clan_score_after_user_total_change();

create or replace function public.create_clan(
  p_name text,
  p_tag text
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

  if not public.is_username_clean(v_name)
    or not public.is_username_clean(v_tag)
  then
    raise exception 'clan_name_not_allowed';
  end if;

  insert into public.clans (
    name,
    tag,
    created_by
  )
  values (
    v_name,
    v_tag,
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

create or replace function public.join_clan(p_clan_id uuid)
returns void
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

  perform 1
  from public.clans as clan
  where clan.id = p_clan_id
  for update;

  if not found then
    raise exception 'clan_not_found';
  end if;

  insert into public.clan_members (
    user_id,
    clan_id,
    role
  )
  values (
    v_user_id,
    p_clan_id,
    'member'
  );
exception
  when unique_violation then
    raise exception 'already_in_clan';
end;
$$;

create or replace function public.leave_clan()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_clan_id uuid;
  v_role text;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select
    cm.clan_id,
    cm.role
  into
    v_clan_id,
    v_role
  from public.clan_members as cm
  where cm.user_id = v_user_id
  for update;

  if not found then
    raise exception 'not_in_clan';
  end if;

  perform 1
  from public.clans as clan
  where clan.id = v_clan_id
  for update;

  if v_role = 'leader' then
    select count(*)::integer
    into v_member_count
    from public.clan_members as cm
    where cm.clan_id = v_clan_id;

    if v_member_count > 1 then
      raise exception 'clan_leader_cannot_leave';
    end if;

    delete from public.clans as clan
    where clan.id = v_clan_id;

    return;
  end if;

  delete from public.clan_members as cm
  where cm.user_id = v_user_id;
end;
$$;

revoke all on function public.refresh_clan_total_score(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_clan_score_after_membership_change()
  from public, anon, authenticated;
revoke all on function public.sync_clan_score_after_user_total_change()
  from public, anon, authenticated;

revoke all on function public.create_clan(text, text)
  from public, anon, authenticated;
grant execute on function public.create_clan(text, text)
  to authenticated;

revoke all on function public.join_clan(uuid)
  from public, anon, authenticated;
grant execute on function public.join_clan(uuid)
  to authenticated;

revoke all on function public.leave_clan()
  from public, anon, authenticated;
grant execute on function public.leave_clan()
  to authenticated;

notify pgrst, 'reload schema';
