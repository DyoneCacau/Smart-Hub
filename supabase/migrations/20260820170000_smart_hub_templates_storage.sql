-- Complements the standalone Smart Hub with template application and Storage.

-- ============================================================
-- Template application
-- Preserves content, contacts, images and buttons; applies visual/layout settings only.
-- ============================================================
create or replace function public.apply_smart_hub_template(
  p_hub_id uuid,
  p_template_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.smart_hubs;
  t public.smart_hub_templates;
  v_layout jsonb;
  v_visual jsonb;
  v_style text;
  v_primary text;
  v_secondary text;
  v_font text;
begin
  select * into h
  from public.smart_hubs
  where id = p_hub_id and deleted_at is null;

  if h.id is null then
    raise exception 'smart hub not found';
  end if;

  if not public.user_has_workspace_access(h.clinic_id) then
    raise exception 'workspace access denied';
  end if;

  select * into t
  from public.smart_hub_templates
  where id = p_template_id
    and deleted_at is null
    and status = 'active';

  if t.id is null then
    raise exception 'template not found';
  end if;

  v_layout := coalesce(t.json_layout->'layout_blocks', t.json_layout->'blocks', h.layout_blocks);
  if jsonb_typeof(v_layout) <> 'array' then
    v_layout := h.layout_blocks;
  end if;

  v_visual := coalesce(t.json_layout->'visual_config', h.visual_config, '{}'::jsonb);
  if jsonb_typeof(v_visual) <> 'object' then
    v_visual := coalesce(h.visual_config, '{}'::jsonb);
  end if;

  v_style := coalesce(nullif(t.json_layout->>'style_preset',''), h.style_preset, 'clean');
  v_primary := coalesce(nullif(t.json_layout->>'primary_color',''), h.primary_color, '#0F766E');
  v_secondary := coalesce(nullif(t.json_layout->>'secondary_color',''), h.secondary_color, '#134E4A');
  v_font := coalesce(nullif(t.json_layout->>'font_family',''), h.font_family, 'Inter');

  update public.smart_hubs
  set template_id = t.id,
      layout_blocks = v_layout,
      visual_config = v_visual,
      style_preset = v_style,
      primary_color = v_primary,
      secondary_color = v_secondary,
      font_family = v_font,
      updated_at = now(),
      updated_by = auth.uid()
  where id = h.id;

  insert into public.smart_hub_theme (
    clinic_id, hub_id, theme_name, primary_color, secondary_color,
    background_color, text_color, button_radius, font_family, config_json,
    created_by, updated_by
  ) values (
    h.clinic_id,
    h.id,
    coalesce(nullif(t.json_layout->>'theme_name',''), v_style),
    v_primary,
    v_secondary,
    nullif(t.json_layout->>'background_color',''),
    nullif(t.json_layout->>'text_color',''),
    coalesce(nullif(t.json_layout->>'button_radius',''), 'lg'),
    v_font,
    v_visual,
    auth.uid(),
    auth.uid()
  )
  on conflict (hub_id) do update set
    theme_name = excluded.theme_name,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    background_color = coalesce(excluded.background_color, public.smart_hub_theme.background_color),
    text_color = coalesce(excluded.text_color, public.smart_hub_theme.text_color),
    button_radius = excluded.button_radius,
    font_family = excluded.font_family,
    config_json = excluded.config_json,
    updated_by = auth.uid(),
    updated_at = now();

  return jsonb_build_object('ok', true, 'hub_id', h.id, 'template_id', t.id);
end;
$$;

grant execute on function public.apply_smart_hub_template(uuid,uuid) to authenticated;

-- ============================================================
-- Smart Hub public image bucket
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'smart-hub-assets',
  'smart-hub-assets',
  true,
  6291456,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read is intentional: these assets are rendered on public Smart Hub pages.
drop policy if exists "smart hub assets public read" on storage.objects;
create policy "smart hub assets public read"
on storage.objects for select
to public
using (bucket_id = 'smart-hub-assets');

-- Upload paths are: {workspace_id}/{hub_id}/{kind}/...
drop policy if exists "smart hub assets member insert" on storage.objects;
create policy "smart hub assets member insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'smart-hub-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.user_has_workspace_access(split_part(name, '/', 1)::uuid)
);

drop policy if exists "smart hub assets member update" on storage.objects;
create policy "smart hub assets member update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'smart-hub-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.user_has_workspace_access(split_part(name, '/', 1)::uuid)
)
with check (
  bucket_id = 'smart-hub-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.user_has_workspace_access(split_part(name, '/', 1)::uuid)
);

drop policy if exists "smart hub assets member delete" on storage.objects;
create policy "smart hub assets member delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'smart-hub-assets'
  and split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
  and public.user_has_workspace_access(split_part(name, '/', 1)::uuid)
);
