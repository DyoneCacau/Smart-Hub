-- Standalone Smart Hub schema.
-- Transitional compatibility: legacy column name clinic_id stores the workspace id.

create extension if not exists pgcrypto;

create table if not exists public.smart_hubs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.workspaces(id) on delete cascade,
  slug text not null unique,
  title text not null default '',
  subtitle text,
  description text,
  logo_url text,
  banner_url text,
  background_url text,
  profile_url text,
  theme text not null default 'default',
  primary_color text not null default '#0F766E',
  secondary_color text not null default '#134E4A',
  font_family text not null default 'Inter',
  seo_title text,
  seo_description text,
  favicon_url text,
  status text not null default 'draft' check (status in ('draft','published','offline','archived')),
  template_id uuid,
  published_at timestamptz,
  paused_at timestamptz,
  last_validated_at timestamptz,
  validation_errors jsonb not null default '[]'::jsonb,
  whatsapp_number text,
  contact_phone text,
  contact_email text,
  contact_address text,
  map_embed_url text,
  layout_blocks jsonb not null default '["banner","header","logo","description","buttons","footer"]'::jsonb,
  style_preset text not null default 'clean',
  visual_config jsonb not null default '{}'::jsonb,
  capture_config jsonb not null default '{}'::jsonb,
  public_booking_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (clinic_id)
);

create table if not exists public.smart_hub_pages (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade,
  title text not null default 'Página principal',
  slug text not null default 'home',
  layout_json jsonb not null default '{"version":1,"blocks":[]}'::jsonb,
  is_home boolean not null default true,
  status text not null default 'draft',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique(hub_id,slug)
);

create table if not exists public.smart_hub_buttons (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade,
  title text not null,
  subtitle text,
  icon text,
  type text not null default 'link',
  url text,
  image text,
  image_alt text,
  visual_variant text not null default 'simple',
  image_position text not null default 'left',
  background_color text,
  text_color text,
  visible boolean not null default true,
  order_index integer not null default 0,
  track_click boolean not null default true,
  status text not null default 'active',
  whatsapp_message text,
  click_action text not null default 'auto',
  capture_config jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz
);

create table if not exists public.smart_hub_theme (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade unique,
  theme_name text not null default 'default', primary_color text not null default '#0F766E', secondary_color text not null default '#134E4A',
  accent_color text, background_color text, text_color text, button_radius text not null default 'lg', font_family text not null default 'Inter', custom_css text,
  config_json jsonb not null default '{}'::jsonb, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null, deleted_at timestamptz
);

create table if not exists public.smart_hub_templates (
  id uuid primary key default gen_random_uuid(), name text not null, description text, thumbnail text,
  json_layout jsonb not null default '{"version":1,"blocks":[]}'::jsonb,
  is_default boolean not null default false, status text not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null, deleted_at timestamptz
);

create table if not exists public.smart_hub_assets (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade, file_name text not null, file_type text, storage_path text not null, public_url text,
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null, deleted_at timestamptz
);

create table if not exists public.smart_hub_domains (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade, domain text not null unique, is_primary boolean not null default false,
  is_verified boolean not null default false, verification_token text, ssl_status text not null default 'pending', status text not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, updated_by uuid references auth.users(id) on delete set null, deleted_at timestamptz
);

