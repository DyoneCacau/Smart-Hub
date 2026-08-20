-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 2.1 (identidade visual + assets)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisitos: Fase 1 + Fase 2 + PRODUCAO_30 já aplicadas
-- 2. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 3. Cria bucket smart-hub-assets, campos visuais e policies multi-tenant
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campos visuais em smart_hubs
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS profile_url TEXT,
  ADD COLUMN IF NOT EXISTS style_preset TEXT NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS visual_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_hubs.profile_url IS 'Foto de perfil / avatar do hub';
COMMENT ON COLUMN public.smart_hubs.style_preset IS 'Preset visual: clean|elegant|colorful|minimal|premium|whatsapp';
COMMENT ON COLUMN public.smart_hubs.visual_config IS 'Config visual (cores extras, gradiente, overlay, tipografia, etc.)';

-- ---------------------------------------------------------------------------
-- Campos visuais em smart_hub_buttons
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_buttons
  ADD COLUMN IF NOT EXISTS image_alt TEXT,
  ADD COLUMN IF NOT EXISTS visual_variant TEXT NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS image_position TEXT NOT NULL DEFAULT 'left',
  ADD COLUMN IF NOT EXISTS whatsapp_message TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_buttons_visual_variant_check'
  ) THEN
    ALTER TABLE public.smart_hub_buttons
      ADD CONSTRAINT smart_hub_buttons_visual_variant_check
      CHECK (visual_variant IN (
        'simple', 'icon_card', 'image_card', 'horizontal_card',
        'featured_card', 'list_item', 'grid'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_buttons_image_position_check'
  ) THEN
    ALTER TABLE public.smart_hub_buttons
      ADD CONSTRAINT smart_hub_buttons_image_position_check
      CHECK (image_position IN ('left', 'top', 'right', 'background'));
  END IF;
END $$;

-- Ampliar tipos de botão (mantém os existentes)
ALTER TABLE public.smart_hub_buttons DROP CONSTRAINT IF EXISTS smart_hub_buttons_type_check;
ALTER TABLE public.smart_hub_buttons
  ADD CONSTRAINT smart_hub_buttons_type_check
  CHECK (type IN (
    'link', 'whatsapp', 'phone', 'email', 'map', 'video', 'form', 'internal', 'social',
    'instagram', 'facebook', 'tiktok', 'youtube', 'site', 'appointment', 'procedure', 'info'
  ));

-- ---------------------------------------------------------------------------
-- Bucket smart-hub-assets (público para página /hub/:slug)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'smart-hub-assets',
  'smart-hub-assets',
  true,
  6291456, -- 6 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- path: {clinic_id}/{hub_id}/{kind}/...

DROP POLICY IF EXISTS "Smart hub assets public read" ON storage.objects;
CREATE POLICY "Smart hub assets public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'smart-hub-assets');

DROP POLICY IF EXISTS "Smart hub assets clinic insert" ON storage.objects;
CREATE POLICY "Smart hub assets clinic insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

DROP POLICY IF EXISTS "Smart hub assets clinic update" ON storage.objects;
CREATE POLICY "Smart hub assets clinic update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
)
WITH CHECK (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

DROP POLICY IF EXISTS "Smart hub assets clinic delete" ON storage.objects;
CREATE POLICY "Smart hub assets clinic delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'smart-hub-assets'
  AND (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(((storage.foldername(name))[1])::uuid)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  )
);

-- ---------------------------------------------------------------------------
-- Asset kind em smart_hub_assets (opcional)
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_assets
  ADD COLUMN IF NOT EXISTS asset_kind TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_assets_kind_check'
  ) THEN
    ALTER TABLE public.smart_hub_assets
      ADD CONSTRAINT smart_hub_assets_kind_check
      CHECK (asset_kind IN ('logo', 'banner', 'profile', 'button', 'background', 'other'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Atualizar seeds de templates (prévias descritivas em json_layout)
-- ---------------------------------------------------------------------------

UPDATE public.smart_hub_templates
SET json_layout = jsonb_build_object(
  'version', 1,
  'blocks', ARRAY['logo','header','description','buttons','contact','social','footer'],
  'preview', jsonb_build_object(
    'banner', false,
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


-- ---------------------------------------------------------------------------
-- Metadata de cliques (título amigável, tipo, variante, posição)
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hub_clicks
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_hub_clicks.metadata IS 'Metadados não sensíveis do clique (título, tipo, variante, posição, template)';

CREATE OR REPLACE FUNCTION public.track_smart_hub_click(
  p_hub_id UUID,
  p_button_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
  v_meta JSONB;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL AND status = 'published';

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Hub não encontrado ou offline';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'button_title', p_payload->>'button_title',
    'button_type', p_payload->>'button_type',
    'visual_variant', p_payload->>'visual_variant',
    'order_index', p_payload->'order_index',
    'template_id', p_payload->>'template_id',
    'style_preset', p_payload->>'style_preset'
  ));

  INSERT INTO public.smart_hub_clicks (
    clinic_id, hub_id, button_id, visit_id, target_url, device_type, referrer, utm_campaign, metadata
  ) VALUES (
    v_clinic_id,
    p_hub_id,
    p_button_id,
    NULLIF(p_payload->>'visit_id', '')::UUID,
    p_payload->>'target_url',
    p_payload->>'device_type',
    p_payload->>'referrer',
    p_payload->>'utm_campaign',
    COALESCE(v_meta, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_smart_hub_click(UUID, UUID, JSONB) TO anon, authenticated;
