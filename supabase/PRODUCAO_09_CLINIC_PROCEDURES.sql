-- ============================================================
-- PRODUÇÃO 09 — CATÁLOGO DE PROCEDIMENTOS E PREÇOS
-- ============================================================
-- INSTRUÇÕES:
-- 1. Revise este arquivo antes de executar.
-- 2. No Supabase, abra SQL Editor > New query.
-- 3. Cole TODO o conteúdo deste arquivo e clique em Run.
-- 4. Confirme ao final que a consulta de verificação retorna linhas.
-- 5. Só depois publique o frontend que usa o catálogo.
--
-- Este script NÃO é executado automaticamente pelo deploy da Vercel.
-- Ele preserva appointments.procedure (texto) para compatibilidade.

BEGIN;

CREATE TABLE IF NOT EXISTS public.clinic_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Odontologia',
  description text,
  default_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (default_price >= 0),
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 5 AND 720),
  billing_unit text NOT NULL DEFAULT 'appointment'
    CHECK (billing_unit IN ('appointment', 'session', 'unit', 'ml', 'arch')),
  default_commission numeric(5,2)
    CHECK (default_commission IS NULL OR default_commission BETWEEN 0 AND 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clinic_procedures_name
  ON public.clinic_procedures (clinic_id, lower(trim(name)));
CREATE INDEX IF NOT EXISTS idx_clinic_procedures_clinic_id
  ON public.clinic_procedures (clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_procedures_active
  ON public.clinic_procedures (clinic_id, is_active);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS procedure_id uuid
    REFERENCES public.clinic_procedures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS procedure_price numeric(12,2)
    CHECK (procedure_price IS NULL OR procedure_price >= 0);

CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id
  ON public.appointments (procedure_id);

DROP TRIGGER IF EXISTS clinic_procedures_updated_at ON public.clinic_procedures;
CREATE TRIGGER clinic_procedures_updated_at
  BEFORE UPDATE ON public.clinic_procedures
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.clinic_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view procedures" ON public.clinic_procedures;
CREATE POLICY "Clinic members can view procedures"
  ON public.clinic_procedures
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT cu.clinic_id
      FROM public.clinic_users cu
      WHERE cu.user_id = auth.uid()
    )
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic admins can create procedures" ON public.clinic_procedures;
CREATE POLICY "Clinic admins can create procedures"
  ON public.clinic_procedures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR (
      public.is_admin(auth.uid())
      AND clinic_id IN (
        SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Clinic admins can update procedures" ON public.clinic_procedures;
CREATE POLICY "Clinic admins can update procedures"
  ON public.clinic_procedures
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

DROP POLICY IF EXISTS "Clinic admins can delete procedures" ON public.clinic_procedures;
CREATE POLICY "Clinic admins can delete procedures"
  ON public.clinic_procedures
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

-- Catálogo inicial para clínicas existentes. ON CONFLICT mantém
-- personalizações caso o script seja executado novamente.
INSERT INTO public.clinic_procedures (
  clinic_id, name, category, default_price, duration_minutes, billing_unit
)
SELECT c.id, seed.name, seed.category, seed.price, seed.duration, seed.unit
FROM public.clinics c
CROSS JOIN (
  VALUES
    ('Consulta', 'Odontologia', 150.00, 30, 'appointment'),
    ('Retorno', 'Odontologia', 0.00, 30, 'appointment'),
    ('Limpeza', 'Odontologia', 180.00, 45, 'appointment'),
    ('Clareamento', 'Odontologia', 650.00, 60, 'session'),
    ('Restauração', 'Odontologia', 250.00, 60, 'unit'),
    ('Extração', 'Odontologia', 350.00, 60, 'unit'),
    ('Canal', 'Odontologia', 900.00, 90, 'unit'),
    ('Implante', 'Odontologia', 2500.00, 90, 'unit'),
    ('Prótese', 'Odontologia', 1800.00, 60, 'unit'),
    ('Ortodontia', 'Odontologia', 250.00, 45, 'appointment'),
    ('Harmonização', 'Estética', 900.00, 60, 'session'),
    ('Toxina Botulínica', 'Estética', 900.00, 45, 'session'),
    ('Preenchimento Labial', 'Estética', 1200.00, 60, 'session'),
    ('Bioestimulador de Colágeno', 'Estética', 1500.00, 60, 'session'),
    ('Facetas', 'Estética', 1200.00, 90, 'unit'),
    ('Lente de contato', 'Estética', 1500.00, 90, 'unit')
) AS seed(name, category, price, duration, unit)
ON CONFLICT (clinic_id, lower(trim(name))) DO NOTHING;

COMMIT;

-- VERIFICAÇÃO (somente leitura):
SELECT
  c.name AS clinica,
  count(cp.id) AS procedimentos,
  count(cp.id) FILTER (WHERE cp.is_active) AS ativos
FROM public.clinics c
LEFT JOIN public.clinic_procedures cp ON cp.clinic_id = c.id
GROUP BY c.id, c.name
ORDER BY c.name;
