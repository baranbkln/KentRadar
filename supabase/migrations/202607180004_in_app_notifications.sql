create table if not exists public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null
    check (
      type in (
        'ISSUE_RESOLVED',
        'BADGE_EARNED',
        'TRUST_UPGRADED'
      )
    ),
  title text not null,
  message text not null,
  issue_id uuid references public.road_issues(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

create unique index if not exists notifications_issue_resolved_unique_idx
  on public.notifications (user_id, type, issue_id)
  where type = 'ISSUE_RESOLVED';

create unique index if not exists notifications_badge_earned_unique_idx
  on public.notifications (user_id, type, message)
  where type = 'BADGE_EARNED';

create unique index if not exists notifications_trust_upgraded_unique_idx
  on public.notifications (user_id, type)
  where type = 'TRUST_UPGRADED';

alter table public.notifications enable row level security;

drop policy if exists "Users can read their own notifications"
  on public.notifications;
create policy "Users can read their own notifications"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

create or replace function public.notify_on_issue_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient record;
begin
  if new.status::text not in ('solved', 'resolved')
    or old.status::text in ('solved', 'resolved')
  then
    return new;
  end if;

  for v_recipient in
    select recipient.user_id
    from (
      select new.created_by as user_id

      union

      select iur.user_id
      from public.issue_user_reports as iur
      where iur.issue_id = new.id
        and iur.withdrawn_at is null

      union

      select iuv.user_id
      from public.issue_user_verifications as iuv
      where iuv.issue_id = new.id

      union

      select iw.user_id
      from public.issue_watchers as iw
      where iw.issue_id = new.id
        and iw.notification_enabled = true
    ) as recipient
    where recipient.user_id is not null
  loop
    insert into public.notifications (
      user_id,
      type,
      title,
      message,
      issue_id
    )
    values (
      v_recipient.user_id,
      'ISSUE_RESOLVED',
      'Bir Sorun Çözüldü!',
      'Bildirdiğiniz veya katkı sağladığınız bir altyapı sorunu onaylanarak çözüldü statüsüne geçti. Sivil katkınız için teşekkürler!',
      new.id
    )
    on conflict do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists notify_on_issue_resolved
  on public.road_issues;
create trigger notify_on_issue_resolved
after update of status on public.road_issues
for each row
execute function public.notify_on_issue_resolved();

create or replace function public.notify_on_badge_earned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_badge_name text;
begin
  select badge.name
  into v_badge_name
  from public.badges as badge
  where badge.id = new.badge_id;

  if v_badge_name is null then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message
  )
  values (
    new.user_id,
    'BADGE_EARNED',
    'Yeni Bir Sivil Rozet Kazandınız',
    format('%s rozeti katkı profilinize eklendi.', v_badge_name)
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists notify_on_badge_earned
  on public.user_badges;
create trigger notify_on_badge_earned
after insert on public.user_badges
for each row
execute function public.notify_on_badge_earned();

create or replace function public.notify_on_trust_upgraded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.confirmed_points < 1000 then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.confirmed_points >= 1000 then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    message
  )
  values (
    new.user_id,
    'TRUST_UPGRADED',
    'Güvenilir Gözlemci Statüsü',
    'Kesinleşmiş katkılarınız sayesinde Güvenilir Gözlemci statüsüne ulaştınız.'
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists notify_on_trust_upgraded
  on public.user_score_totals;
create trigger notify_on_trust_upgraded
after insert or update of confirmed_points on public.user_score_totals
for each row
execute function public.notify_on_trust_upgraded();

create or replace function public.mark_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_count integer;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  update public.notifications as notification
  set is_read = true
  where notification.user_id = v_user_id
    and notification.is_read = false;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all on function public.mark_notifications_read()
  from public, anon, authenticated;
grant execute on function public.mark_notifications_read()
  to authenticated;

revoke all on function public.notify_on_issue_resolved()
  from public, anon, authenticated;
revoke all on function public.notify_on_badge_earned()
  from public, anon, authenticated;
revoke all on function public.notify_on_trust_upgraded()
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'notifications'
  ) then
    alter publication supabase_realtime
      add table public.notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
