-- Marketing foundation for the standalone funnel platform

create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  headline text,
  subheadline text,
  cta_label text,
  cta_url text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists idx_landing_pages_workspace
  on public.landing_pages(workspace_id, created_at desc);

alter table public.landing_pages enable row level security;

create policy "landing pages readable by members"
on public.landing_pages for select to authenticated
using (public.user_has_workspace_access(workspace_id));

create policy "landing pages writable by members"
on public.landing_pages for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));
