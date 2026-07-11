create table if not exists public.issue_watchers (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.road_issues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  notification_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint issue_watchers_issue_user_key unique (issue_id, user_id)
);

create index if not exists issue_watchers_issue_id_idx
  on public.issue_watchers (issue_id);

create index if not exists issue_watchers_user_id_idx
  on public.issue_watchers (user_id);

create index if not exists issue_watchers_created_at_idx
  on public.issue_watchers (created_at desc);

alter table public.issue_watchers enable row level security;

drop policy if exists "Users can read their own issue watchers" on public.issue_watchers;
create policy "Users can read their own issue watchers"
on public.issue_watchers
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own issue watchers" on public.issue_watchers;
create policy "Users can insert their own issue watchers"
on public.issue_watchers
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own issue watchers" on public.issue_watchers;
create policy "Users can update their own issue watchers"
on public.issue_watchers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own issue watchers" on public.issue_watchers;
create policy "Users can delete their own issue watchers"
on public.issue_watchers
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.touch_issue_watchers_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists issue_watchers_touch_updated_at on public.issue_watchers;
create trigger issue_watchers_touch_updated_at
before update on public.issue_watchers
for each row
execute function public.touch_issue_watchers_updated_at();

create or replace function public.count_issue_watchers(p_issue_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.issue_watchers as iw
  where iw.issue_id = p_issue_id;
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
where ri.reporter_count > 0;

create or replace function public.follow_issue(p_issue_id uuid)
returns table (
  issue_id uuid,
  is_watching boolean,
  notification_enabled boolean,
  watcher_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1
    from public.road_issues as ri
    where ri.id = p_issue_id
      and ri.reporter_count > 0
  ) then
    raise exception 'issue_not_found';
  end if;

  insert into public.issue_watchers as iw (
    issue_id,
    user_id,
    notification_enabled
  )
  values (
    p_issue_id,
    v_user_id,
    true
  )
  on conflict (issue_id, user_id)
  do update set
    notification_enabled = true,
    updated_at = now();

  return query
  select
    p_issue_id,
    true,
    true,
    (
      select count(*)::integer
      from public.issue_watchers as iw
      where iw.issue_id = p_issue_id
    );
end;
$$;

create or replace function public.unfollow_issue(p_issue_id uuid)
returns table (
  issue_id uuid,
  is_watching boolean,
  notification_enabled boolean,
  watcher_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  delete from public.issue_watchers as iw
  where iw.issue_id = p_issue_id
    and iw.user_id = v_user_id;

  return query
  select
    p_issue_id,
    false,
    false,
    (
      select count(*)::integer
      from public.issue_watchers as iw
      where iw.issue_id = p_issue_id
    );
end;
$$;

create or replace function public.get_issue_watch_state(p_issue_id uuid)
returns table (
  issue_id uuid,
  is_watching boolean,
  notification_enabled boolean,
  watcher_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  return query
  select
    p_issue_id,
    exists (
      select 1
      from public.issue_watchers as own_iw
      where own_iw.issue_id = p_issue_id
        and own_iw.user_id = v_user_id
    ),
    coalesce((
      select own_iw.notification_enabled
      from public.issue_watchers as own_iw
      where own_iw.issue_id = p_issue_id
        and own_iw.user_id = v_user_id
      limit 1
    ), false),
    (
      select count(*)::integer
      from public.issue_watchers as iw
      where iw.issue_id = p_issue_id
    );
end;
$$;

create or replace function public.get_my_watched_issues()
returns table (
  issue_id uuid,
  category public.road_issue_category,
  severity public.road_issue_severity,
  status public.road_issue_status,
  latitude double precision,
  longitude double precision,
  first_reported_at timestamptz,
  last_verified_at timestamptz,
  reporter_count integer,
  verification_count integer,
  damage_count integer,
  solved_count integer,
  false_report_count integer,
  watcher_count integer,
  open_days integer,
  watched_at timestamptz,
  issue_is_public boolean
)
language sql
security definer
set search_path = public
as $$
  select
    ri.id as issue_id,
    ri.category,
    ri.severity,
    ri.status,
    ri.latitude,
    ri.longitude,
    ri.first_reported_at,
    ri.last_verified_at,
    ri.reporter_count,
    ri.verification_count,
    ri.damage_count,
    ri.solved_count,
    ri.false_report_count,
    (
      select count(*)::integer
      from public.issue_watchers as all_iw
      where all_iw.issue_id = ri.id
    ) as watcher_count,
    greatest(0, floor(extract(epoch from (now() - ri.first_reported_at)) / 86400))::integer as open_days,
    iw.created_at as watched_at,
    (ri.reporter_count > 0) as issue_is_public
  from public.issue_watchers as iw
  join public.road_issues as ri on ri.id = iw.issue_id
  where iw.user_id = auth.uid()
  order by iw.created_at desc;
$$;

revoke all on table public.issue_watchers from anon, authenticated;
grant select, insert, update, delete on public.issue_watchers to authenticated;

grant select on public.road_issue_public_stats to anon, authenticated;

revoke all on function public.touch_issue_watchers_updated_at() from public, anon, authenticated;
revoke all on function public.count_issue_watchers(uuid) from public, anon, authenticated;
revoke all on function public.follow_issue(uuid) from public, anon, authenticated;
revoke all on function public.unfollow_issue(uuid) from public, anon, authenticated;
revoke all on function public.get_issue_watch_state(uuid) from public, anon, authenticated;
revoke all on function public.get_my_watched_issues() from public, anon, authenticated;

grant execute on function public.follow_issue(uuid) to authenticated;
grant execute on function public.unfollow_issue(uuid) to authenticated;
grant execute on function public.get_issue_watch_state(uuid) to authenticated;
grant execute on function public.get_my_watched_issues() to authenticated;
grant execute on function public.count_issue_watchers(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
