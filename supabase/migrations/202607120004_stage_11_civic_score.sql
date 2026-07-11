create table if not exists public.user_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issue_id uuid references public.road_issues (id) on delete cascade,
  source_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  points integer not null check (points >= 0),
  status text not null check (status in ('pending', 'confirmed', 'reversed', 'ignored')),
  reason text,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  reversed_at timestamptz
);

create table if not exists public.user_score_totals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  confirmed_points integer not null default 0 check (confirmed_points >= 0),
  pending_points integer not null default 0 check (pending_points >= 0),
  reversed_points integer not null default 0 check (reversed_points >= 0),
  ignored_points integer not null default 0 check (ignored_points >= 0),
  all_time_points integer not null default 0 check (all_time_points >= 0),
  level_label text not null default 'Yeni Katkıcı',
  updated_at timestamptz not null default now()
);

create index if not exists user_score_events_user_id_idx
  on public.user_score_events (user_id);

create index if not exists user_score_events_issue_id_idx
  on public.user_score_events (issue_id);

create index if not exists user_score_events_status_idx
  on public.user_score_events (status);

create index if not exists user_score_events_event_type_idx
  on public.user_score_events (event_type);

create index if not exists user_score_events_created_at_idx
  on public.user_score_events (created_at desc);

create index if not exists user_score_events_user_status_idx
  on public.user_score_events (user_id, status);

alter table public.user_score_events enable row level security;
alter table public.user_score_totals enable row level security;

drop policy if exists "Users can read their own score events" on public.user_score_events;
create policy "Users can read their own score events"
on public.user_score_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read their own score totals" on public.user_score_totals;
create policy "Users can read their own score totals"
on public.user_score_totals
for select
to authenticated
using (auth.uid() = user_id);

revoke all on table public.user_score_events from anon, authenticated;
revoke all on table public.user_score_totals from anon, authenticated;
grant select on public.user_score_events to authenticated;
grant select on public.user_score_totals to authenticated;

create or replace function public.calculate_score_level(p_confirmed_points integer)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_confirmed_points, 0) >= 3000 then 'Altyapı Elçisi'
    when coalesce(p_confirmed_points, 0) >= 1500 then 'Güvenilir Gözlemci'
    when coalesce(p_confirmed_points, 0) >= 700 then 'Şehir Katkıcısı'
    when coalesce(p_confirmed_points, 0) >= 300 then 'Yol Gönüllüsü'
    when coalesce(p_confirmed_points, 0) >= 100 then 'Mahalle Gözlemcisi'
    else 'Yeni Katkıcı'
  end;
$$;

