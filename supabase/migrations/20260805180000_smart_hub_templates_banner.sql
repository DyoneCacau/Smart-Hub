-- Smart Hub: banner em todos os templates (Clássico + WhatsApp First).
-- Idempotente; não altera schema. Ver PRODUCAO_37_SMART_HUB_TEMPLATES_BANNER.sql.

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','description','buttons','contact','social','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', false,
    'grid', false,
    'style', 'classic'
  )
),
updated_at = now()
WHERE name = 'Clássico' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','grid','social','contact','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', false,
    'grid', true,
    'style', 'banner_grid'
  )
),
updated_at = now()
WHERE name = 'Banner + Grid' AND deleted_at IS NULL;

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['banner','logo','header','whatsapp','contact','buttons','social','map','footer'],
  'preview', jsonb_build_object(
    'banner', true,
    'profile', true,
    'whatsapp_featured', true,
    'grid', false,
    'style', 'whatsapp_first',
    'floating_whatsapp', true
  )
),
updated_at = now()
WHERE name = 'WhatsApp First' AND deleted_at IS NULL;
