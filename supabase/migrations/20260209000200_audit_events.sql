create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  user_id uuid not null,
  created_at timestamp with time zone default now()
);

create index if not exists idx_audit_events_clinic_created
  on public.audit_events (clinic_id, created_at desc);
