-- ============================================================================
-- HEALTHCARE SMART HUB — hotfix Prévia + Validação
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisito: PRODUCAO_29 / 20260728220000_smart_hub_fase2.sql já aplicada
-- 2. Execute no SQL Editor do Supabase
-- 3. Corrige validate_smart_hub_for_publish (persiste resultado + exige template)
--    e reforça get_preview_smart_hub (botões draft/visíveis/ativos)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Validação: persiste last_validated_at + validation_errors; exige template
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_smart_hub_for_publish(p_hub_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
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
      'warnings', '[]'::jsonb,
      'visible_buttons', 0
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
      jsonb_build_object('code', 'title_required', 'message', 'Informe o nome público do hub.')
    );
  END IF;

  IF coalesce(trim(hub_row.slug), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'slug_required', 'message', 'Informe um slug válido.')
    );
  ELSE
    slug_ok := public.is_smart_hub_slug_available(hub_row.slug, hub_row.id);
    IF NOT slug_ok THEN
      errors := errors || jsonb_build_array(
        jsonb_build_object('code', 'slug_unavailable', 'message', 'Slug indisponível ou inválido.')
      );
    END IF;
  END IF;

  IF hub_row.template_id IS NULL THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object('code', 'template_required', 'message', 'Escolha e aplique um template.')
    );
  END IF;

  SELECT count(*)::INT INTO visible_buttons
  FROM public.smart_hub_buttons b
  WHERE b.hub_id = hub_row.id
    AND b.clinic_id = hub_row.clinic_id
    AND b.deleted_at IS NULL
    AND b.visible = true
    AND b.status = 'active';

  IF visible_buttons = 0 AND coalesce(trim(hub_row.whatsapp_number), '') = '' THEN
    errors := errors || jsonb_build_array(
      jsonb_build_object(
        'code', 'conversion_required',
        'message', 'Adicione pelo menos um botão visível (ou informe um WhatsApp nas configurações).'
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

  -- Persiste resultado da validação (necessário para o fluxo visual)
  UPDATE public.smart_hubs
  SET
    validation_errors = errors,
    last_validated_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_hub_id;

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
-- Prévia: garante botões do hub (draft incluso), clinic_id e ordenação
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
      WHERE t.hub_id = hub_row.id
        AND t.clinic_id = hub_row.clinic_id
        AND t.deleted_at IS NULL
      LIMIT 1
    ),
    'buttons', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.order_index ASC, b.created_at ASC)
      FROM public.smart_hub_buttons b
      WHERE b.hub_id = hub_row.id
        AND b.clinic_id = hub_row.clinic_id
        AND b.deleted_at IS NULL
        AND b.visible = true
        AND b.status = 'active'
    ), '[]'::jsonb),
    'page', (
      SELECT to_jsonb(p)
      FROM public.smart_hub_pages p
      WHERE p.hub_id = hub_row.id
        AND p.clinic_id = hub_row.clinic_id
        AND p.deleted_at IS NULL
        AND p.is_home = true
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    'assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC)
      FROM public.smart_hub_assets a
      WHERE a.hub_id = hub_row.id
        AND a.clinic_id = hub_row.clinic_id
        AND a.deleted_at IS NULL
        AND a.status = 'active'
    ), '[]'::jsonb),
    'preview', true
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preview_smart_hub(UUID) TO authenticated;
