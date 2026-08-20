-- ============================================================
-- PRODUÇÃO 13 — CONTAS A RECEBER
-- ============================================================
-- INSTRUÇÕES:
-- 1. No Supabase: SQL Editor > New query.
-- 2. Cole TODO este arquivo e clique em Run.
-- 3. Confirme as policies ao final.
--
-- Separado do Caixa (financial_transactions): aqui ficam valores
-- a receber (aberto / atrasado) até a baixa (que gera lançamento no caixa).

BEGIN;

CREATE TABLE IF NOT EXISTS public.accounts_receivable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'cancelled')),
  paid_at timestamptz,
  paid_amount numeric(12,2)
    CHECK (paid_amount IS NULL OR paid_amount >= 0),
  payment_method text,
  financial_transaction_id uuid
    REFERENCES public.financial_transactions(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounts_receivable_clinic
  ON public.accounts_receivable (clinic_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status
  ON public.accounts_receivable (clinic_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_patient
  ON public.accounts_receivable (patient_id);

DROP TRIGGER IF EXISTS accounts_receivable_updated_at ON public.accounts_receivable;
CREATE TRIGGER accounts_receivable_updated_at
  BEFORE UPDATE ON public.accounts_receivable
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.accounts_receivable ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic receivables" ON public.accounts_receivable;
DROP POLICY IF EXISTS "Users can insert clinic receivables" ON public.accounts_receivable;
DROP POLICY IF EXISTS "Users can update clinic receivables" ON public.accounts_receivable;
DROP POLICY IF EXISTS "Users can delete clinic receivables" ON public.accounts_receivable;

CREATE POLICY "Users can view clinic receivables"
  ON public.accounts_receivable FOR SELECT TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'contas_receber', 'can_view'));

CREATE POLICY "Users can insert clinic receivables"
  ON public.accounts_receivable FOR INSERT TO authenticated
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'contas_receber', 'can_create'));

CREATE POLICY "Users can update clinic receivables"
  ON public.accounts_receivable FOR UPDATE TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'contas_receber', 'can_edit'))
  WITH CHECK (public.user_can_clinic_action(clinic_id, 'contas_receber', 'can_edit'));

CREATE POLICY "Users can delete clinic receivables"
  ON public.accounts_receivable FOR DELETE TO authenticated
  USING (public.user_can_clinic_action(clinic_id, 'contas_receber', 'can_delete'));

-- Seed: admin com acesso a financeiro também recebe Contas a receber
INSERT INTO public.clinic_role_permissions (
  clinic_id, role, feature, can_view, can_create, can_edit, can_delete
)
SELECT
  p.clinic_id,
  p.role,
  'contas_receber',
  p.can_view,
  p.can_create,
  p.can_edit,
  p.can_delete
FROM public.clinic_role_permissions p
WHERE p.feature = 'financeiro'
  AND p.role = 'admin'
ON CONFLICT (clinic_id, role, feature) DO NOTHING;

-- Seed: papéis customizados com financeiro também recebem Contas a receber
INSERT INTO public.clinic_custom_role_permissions (
  clinic_custom_role_id, feature, can_view, can_create, can_edit, can_delete
)
SELECT
  p.clinic_custom_role_id,
  'contas_receber',
  p.can_view,
  p.can_create,
  p.can_edit,
  p.can_delete
FROM public.clinic_custom_role_permissions p
WHERE p.feature = 'financeiro'
ON CONFLICT (clinic_custom_role_id, feature) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO:
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'accounts_receivable'
ORDER BY policyname;
