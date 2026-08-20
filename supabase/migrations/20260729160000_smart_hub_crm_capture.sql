-- ============================================================================
-- HEALTHCARE SMART HUB — Fase 3 (captação + CRM)
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Pré-requisitos: PRODUCAO_14 (CRM), PRODUCAO_26 (leads API), PRODUCAO_31 (Smart Hub visual)
-- 2. Execute no SQL Editor do Supabase (Dashboard > SQL Editor > New query)
-- 3. Adiciona capture_config, click_action, atividades de lead, origem smart_hub
-- 4. Idempotente sempre que possível
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Origem smart_hub em crm_leads.lead_source
-- ---------------------------------------------------------------------------

ALTER TABLE public.crm_leads DROP CONSTRAINT IF EXISTS crm_leads_lead_source_check;
ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_lead_source_check
  CHECK (
    lead_source IS NULL
    OR lead_source IN (
      'instagram', 'whatsapp', 'facebook', 'referral',
      'paid_traffic', 'other', 'smart_hub'
    )
  );

-- ---------------------------------------------------------------------------
-- Configuração de fluxo do CRM (etapas de avanço) por clínica
-- ---------------------------------------------------------------------------

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS crm_workflow JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clinics.crm_workflow IS
  'Mapeamento de etapas do Kanban: initial_stage, after_contact_stage, after_schedule_stage, won_stage, lost_stage, whatsapp_message_template';

-- ---------------------------------------------------------------------------
-- Captação no Smart Hub
-- ---------------------------------------------------------------------------

ALTER TABLE public.smart_hubs
  ADD COLUMN IF NOT EXISTS capture_config JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.smart_hubs.capture_config IS
  'Configuração de captação: modo padrão, formulário, destino CRM, WhatsApp';

ALTER TABLE public.smart_hub_buttons
  ADD COLUMN IF NOT EXISTS click_action TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS capture_config JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_hub_buttons_click_action_check'
  ) THEN
    ALTER TABLE public.smart_hub_buttons
      ADD CONSTRAINT smart_hub_buttons_click_action_check
      CHECK (click_action IN (
        'auto', 'form', 'whatsapp', 'link', 'phone', 'email', 'map', 'info'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.smart_hub_buttons.click_action IS
  'Ação ao clicar: auto (deriva do type) | form | whatsapp | link | phone | email | map | info';
COMMENT ON COLUMN public.smart_hub_buttons.capture_config IS
  'Overrides de captação por botão (pipeline/stage, responsável, mensagem WhatsApp, etc.)';

-- ---------------------------------------------------------------------------
-- Histórico de atividades do lead
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT,
  result TEXT,
  origin TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_lead_created
  ON public.crm_lead_activities(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_lead_activities_clinic_created
  ON public.crm_lead_activities(clinic_id, created_at DESC);

ALTER TABLE public.crm_lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members view lead activities" ON public.crm_lead_activities;
CREATE POLICY "Clinic members view lead activities"
ON public.crm_lead_activities FOR SELECT TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_belongs_to_clinic(clinic_id)
);

DROP POLICY IF EXISTS "Clinic members insert lead activities" ON public.crm_lead_activities;
CREATE POLICY "Clinic members insert lead activities"
ON public.crm_lead_activities FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.user_belongs_to_clinic(clinic_id)
);

DROP POLICY IF EXISTS "Clinic members update lead activities" ON public.crm_lead_activities;
CREATE POLICY "Clinic members update lead activities"
ON public.crm_lead_activities FOR UPDATE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_belongs_to_clinic(clinic_id)
)
WITH CHECK (
  public.is_superadmin(auth.uid())
  OR public.user_belongs_to_clinic(clinic_id)
);

DROP POLICY IF EXISTS "Clinic members delete lead activities" ON public.crm_lead_activities;
CREATE POLICY "Clinic members delete lead activities"
ON public.crm_lead_activities FOR DELETE TO authenticated
USING (
  public.is_superadmin(auth.uid())
  OR public.user_belongs_to_clinic(clinic_id)
);

-- ---------------------------------------------------------------------------
-- Notificar usuários do CRM sobre novo lead (service_role / SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_clinic_crm_users(
  p_clinic_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_owner_user_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  IF p_clinic_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_owner_user_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, clinic_id, type, title, message, reference_id)
    VALUES (p_owner_user_id, p_clinic_id, 'crm_lead', p_title, p_message, p_reference_id);
    RETURN 1;
  END IF;

  INSERT INTO public.user_notifications (user_id, clinic_id, type, title, message, reference_id)
  SELECT cu.user_id, p_clinic_id, 'crm_lead', p_title, p_message, p_reference_id
  FROM public.clinic_users cu
  WHERE cu.clinic_id = p_clinic_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
EXCEPTION
  WHEN OTHERS THEN
    -- Notificação é best-effort
    RETURN 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_clinic_crm_users(UUID, TEXT, TEXT, UUID, UUID)
  TO service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: inserir atividade de lead (autenticado ou service)
-- ---------------------------------------------------------------------------

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
    RAISE EXCEPTION 'Lead não encontrado';
  END IF;

  -- Usuário autenticado precisa pertencer à clínica
  IF auth.uid() IS NOT NULL
     AND NOT public.is_superadmin(auth.uid())
     AND NOT public.user_belongs_to_clinic(v_clinic_id) THEN
    RAISE EXCEPTION 'Sem permissão';
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_crm_lead_activity(UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.add_crm_lead_activity IS
  'Registra atividade no histórico do lead (CRM). Sem conteúdo de conversas WhatsApp.';
