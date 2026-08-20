-- Profissionais ↔ procedimentos (booking público).
-- Idempotente. Ver PRODUCAO_39_PROFESSIONAL_PROCEDURES.sql (execução manual).

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS performs_all_procedures boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.professionals.performs_all_procedures IS
  'Quando true, o profissional é elegível a todos os procedimentos ativos da clínica. Quando false, apenas os vínculos em professional_procedures.';

CREATE TABLE IF NOT EXISTS public.professional_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES public.clinic_procedures(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, procedure_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_procedures_clinic
  ON public.professional_procedures (clinic_id);

CREATE INDEX IF NOT EXISTS idx_professional_procedures_professional
  ON public.professional_procedures (professional_id);

CREATE INDEX IF NOT EXISTS idx_professional_procedures_procedure
  ON public.professional_procedures (procedure_id);

COMMENT ON TABLE public.professional_procedures IS
  'Procedimentos específicos que o profissional realiza quando performs_all_procedures = false.';

CREATE OR REPLACE FUNCTION public.enforce_professional_procedure_same_clinic()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prof_clinic uuid;
  v_proc_clinic uuid;
BEGIN
  SELECT clinic_id INTO v_prof_clinic
  FROM public.professionals
  WHERE id = NEW.professional_id;

  SELECT clinic_id INTO v_proc_clinic
  FROM public.clinic_procedures
  WHERE id = NEW.procedure_id;

  IF v_prof_clinic IS NULL OR v_proc_clinic IS NULL THEN
    RAISE EXCEPTION 'Profissional ou procedimento inválido para vínculo';
  END IF;

  IF NEW.clinic_id IS DISTINCT FROM v_prof_clinic
     OR NEW.clinic_id IS DISTINCT FROM v_proc_clinic THEN
    RAISE EXCEPTION 'Profissional e procedimento devem pertencer à mesma clínica';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_procedures_same_clinic
  ON public.professional_procedures;

CREATE TRIGGER trg_professional_procedures_same_clinic
  BEFORE INSERT OR UPDATE ON public.professional_procedures
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_professional_procedure_same_clinic();

ALTER TABLE public.professional_procedures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clinic members can view professional procedures"
  ON public.professional_procedures;
CREATE POLICY "Clinic members can view professional procedures"
  ON public.professional_procedures
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
    OR public.is_superadmin(auth.uid())
  );

DROP POLICY IF EXISTS "Clinic members can manage professional procedures"
  ON public.professional_procedures;
CREATE POLICY "Clinic members can manage professional procedures"
  ON public.professional_procedures
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  )
  WITH CHECK (
    public.is_superadmin(auth.uid())
    OR clinic_id IN (SELECT cu.clinic_id FROM public.clinic_users cu WHERE cu.user_id = auth.uid())
  );
