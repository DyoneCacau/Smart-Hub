-- ============================================================================
-- HEALTHCARE — Smart Hub: banner em todos os templates
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 2. Não altera schema (banner_url / layout_blocks já existem)
-- 3. Atualiza apenas json_layout dos templates Clássico e WhatsApp First
-- 4. Banner + Grid permanece com banner (inalterado na prática)
-- 5. apply_smart_hub_template NÃO sobrescreve banner_url nem textos/botões
-- ============================================================================

-- Clássico: banner no topo + logo, descrição e botões empilhados
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

-- Banner + Grid: mantém banner + grid
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

-- WhatsApp First: banner no topo + destaque WhatsApp / contato / mapa
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

-- Verificação
SELECT name,
       json_layout->'blocks' AS blocks,
       json_layout->'preview'->>'banner' AS preview_banner
FROM public.smart_hub_templates
WHERE deleted_at IS NULL
  AND name IN ('Clássico', 'Banner + Grid', 'WhatsApp First')
ORDER BY name;
