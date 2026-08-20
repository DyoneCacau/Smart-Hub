create extension if not exists pgcrypto;

create table if not exists public.workspace_ingest_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists idx_workspace_ingest_keys_workspace
  on public.workspace_ingest_keys(workspace_id, is_active);
create unique index if not exists uq_workspace_ingest_key_hash
  on public.workspace_ingest_keys(key_hash);

alter table public.workspace_ingest_keys enable row level security;

create policy "workspace members can read ingest keys"
on public.workspace_ingest_keys for select to authenticated
using (public.user_has_workspace_access(workspace_id));

create policy "workspace admins can manage ingest keys"
on public.workspace_ingest_keys for all to authenticated
using (
  exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = workspace_ingest_keys.workspace_id
      and wu.user_id = auth.uid()
      and wu.role in ('owner','admin')
  )
)
with check (
  exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = workspace_ingest_keys.workspace_id
      and wu.user_id = auth.uid()
      and wu.role in ('owner','admin')
  )
);

create or replace function public.create_workspace_ingest_key(
  p_workspace_id uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plain text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  if not exists (
    select 1 from public.workspace_users wu
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.role in ('owner','admin')
  ) then
    raise exception 'workspace admin access denied';
  end if;

  v_plain := 'fpk_' || encode(gen_random_bytes(24), 'hex');
  v_prefix := left(v_plain, 12);
  v_hash := encode(digest(v_plain, 'sha256'), 'hex');

  insert into public.workspace_ingest_keys (
    workspace_id, name, key_prefix, key_hash, created_by
  ) values (
    p_workspace_id, p_name, v_prefix, v_hash, auth.uid()
  ) returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'key', v_plain,
    'prefix', v_prefix
  );
end;
$$;

grant execute on function public.create_workspace_ingest_key(uuid,text) to authenticated;
