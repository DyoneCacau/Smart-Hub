alter table public.workspaces
  add column if not exists objective text not null default 'lead_capture';

create index if not exists idx_workspaces_segment_objective
  on public.workspaces(segment, objective);
