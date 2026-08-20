-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 2 (publicação, prévia, validação e pausa)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisito: migration 20260728120000_smart_hub.sql já aplicada
-- 2. Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
--    OU via: supabase db push
-- 3. Não altera RLS de isolamento por clinic_id; apenas adiciona campos e RPCs
--    de validação/publicação/pausa com verificação de membership + feature
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Campos incrementais em smart_hubs
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.smart_hub_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_address TEXT,
  ADD COLUMN IF NOT EXISTS map_embed_url TEXT,
  ADD COLUMN IF NOT EXISTS layout_blocks JSONB NOT NULL DEFAULT '["header","logo","description","buttons","footer"]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_smart_hubs_template
  ON public.smart_hubs(template_id)
  WHERE deleted_at IS NULL AND template_id IS NOT NULL;

COMMENT ON COLUMN public.smart_hubs.template_id IS 'Template aplicado ao hub (Fase 2)';
COMMENT ON COLUMN public.smart_hubs.published_at IS 'Última publicação bem-sucedida';
COMMENT ON COLUMN public.smart_hubs.paused_at IS 'Última pausa (status offline)';
COMMENT ON COLUMN public.smart_hubs.validation_errors IS 'Resultado da última validação pré-publicação';
COMMENT ON COLUMN public.smart_hubs.layout_blocks IS 'Ordem dos blocos da página pública';

-- ---------------------------------------------------------------------------
-- Validação pré-publicação
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_smart_hub_for_publish(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  errors JSONB := '[]'::jsonb;
  warnings JSONB := '[]'::jsonb;
  visible_buttons INT := 0;
  slug_ok BOOLEAN;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'errors', jsonb_build_array(jsonb_build_object('code', 'hub_not_found', 'message', 'Hub não encontrado.')),
      'warnings', '[]'::jsonb
    );
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF coalesce(trim(hub_row.title), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'title_required', 'message', 'Informe o título do hub.')
    );
  END IF;

  IF coalesce(trim(hub_row.slug), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'slug_required', 'message', 'Informe o slug da URL pública.')
    );
  ELSE
    slug_ok := public.is_smart_hub_slug_available(hub_row.slug, hub_row.id);
    IF NOT slug_ok THEN
      errors := errors || jsonb_build_array(
        jsonb_build_object('code', 'slug_unavailable', 'message', 'Slug indisponível ou inválido.')
      );
    END IF;
  END IF;

  SELECT count(*)::INT INTO visible_buttons
  FROM public.smart_hub_buttons b
  WHERE b.hub_id = hub_row.id
    AND b.deleted_at IS NULL
    AND b.visible = true
    AND b.status = 'active';

  IF visible_buttons = 0 AND coalesce(trim(hub_row.whatsapp_number), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object(
        'code', 'conversion_required',
        'message', 'Cadastre ao menos um botão visível ou um WhatsApp para publicar.'
      )
    );
  END IF;

  IF coalesce(trim(hub_row.seo_title), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'seo_title_missing', 'message', 'SEO title recomendado para melhor indexação.')
    );
  END IF;

  IF coalesce(trim(hub_row.logo_url), '') = '' THEN
    warnings := warnings || jsonb_build_array(
      jsonb_build_object('code', 'logo_missing', 'message', 'Logo recomendado para reforçar a identidade da clínica.')
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(errors) = 0,
    'errors', errors,
    'warnings', warnings,
    'visible_buttons', visible_buttons
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_smart_hub_for_publish(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Publicar / Pausar
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  validation JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  validation := public.validate_smart_hub_for_publish(p_hub_id);

  UPDATE public.smart_hubs
  SET
    validation_errors = coalesce(validation->'errors', '[]'::jsonb),
    last_validated_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  IF NOT coalesce((validation->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'status', hub_row.status,
      'validation', validation
    );
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'published',
    published_at = now(),
    paused_at = NULL,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    status = 'published',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'published',
    'validation', validation
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pause_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF hub_row.status <> 'published' AND hub_row.status <> 'offline' THEN
    RAISE EXCEPTION 'Somente hubs publicados podem ser pausados';
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'offline',
    paused_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  RETURN jsonb_build_object('ok', true, 'status', 'offline');
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_smart_hub_to_draft(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.smart_hubs
  SET
    status = 'draft',
    paused_at = CASE WHEN hub_row.status = 'published' THEN now() ELSE hub_row.paused_at END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    status = 'draft',
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object('ok', true, 'status', 'draft');
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_smart_hub(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_smart_hub(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_smart_hub_to_draft(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Prévia autenticada (rascunho/offline inclusos) — isolamento por clinic_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_preview_smart_hub(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  result JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs h
  WHERE h.id = p_hub_id
    AND h.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'hub', to_jsonb(hub_row),
    'theme', (
      SELECT to_jsonb(t)
      FROM public.smart_hub_theme t
      WHERE t.hub_id = hub_row.id AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.order_index ASC, b.created_at ASC)
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT to_jsonb(p)
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb),
    'preview', true
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preview_smart_hub(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Aplicar template (atualiza layout_blocks + template_id no hub da clínica)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_smart_hub_template(p_hub_id UUID, p_template_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hub_row public.smart_hubs%ROWTYPE;
  tpl public.smart_hub_templates%ROWTYPE;
  blocks JSONB;
BEGIN
  SELECT * INTO hub_row
  FROM public.smart_hubs
  WHERE id = p_hub_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Hub não encontrado';
  END IF;

  IF NOT (
    public.is_superadmin(auth.uid())
    OR (
      public.user_belongs_to_clinic(hub_row.clinic_id)
      AND public.user_has_feature(auth.uid(), 'smart_hub')
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO tpl
  FROM public.smart_hub_templates
  WHERE id = p_template_id AND deleted_at IS NULL AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template não encontrado';
  END IF;

  blocks := coalesce(tpl.json_layout->'blocks', '["header","logo","description","buttons","footer"]'::jsonb);

  UPDATE public.smart_hubs
  SET
    template_id = tpl.id,
    layout_blocks = blocks,
    theme = coalesce(nullif(trim(hub_row.theme), ''), 'default'),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

  UPDATE public.smart_hub_pages
  SET
    layout_json = jsonb_build_object('version', 1, 'blocks', blocks, 'template_id', tpl.id),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE hub_id = p_hub_id
    AND deleted_at IS NULL
    AND is_home = true;

  RETURN jsonb_build_object(
    'ok', true,
    'template_id', tpl.id,
    'layout_blocks', blocks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_smart_hub_template(UUID, UUID) TO authenticated;
