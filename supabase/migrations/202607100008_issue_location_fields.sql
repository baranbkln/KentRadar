alter table public.road_issues
  add column if not exists city text,
  add column if not exists district text,
  add column if not exists neighborhood text,
  add column if not exists location_label text;

create index if not exists road_issues_city_district_idx
  on public.road_issues (city, district)
  where reporter_count > 0;

drop view if exists public.road_issue_public_stats;

create view public.road_issue_public_stats
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
  ri.severity_score_avg
from public.road_issues as ri
where ri.reporter_count > 0;

grant select on public.road_issue_public_stats to anon, authenticated;

notify pgrst, 'reload schema';
