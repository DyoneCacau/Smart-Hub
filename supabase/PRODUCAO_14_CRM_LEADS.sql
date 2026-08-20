-- ============================================================
-- PRODUÇÃO 14 — CRM DE VENDAS (LEADS)
-- ============================================================
-- INSTRUÇÕES:
-- 1. No Supabase: SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
-- 3. Confirme as policies ao final.
--
-- MVP estilo "CRM de Vendas": pipeline (Novo → Contato → Agendado →
-- Fechado / Perdido), origem do lead, responsável e próximo follow-up.
-- Este script NÃO sobe com o deploy da Vercel.

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  stage text NOT NULL DEFAULT 'new'
    CHECK (stage IN ('new', 'contact', 'scheduled', 'won', 'lost')),
  lead_source text
    CHECK (
      lead_source IS NULL
      OR lead_source IN ('instagram', 'whatsapp', 'referral', 'paid_traffic', 'other')
    ),
  referral_name text,
  interest text,
  estimated_value numeric(12,2)
    CHECK (estimated_value IS NULL OR estimated_value >= 0),
  next_follow_up date,
  notes text,
  owner_user_id uuid,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  lost_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_stage
  ON public.crm_leads (clinic_id, stage, next_follow_up);
CREATE INDEX IF NOT EXISTS idx_crm_leads_clinic_owner
  ON public.crm_leads (clinic_id, owner_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_patient
  ON public.crm_leads (patient_id);

DROP TRIGGER IF EXISTS crm_leads_updated_at ON public.crm_leads;
CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic crm leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Users can insert clinic crm leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Users can update clinic crm leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Users can delete clinic crm leads" ON public.crm_leads;

CREATE POLICY "Users can view clinic crm leads"
  ON public.crm_leads FOR SELECT TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'crm', 'can_view'));

CREATE POLICY "Users can insert clinic crm leads"
  ON public.crm_leads FOR INSERT TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'crm', 'can_create'));

CREATE POLICY "Users can update clinic crm leads"
  ON public.crm_leads FOR UPDATE TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'crm', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'crm', 'can_edit'));

CREATE POLICY "Users can delete clinic crm leads"
  ON public.crm_leads FOR DELETE TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'crm', 'can_delete'));

-- Seed: admin com acesso a comissões/pacientes também recebe CRM
INSERT INTO public.clinic_role_permissions (
  clinic_id, role, feature, can_view, can_create, can_edit, can_delete
)
SELECT
  p.clinic_id,
  p.role,
  'crm',
  true,
  true,
  true,
  true
FROM public.clinic_role_permissions p
WHERE p.feature = 'pacientes'
  AND p.role = 'admin'
  AND p.can_view = true
ON CONFLICT (clinic_id, role, feature) DO NOTHING;

-- Seed: vendedor e recepcionista com ver/criar/editar CRM (sem excluir)
INSERT INTO public.clinic_role_permissions (
  clinic_id, role, feature, can_view, can_create, can_edit, can_delete
)
SELECT DISTINCT
  cu.clinic_id,
  r.role::text,
  'crm',
  true,
  true,
  true,
  false
FROM public.clinic_users cu
CROSS JOIN (VALUES ('seller'), ('receptionist')) AS r(role)
ON CONFLICT (clinic_id, role, feature) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO:
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'crm_leads'
ORDER BY policyname;
