-- ============================================================================
-- HEALTHCARE SMART HUB — captura: atividade best-effort
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisito: PRODUCAO_32 (ou migration 20260729160000) já aplicada
-- 2. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 3. Torna add_crm_lead_activity tolerante a falhas (não derruba a Edge Function)
-- 4. A correção principal do formulário público está no redeploy de smart-hub-capture
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_crm_lead_activity(
  p_lead_id UUID,
  p_activity_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_result TEXT DEFAULT NULL,
  p_origin TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id UUID;
  v_id UUID;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.crm_leads
  WHERE id = p_lead_id;

  IF v_clinic_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid())
     AND NOT public.user_belongs_to_clinic(v_clinic_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.crm_lead_activities (
    clinic_id, lead_id, activity_type, description, result, origin, metadata, created_by
  ) VALUES (
    v_clinic_id,
    p_lead_id,
    COALESCE(NULLIF(trim(p_activity_type), ''), 'note'),
    LEFT(COALESCE(p_description, ''), 2000),
    NULLIF(trim(COALESCE(p_result, '')), ''),
    NULLIF(trim(COALESCE(p_origin, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Atividade é secundária: nunca deve impedir a criação do lead
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_crm_lead_activity(UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.add_crm_lead_activity IS
  'Registra atividade no histórico do lead (CRM). Best-effort: falhas retornam NULL.';
