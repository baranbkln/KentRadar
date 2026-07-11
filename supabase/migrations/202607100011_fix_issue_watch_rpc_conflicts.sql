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
  v_watcher_count integer := 0;
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

  insert into public.issue_watchers as new_iw (
    issue_id,
    user_id,
    notification_enabled
  )
  values (
    p_issue_id,
    v_user_id,
    true
  )
  on conflict on constraint issue_watchers_issue_user_key
  do update set
    notification_enabled = true,
    updated_at = now();

  select count(*)::integer
  into v_watcher_count
  from public.issue_watchers as counted_iw
  where counted_iw.issue_id = p_issue_id;

  return query
  select
    p_issue_id,
    true,
    true,
    v_watcher_count;
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
  v_watcher_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  delete from public.issue_watchers as deleted_iw
  where deleted_iw.issue_id = p_issue_id
    and deleted_iw.user_id = v_user_id;

  select count(*)::integer
  into v_watcher_count
  from public.issue_watchers as counted_iw
  where counted_iw.issue_id = p_issue_id;

  return query
  select
    p_issue_id,
    false,
    false,
    v_watcher_count;
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
  v_is_watching boolean := false;
  v_notification_enabled boolean := false;
  v_watcher_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select
    true,
    own_iw.notification_enabled
  into
    v_is_watching,
    v_notification_enabled
  from public.issue_watchers as own_iw
  where own_iw.issue_id = p_issue_id
    and own_iw.user_id = v_user_id
  limit 1;

  select count(*)::integer
  into v_watcher_count
  from public.issue_watchers as counted_iw
  where counted_iw.issue_id = p_issue_id;

  return query
  select
    p_issue_id,
    coalesce(v_is_watching, false),
    coalesce(v_notification_enabled, false),
    v_watcher_count;
end;
$$;

revoke all on function public.follow_issue(uuid) from public, anon, authenticated;
revoke all on function public.unfollow_issue(uuid) from public, anon, authenticated;
revoke all on function public.get_issue_watch_state(uuid) from public, anon, authenticated;

grant execute on function public.follow_issue(uuid) to authenticated;
grant execute on function public.unfollow_issue(uuid) to authenticated;
grant execute on function public.get_issue_watch_state(uuid) to authenticated;

notify pgrst, 'reload schema';
