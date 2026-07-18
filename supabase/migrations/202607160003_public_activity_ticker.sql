create table if not exists public.public_score_activity_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  bonus_type text,
  created_at timestamptz not null default now()
);

create index if not exists public_score_activity_events_created_at_idx
  on public.public_score_activity_events (created_at desc);

alter table public.public_score_activity_events enable row level security;

drop policy if exists "Public can read sanitized score activity"
  on public.public_score_activity_events;
create policy "Public can read sanitized score activity"
on public.public_score_activity_events
for select
to anon, authenticated
using (true);

revoke all on table public.public_score_activity_events
  from public, anon, authenticated;
grant select on table public.public_score_activity_events
  to anon, authenticated;

create or replace function public.publish_sanitized_score_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bonus_type in ('CRITICAL_HIT', 'COLD_CASE', 'DAILY_QUEST')
    or new.event_type in (
      'issue_report_created',
      'issue_verified_by_user',
      'daily_quest_bonus'
    )
  then
    insert into public.public_score_activity_events (
      event_type,
      bonus_type,
      created_at
    )
    values (
      new.event_type,
      new.bonus_type,
      new.created_at
    );
  end if;

  return new;
end;
$$;

drop trigger if exists publish_sanitized_score_activity_after_insert
  on public.user_score_events;
create trigger publish_sanitized_score_activity_after_insert
after insert on public.user_score_events
for each row
execute function public.publish_sanitized_score_activity();

revoke all on function public.publish_sanitized_score_activity()
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication as publication
    where publication.pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'public_score_activity_events'
  ) then
    alter publication supabase_realtime
      add table public.public_score_activity_events;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = 'user_score_events'
  ) then
    alter publication supabase_realtime
      drop table public.user_score_events;
  end if;
end;
$$;

notify pgrst, 'reload schema';
