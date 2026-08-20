-- Universal funnel platform core
create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  segment text not null default 'services',
  entity_label text not null default 'Lead',
  conversion_label text not null default 'Conversão',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_users (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.funnel_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_funnel_stages_workspace_position
  on public.funnel_stages(workspace_id, position);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stage_id uuid references public.funnel_stages(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text,
  phone text,
  email text,
  company text,
  interest text,
  estimated_value numeric(14,2),
  source text,
  medium text,
  campaign text,
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  last_touch_source text,
  last_touch_medium text,
  last_touch_campaign text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  integration_id uuid,
  external_lead_id text,
  visitor_id uuid,
  status text not null default 'open',
  lost_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_workspace_stage on public.leads(workspace_id, stage_id);
create index if not exists idx_leads_workspace_phone on public.leads(workspace_id, phone);
create index if not exists idx_leads_workspace_email on public.leads(workspace_id, email);
create unique index if not exists uq_leads_external
  on public.leads(workspace_id, integration_id, external_lead_id)
  where external_lead_id is not null;

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_name text not null,
  visitor_id uuid,
  session_id uuid,
  lead_id uuid references public.leads(id) on delete set null,
  source text,
  medium text,
  campaign text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists idx_funnel_events_workspace_time
  on public.funnel_events(workspace_id, occurred_at desc);
create index if not exists idx_funnel_events_lead on public.funnel_events(lead_id, occurred_at desc);
create index if not exists idx_funnel_events_visitor on public.funnel_events(visitor_id, occurred_at desc);

create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_activities_lead_time
  on public.lead_activities(lead_id, created_at desc);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  channel text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workspaces enable row level security;
alter table public.workspace_users enable row level security;
alter table public.funnel_stages enable row level security;
alter table public.leads enable row level security;
alter table public.funnel_events enable row level security;
alter table public.lead_activities enable row level security;
alter table public.campaigns enable row level security;

create or replace function public.user_has_workspace_access(target_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = target_workspace
      and wu.user_id = auth.uid()
  );
$$;

grant execute on function public.user_has_workspace_access(uuid) to authenticated;

create policy "workspace members can view workspaces"
on public.workspaces for select to authenticated
using (public.user_has_workspace_access(id) or created_by = auth.uid());

create policy "authenticated users can create workspaces"
on public.workspaces for insert to authenticated
with check (created_by = auth.uid());

create policy "workspace owners admins can update workspaces"
on public.workspaces for update to authenticated
using (exists (
  select 1 from public.workspace_users wu
  where wu.workspace_id = id and wu.user_id = auth.uid() and wu.role in ('owner','admin')
));

create policy "members can view workspace membership"
on public.workspace_users for select to authenticated
using (public.user_has_workspace_access(workspace_id) or user_id = auth.uid());

create policy "workspace creator can add first membership"
on public.workspace_users for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  or exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = workspace_users.workspace_id
      and wu.user_id = auth.uid()
      and wu.role in ('owner','admin')
  )
);

create policy "workspace data readable by members"
on public.funnel_stages for select to authenticated
using (public.user_has_workspace_access(workspace_id));
create policy "workspace data writable by members"
on public.funnel_stages for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

create policy "leads readable by members"
on public.leads for select to authenticated
using (public.user_has_workspace_access(workspace_id));
create policy "leads writable by members"
on public.leads for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

create policy "events readable by members"
on public.funnel_events for select to authenticated
using (public.user_has_workspace_access(workspace_id));
create policy "events writable by members"
on public.funnel_events for insert to authenticated
with check (public.user_has_workspace_access(workspace_id));

create policy "activities readable by members"
on public.lead_activities for select to authenticated
using (public.user_has_workspace_access(workspace_id));
create policy "activities writable by members"
on public.lead_activities for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

create policy "campaigns readable by members"
on public.campaigns for select to authenticated
using (public.user_has_workspace_access(workspace_id));
create policy "campaigns writable by members"
on public.campaigns for all to authenticated
using (public.user_has_workspace_access(workspace_id))
with check (public.user_has_workspace_access(workspace_id));

create or replace function public.ingest_lead(
  p_workspace_id uuid,
  p_name text default null,
  p_phone text default null,
  p_email text default null,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_integration_id uuid default null,
  p_external_lead_id text default null,
  p_visitor_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads;
  v_first_stage uuid;
begin
  if auth.uid() is not null and not public.user_has_workspace_access(p_workspace_id) then
    raise exception 'workspace access denied';
  end if;

  select id into v_first_stage
  from public.funnel_stages
  where workspace_id = p_workspace_id and not is_lost
  order by position asc
  limit 1;

  select * into v_lead
  from public.leads
  where workspace_id = p_workspace_id
    and (
      (p_external_lead_id is not null and integration_id = p_integration_id and external_lead_id = p_external_lead_id)
      or (p_phone is not null and phone = p_phone)
      or (p_email is not null and lower(email) = lower(p_email))
    )
  order by created_at asc
  limit 1;

  if v_lead.id is null then
    insert into public.leads (
      workspace_id, stage_id, name, phone, email, source, medium, campaign,
      first_touch_source, first_touch_medium, first_touch_campaign,
      last_touch_source, last_touch_medium, last_touch_campaign,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      integration_id, external_lead_id, visitor_id, metadata
    ) values (
      p_workspace_id, v_first_stage, p_name, p_phone, p_email, p_source, p_medium, p_campaign,
      p_source, p_medium, p_campaign,
      p_source, p_medium, p_campaign,
      p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
      p_integration_id, p_external_lead_id, p_visitor_id, coalesce(p_metadata, '{}'::jsonb)
    ) returning * into v_lead;
  else
    update public.leads set
      name = coalesce(p_name, name),
      phone = coalesce(p_phone, phone),
      email = coalesce(p_email, email),
      last_touch_source = coalesce(p_source, last_touch_source),
      last_touch_medium = coalesce(p_medium, last_touch_medium),
      last_touch_campaign = coalesce(p_campaign, last_touch_campaign),
      utm_source = coalesce(p_utm_source, utm_source),
      utm_medium = coalesce(p_utm_medium, utm_medium),
      utm_campaign = coalesce(p_utm_campaign, utm_campaign),
      utm_content = coalesce(p_utm_content, utm_content),
      utm_term = coalesce(p_utm_term, utm_term),
      visitor_id = coalesce(p_visitor_id, visitor_id),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = now()
    where id = v_lead.id
    returning * into v_lead;
  end if;

  insert into public.funnel_events (
    workspace_id, event_name, visitor_id, lead_id, source, medium, campaign,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    properties
  ) values (
    p_workspace_id, 'lead_created', p_visitor_id, v_lead.id, p_source, p_medium, p_campaign,
    p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term,
    jsonb_build_object('integration_id', p_integration_id, 'external_lead_id', p_external_lead_id)
  );

  return v_lead;
end;
$$;

grant execute on function public.ingest_lead(uuid,text,text,text,text,text,text,text,text,text,text,text,uuid,text,uuid,jsonb) to authenticated;
