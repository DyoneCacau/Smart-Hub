-- ============================================================
-- PRODUÇÃO 21 — CATÁLOGO DE MEDICAMENTOS DA CLÍNICA (RECEITUÁRIO)
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Confirme ao final que a consulta de verificação não retorna erro.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
-- Cria um catálogo de medicamentos POR CLÍNICA (a clínica cadastra os que
-- usa com frequência), com uma flag de "controle especial" (medicamentos
-- que exigem a Notificação de Receita / talão de controle especial da
-- ANVISA — Portaria 344/98). Ao selecionar um medicamento já marcado como
-- controlado no Receituário, o app já marca a flag automaticamente.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.clinic_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_controlled boolean NOT NULL DEFAULT false,
  default_posologia text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_medications_name
  ON public.clinic_medications (clinic_id, lower(trim(name)));
CREATE INDEX IF NOT EXISTS idx_clinic_medications_clinic_id
  ON public.clinic_medications (clinic_id);

DROP TRIGGER IF EXISTS clinic_medications_updated_at ON public.clinic_medications;
CREATE TRIGGER clinic_medications_updated_at
  BEFORE UPDATE ON public.clinic_medications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view medications" ON public.clinic_medications;
CREATE POLICY "Clinic members can view medications"
  ON public.clinic_medications
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
    )
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can create medications" ON public.clinic_medications;
CREATE POLICY "Clinic members can create medications"
  ON public.clinic_medications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clinic admins can update medications" ON public.clinic_medications;
CREATE POLICY "Clinic admins can update medications"
  ON public.clinic_medications
  FOR UPDATE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_admin(auth.uid())
      AND clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_admin(auth.uid())
      AND clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Clinic admins can delete medications" ON public.clinic_medications;
CREATE POLICY "Clinic admins can delete medications"
  ON public.clinic_medications
  FOR DELETE
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      public.is_admin(auth.uid())
      AND clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
      )
    )
  );

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clinic_medications'
ORDER BY ordinal_position;