create table if not exists public.smart_hub_visits (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade, visitor_id text, session_id text, referrer text,
  utm_source text, utm_medium text, utm_campaign text, device_type text, browser text, os text, country text, city text, ip_hash text, user_agent text,
  status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.smart_hub_clicks (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade, button_id uuid references public.smart_hub_buttons(id) on delete set null,
  visit_id uuid references public.smart_hub_visits(id) on delete set null, target_url text, device_type text, referrer text, utm_campaign text,
  metadata jsonb not null default '{}'::jsonb, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.smart_hub_events (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.workspaces(id) on delete cascade,
  hub_id uuid not null references public.smart_hubs(id) on delete cascade, event_type text not null, event_name text, payload jsonb not null default '{}'::jsonb,
  visit_id uuid references public.smart_hub_visits(id) on delete set null, status text not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create index if not exists idx_smart_hubs_workspace on public.smart_hubs(clinic_id) where deleted_at is null;
create index if not exists idx_smart_hub_buttons_hub on public.smart_hub_buttons(hub_id,order_index) where deleted_at is null;
create index if not exists idx_smart_hub_visits_hub on public.smart_hub_visits(hub_id,created_at desc) where deleted_at is null;
create index if not exists idx_smart_hub_clicks_hub on public.smart_hub_clicks(hub_id,created_at desc) where deleted_at is null;

alter table public.smart_hubs enable row level security;
alter table public.smart_hub_pages enable row level security;
alter table public.smart_hub_buttons enable row level security;
alter table public.smart_hub_theme enable row level security;
alter table public.smart_hub_templates enable row level security;
alter table public.smart_hub_assets enable row level security;
alter table public.smart_hub_domains enable row level security;
alter table public.smart_hub_visits enable row level security;
alter table public.smart_hub_clicks enable row level security;
alter table public.smart_hub_events enable row level security;

create policy "smart hubs members" on public.smart_hubs for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub pages members" on public.smart_hub_pages for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub buttons members" on public.smart_hub_buttons for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub theme members" on public.smart_hub_theme for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub assets members" on public.smart_hub_assets for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub domains members" on public.smart_hub_domains for all to authenticated using (public.user_has_workspace_access(clinic_id)) with check (public.user_has_workspace_access(clinic_id));
create policy "smart hub visits members read" on public.smart_hub_visits for select to authenticated using (public.user_has_workspace_access(clinic_id));
create policy "smart hub clicks members read" on public.smart_hub_clicks for select to authenticated using (public.user_has_workspace_access(clinic_id));
create policy "smart hub events members read" on public.smart_hub_events for select to authenticated using (public.user_has_workspace_access(clinic_id));
create policy "smart hub templates public read" on public.smart_hub_templates for select to authenticated using (deleted_at is null and status='active');

create or replace function public.normalize_smart_hub_slug(p_slug text) returns text language sql immutable as $$
  select nullif(trim(both '-' from regexp_replace(regexp_replace(lower(trim(coalesce(p_slug,''))),'[^a-z0-9-]+','-','g'),'-+','-','g')),'');
$$;

create or replace function public.is_smart_hub_slug_available(p_slug text,p_exclude_hub_id uuid default null)
returns boolean language sql stable security definer set search_path=public as $$
  select not exists(select 1 from public.smart_hubs where slug=public.normalize_smart_hub_slug(p_slug) and deleted_at is null and (p_exclude_hub_id is null or id<>p_exclude_hub_id));
$$;

grant execute on function public.is_smart_hub_slug_available(text,uuid) to authenticated;

create or replace function public.get_public_smart_hub(p_slug text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare h public.smart_hubs; begin
  select * into h from public.smart_hubs where slug=public.normalize_smart_hub_slug(p_slug) and deleted_at is null and status='published' limit 1;
  if h.id is null then return null; end if;
  return jsonb_build_object('hub',to_jsonb(h),'theme',(select to_jsonb(t) from public.smart_hub_theme t where t.hub_id=h.id and t.deleted_at is null limit 1),'buttons',coalesce((select jsonb_agg(to_jsonb(b) order by b.order_index,b.created_at) from public.smart_hub_buttons b where b.hub_id=h.id and b.deleted_at is null and b.visible=true and b.status='active'),'[]'::jsonb),'page',(select to_jsonb(p) from public.smart_hub_pages p where p.hub_id=h.id and p.deleted_at is null and p.is_home=true limit 1),'assets',coalesce((select jsonb_agg(to_jsonb(a)) from public.smart_hub_assets a where a.hub_id=h.id and a.deleted_at is null),'[]'::jsonb));
end $$;

grant execute on function public.get_public_smart_hub(text) to anon,authenticated;

create or replace function public.get_preview_smart_hub(p_hub_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare h public.smart_hubs; begin
  select * into h from public.smart_hubs where id=p_hub_id and deleted_at is null limit 1;
  if h.id is null or not public.user_has_workspace_access(h.clinic_id) then return null; end if;
  return jsonb_build_object('hub',to_jsonb(h),'theme',(select to_jsonb(t) from public.smart_hub_theme t where t.hub_id=h.id and t.deleted_at is null limit 1),'buttons',coalesce((select jsonb_agg(to_jsonb(b) order by b.order_index,b.created_at) from public.smart_hub_buttons b where b.hub_id=h.id and b.deleted_at is null),'[]'::jsonb),'page',(select to_jsonb(p) from public.smart_hub_pages p where p.hub_id=h.id and p.deleted_at is null and p.is_home=true limit 1),'assets',coalesce((select jsonb_agg(to_jsonb(a)) from public.smart_hub_assets a where a.hub_id=h.id and a.deleted_at is null),'[]'::jsonb),'preview',true);
end $$;

grant execute on function public.get_preview_smart_hub(uuid) to authenticated;

create or replace function public.validate_smart_hub_for_publish(p_hub_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.smart_hubs; n int; begin
  select * into h from public.smart_hubs where id=p_hub_id and deleted_at is null; if h.id is null then return jsonb_build_object('ok',false,'errors',jsonb_build_array(jsonb_build_object('code','not_found','message','Hub não encontrado')),'warnings','[]'::jsonb); end if;
  if not public.user_has_workspace_access(h.clinic_id) then raise exception 'workspace access denied'; end if;
  select count(*) into n from public.smart_hub_buttons where hub_id=p_hub_id and deleted_at is null and visible=true and status='active';
  update public.smart_hubs set last_validated_at=now(),validation_errors='[]'::jsonb where id=p_hub_id;
  return jsonb_build_object('ok',true,'errors','[]'::jsonb,'warnings',case when n=0 then jsonb_build_array(jsonb_build_object('code','no_buttons','message','Publique pelo menos um botão para melhor conversão')) else '[]'::jsonb end,'visible_buttons',n);
end $$;

grant execute on function public.validate_smart_hub_for_publish(uuid) to authenticated;

create or replace function public.publish_smart_hub(p_hub_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare h public.smart_hubs; v jsonb; begin select * into h from public.smart_hubs where id=p_hub_id and deleted_at is null; if h.id is null or not public.user_has_workspace_access(h.clinic_id) then raise exception 'workspace access denied'; end if; v:=public.validate_smart_hub_for_publish(p_hub_id); if coalesce((v->>'ok')::boolean,false)=false then return jsonb_build_object('ok',false,'status',h.status,'validation',v); end if; update public.smart_hubs set status='published',published_at=now(),paused_at=null,updated_at=now() where id=p_hub_id; return jsonb_build_object('ok',true,'status','published','validation',v); end $$;
create or replace function public.pause_smart_hub(p_hub_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare h public.smart_hubs; begin select * into h from public.smart_hubs where id=p_hub_id; if h.id is null or not public.user_has_workspace_access(h.clinic_id) then raise exception 'workspace access denied'; end if; update public.smart_hubs set status='offline',paused_at=now(),updated_at=now() where id=p_hub_id; return jsonb_build_object('ok',true,'status','offline'); end $$;
create or replace function public.unpublish_smart_hub_to_draft(p_hub_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$ declare h public.smart_hubs; begin select * into h from public.smart_hubs where id=p_hub_id; if h.id is null or not public.user_has_workspace_access(h.clinic_id) then raise exception 'workspace access denied'; end if; update public.smart_hubs set status='draft',published_at=null,paused_at=null,updated_at=now() where id=p_hub_id; return jsonb_build_object('ok',true,'status','draft'); end $$;

grant execute on function public.publish_smart_hub(uuid),public.pause_smart_hub(uuid),public.unpublish_smart_hub_to_draft(uuid) to authenticated;

create or replace function public.track_smart_hub_visit(p_hub_id uuid,p_payload jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare h public.smart_hubs; v uuid; begin select * into h from public.smart_hubs where id=p_hub_id and status='published' and deleted_at is null; if h.id is null then return null; end if; insert into public.smart_hub_visits(clinic_id,hub_id,visitor_id,session_id,referrer,utm_source,utm_medium,utm_campaign,device_type,user_agent) values(h.clinic_id,h.id,p_payload->>'visitor_id',p_payload->>'session_id',p_payload->>'referrer',p_payload->>'utm_source',p_payload->>'utm_medium',p_payload->>'utm_campaign',p_payload->>'device_type',p_payload->>'user_agent') returning id into v; return v; end $$;
create or replace function public.track_smart_hub_click(p_hub_id uuid,p_button_id uuid,p_payload jsonb default '{}'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$ declare h public.smart_hubs; v uuid; begin select * into h from public.smart_hubs where id=p_hub_id and status='published' and deleted_at is null; if h.id is null then return null; end if; insert into public.smart_hub_clicks(clinic_id,hub_id,button_id,target_url,device_type,referrer,utm_campaign,metadata) values(h.clinic_id,h.id,p_button_id,p_payload->>'target_url',p_payload->>'device_type',p_payload->>'referrer',p_payload->>'utm_campaign',coalesce(p_payload,'{}'::jsonb)) returning id into v; return v; end $$;

grant execute on function public.track_smart_hub_visit(uuid,jsonb),public.track_smart_hub_click(uuid,uuid,jsonb) to anon,authenticated;

grant select on public.smart_hubs,public.smart_hub_pages,public.smart_hub_buttons,public.smart_hub_theme,public.smart_hub_assets to anon;
grant select,insert,update,delete on public.smart_hubs,public.smart_hub_pages,public.smart_hub_buttons,public.smart_hub_theme,public.smart_hub_templates,public.smart_hub_assets,public.smart_hub_domains to authenticated;
grant select on public.smart_hub_visits,public.smart_hub_clicks,public.smart_hub_events to authenticated;

insert into public.smart_hub_templates(name,description,is_default,json_layout)
select 'Conversão simples','Modelo inicial para link da bio',true,'{"version":1,"blocks":["header","description","buttons","footer"]}'::jsonb
where not exists(select 1 from public.smart_hub_templates where is_default=true and deleted_at is null);