create or replace function public.refresh_user_score_totals(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmed_points integer;
  v_pending_points integer;
  v_reversed_points integer;
  v_ignored_points integer;
begin
  if p_user_id is null then
    return;
  end if;

  select
    coalesce(sum(se.points) filter (where se.status = 'confirmed'), 0)::integer,
    coalesce(sum(se.points) filter (where se.status = 'pending'), 0)::integer,
    coalesce(sum(se.points) filter (where se.status = 'reversed'), 0)::integer,
    coalesce(sum(se.points) filter (where se.status = 'ignored'), 0)::integer
  into
    v_confirmed_points,
    v_pending_points,
    v_reversed_points,
    v_ignored_points
  from public.user_score_events as se
  where se.user_id = p_user_id;

  insert into public.user_score_totals as ust (
    user_id,
    confirmed_points,
    pending_points,
    reversed_points,
    ignored_points,
    all_time_points,
    level_label,
    updated_at
  )
  values (
    p_user_id,
    v_confirmed_points,
    v_pending_points,
    v_reversed_points,
    v_ignored_points,
    v_confirmed_points,
    public.calculate_score_level(v_confirmed_points),
    now()
  )
  on conflict (user_id)
  do update set
    confirmed_points = excluded.confirmed_points,
    pending_points = excluded.pending_points,
    reversed_points = excluded.reversed_points,
    ignored_points = excluded.ignored_points,
    all_time_points = excluded.all_time_points,
    level_label = excluded.level_label,
    updated_at = now();
end;
$$;

create or replace function public.award_score_event(
  p_user_id uuid,
  p_issue_id uuid,
  p_source_user_id uuid,
  p_event_type text,
  p_points integer,
  p_status text,
  p_reason text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  if p_user_id is null or p_points <= 0 then
    return null;
  end if;

  insert into public.user_score_events as se (
    user_id,
    issue_id,
    source_user_id,
    event_type,
    points,
    status,
    reason,
    dedupe_key,
    finalized_at
  )
  values (
    p_user_id,
    p_issue_id,
    p_source_user_id,
    p_event_type,
    p_points,
    p_status,
    p_reason,
    p_dedupe_key,
    case when p_status = 'confirmed' then now() else null end
  )
  on conflict (dedupe_key) do nothing
  returning se.id into v_event_id;

  if v_event_id is not null then
    perform public.refresh_user_score_totals(p_user_id);
  end if;

  return v_event_id;
end;
$$;

create or replace function public.confirm_score_event(
  p_dedupe_key text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.user_score_events as se
  set status = 'confirmed',
      reason = coalesce(p_reason, se.reason),
      finalized_at = coalesce(se.finalized_at, now())
  where se.dedupe_key = p_dedupe_key
    and se.status = 'pending'
  returning se.user_id into v_user_id;

  if v_user_id is not null then
    perform public.refresh_user_score_totals(v_user_id);
  end if;
end;
$$;

create or replace function public.reverse_score_event(
  p_dedupe_key text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  update public.user_score_events as se
  set status = 'reversed',
      reason = coalesce(p_reason, se.reason),
      reversed_at = coalesce(se.reversed_at, now())
  where se.dedupe_key = p_dedupe_key
    and se.status in ('pending', 'confirmed')
  returning se.user_id into v_user_id;

  if v_user_id is not null then
    perform public.refresh_user_score_totals(v_user_id);
  end if;
end;
$$;

create or replace function public.score_issue_user_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_score_event(
    new.user_id,
    new.issue_id,
    null,
    'issue_report_created',
    10,
    'pending',
    'new_issue_report',
    concat('issue_report_created:', new.issue_id, ':', new.user_id)
  );

  return new;
end;
$$;

create or replace function public.score_issue_user_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.withdrawn_at is null and new.withdrawn_at is not null then
    perform public.reverse_score_event(
      concat('issue_report_created:', new.issue_id, ':', new.user_id),
      'withdrawn_report'
    );
  end if;

  return new;
end;
$$;

create or replace function public.score_issue_verification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter record;
begin
  if not exists (
    select 1
    from public.issue_user_reports as iur
    where iur.issue_id = new.issue_id
      and iur.user_id = new.user_id
      and iur.withdrawn_at is null
  ) then
    perform public.award_score_event(
      new.user_id,
      new.issue_id,
      null,
      'issue_verified_by_user',
      8,
      'confirmed',
      'accepted_verification',
      concat('issue_verified_by_user:', new.issue_id, ':', new.user_id)
    );
  end if;

  for v_reporter in
    select iur.user_id
    from public.issue_user_reports as iur
    where iur.issue_id = new.issue_id
      and iur.withdrawn_at is null
      and iur.user_id <> new.user_id
  loop
    perform public.confirm_score_event(
      concat('issue_report_created:', new.issue_id, ':', v_reporter.user_id),
      'independent_verification'
    );

    perform public.award_score_event(
      v_reporter.user_id,
      new.issue_id,
      new.user_id,
      'issue_report_verified_bonus',
      15,
      'confirmed',
      'independent_verification',
      concat(
        'issue_report_verified_bonus:',
        new.issue_id,
        ':',
        v_reporter.user_id,
        ':',
        new.user_id
      )
    );
  end loop;

  return new;
end;
$$;

create or replace function public.score_issue_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter record;
begin
  if new.report_type = 'damage' then
    if not exists (
      select 1
      from public.issue_user_reports as iur
      where iur.issue_id = new.issue_id
        and iur.user_id = new.user_id
        and iur.withdrawn_at is null
    ) then
      perform public.award_score_event(
        new.user_id,
        new.issue_id,
        null,
        'damage_reported_by_user',
        10,
        'confirmed',
        'accepted_damage_report',
        concat('damage_reported_by_user:', new.issue_id, ':', new.user_id)
      );
    end if;

    for v_reporter in
      select iur.user_id
      from public.issue_user_reports as iur
      where iur.issue_id = new.issue_id
        and iur.withdrawn_at is null
        and iur.user_id <> new.user_id
    loop
      perform public.award_score_event(
        v_reporter.user_id,
        new.issue_id,
        new.user_id,
        'issue_damage_received_bonus',
        20,
        'confirmed',
        'damage_report_received',
        concat(
          'issue_damage_received_bonus:',
          new.issue_id,
          ':',
          v_reporter.user_id,
          ':',
          new.user_id
        )
      );
    end loop;
  elsif new.report_type = 'solved' then
    perform public.award_score_event(
      new.user_id,
      new.issue_id,
      null,
      'issue_solved_reported_by_user',
      5,
      'pending',
      'solved_report_submitted',
      concat('issue_solved_reported_by_user:', new.issue_id, ':', new.user_id)
    );
  elsif new.report_type = 'false_report' then
    perform public.award_score_event(
      new.user_id,
      new.issue_id,
      null,
      'issue_false_reported_by_user',
      5,
      'pending',
      'false_report_submitted',
      concat('issue_false_reported_by_user:', new.issue_id, ':', new.user_id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.score_issue_report_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.report_type = 'solved' then
    perform public.reverse_score_event(
      concat('issue_solved_reported_by_user:', old.issue_id, ':', old.user_id),
      'solved_report_withdrawn'
    );
  elsif old.report_type = 'false_report' then
    perform public.reverse_score_event(
      concat('issue_false_reported_by_user:', old.issue_id, ':', old.user_id),
      'false_report_withdrawn'
    );
  end if;

  return old;
end;
$$;

create or replace function public.score_road_issue_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter record;
  v_solver record;
  v_false_reporter record;
begin
  if new.status = 'solved' and old.status is distinct from 'solved' then
    for v_solver in
      select distinct ir.user_id
      from public.issue_reports as ir
      where ir.issue_id = new.id
        and ir.report_type = 'solved'
    loop
      perform public.confirm_score_event(
        concat('issue_solved_reported_by_user:', new.id, ':', v_solver.user_id),
        'issue_reached_solved'
      );
    end loop;

    for v_reporter in
      select iur.user_id
      from public.issue_user_reports as iur
      where iur.issue_id = new.id
        and iur.withdrawn_at is null
    loop
      perform public.award_score_event(
        v_reporter.user_id,
        new.id,
        null,
        'issue_solved_bonus',
        30,
        'confirmed',
        'reported_issue_solved',
        concat('issue_solved_bonus:', new.id, ':', v_reporter.user_id)
      );
    end loop;
  end if;

  if new.status = 'disputed' and old.status is distinct from 'disputed' then
    for v_false_reporter in
      select distinct ir.user_id
      from public.issue_reports as ir
      where ir.issue_id = new.id
        and ir.report_type = 'false_report'
    loop
      perform public.confirm_score_event(
        concat('issue_false_reported_by_user:', new.id, ':', v_false_reporter.user_id),
        'issue_became_disputed'
      );
    end loop;

    for v_reporter in
      select iur.user_id
      from public.issue_user_reports as iur
      where iur.issue_id = new.id
        and iur.withdrawn_at is null
    loop
      perform public.reverse_score_event(
        concat('issue_report_created:', new.id, ':', v_reporter.user_id),
        'issue_became_disputed'
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists score_issue_user_report_insert on public.issue_user_reports;
create trigger score_issue_user_report_insert
after insert on public.issue_user_reports
for each row
execute function public.score_issue_user_report_insert();

drop trigger if exists score_issue_user_report_update on public.issue_user_reports;
create trigger score_issue_user_report_update
after update of withdrawn_at on public.issue_user_reports
for each row
execute function public.score_issue_user_report_update();

drop trigger if exists score_issue_verification_insert on public.issue_user_verifications;
create trigger score_issue_verification_insert
after insert on public.issue_user_verifications
for each row
execute function public.score_issue_verification_insert();

drop trigger if exists score_issue_report_insert on public.issue_reports;
create trigger score_issue_report_insert
after insert on public.issue_reports
for each row
execute function public.score_issue_report_insert();

drop trigger if exists score_issue_report_delete on public.issue_reports;
create trigger score_issue_report_delete
after delete on public.issue_reports
for each row
execute function public.score_issue_report_delete();

drop trigger if exists score_road_issue_status_update on public.road_issues;
create trigger score_road_issue_status_update
after update of status on public.road_issues
for each row
execute function public.score_road_issue_status_update();

create or replace function public.get_my_score_summary()
returns table (
  confirmed_points integer,
  pending_points integer,
  reversed_points integer,
  ignored_points integer,
  level_label text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();
  perform public.refresh_user_score_totals(v_user_id);

  return query
  select
    ust.confirmed_points,
    ust.pending_points,
    ust.reversed_points,
    ust.ignored_points,
    ust.level_label,
    ust.updated_at
  from public.user_score_totals as ust
  where ust.user_id = v_user_id;
end;
$$;

create or replace function public.get_my_score_events(p_limit integer default 10)
returns table (
  event_type text,
  points integer,
  status text,
  reason text,
  issue_id uuid,
  created_at timestamptz,
  finalized_at timestamptz,
  reversed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public.current_authenticated_user_id();

  return query
  select
    se.event_type,
    se.points,
    se.status,
    se.reason,
    se.issue_id,
    se.created_at,
    se.finalized_at,
    se.reversed_at
  from public.user_score_events as se
  where se.user_id = v_user_id
  order by se.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

revoke all on function public.calculate_score_level(integer) from public, anon, authenticated;
revoke all on function public.refresh_user_score_totals(uuid) from public, anon, authenticated;
revoke all on function public.award_score_event(uuid, uuid, uuid, text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_score_event(text, text) from public, anon, authenticated;
revoke all on function public.reverse_score_event(text, text) from public, anon, authenticated;
revoke all on function public.score_issue_user_report_insert() from public, anon, authenticated;
revoke all on function public.score_issue_user_report_update() from public, anon, authenticated;
revoke all on function public.score_issue_verification_insert() from public, anon, authenticated;
revoke all on function public.score_issue_report_insert() from public, anon, authenticated;
revoke all on function public.score_issue_report_delete() from public, anon, authenticated;
revoke all on function public.score_road_issue_status_update() from public, anon, authenticated;
revoke all on function public.get_my_score_summary() from public, anon, authenticated;
revoke all on function public.get_my_score_events(integer) from public, anon, authenticated;

grant execute on function public.get_my_score_summary() to authenticated;
grant execute on function public.get_my_score_events(integer) to authenticated;

notify pgrst, 'reload schema';
