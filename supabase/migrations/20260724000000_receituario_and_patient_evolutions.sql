-- Receituário (tipo em clinic_documents) + Evoluções do paciente
-- Espelho versionado de supabase/PRODUCAO_11_RECEITUARIO_E_EVOLUCOES.sql

ALTER TABLE public.clinic_documents
  DROP CONSTRAINT IF EXISTS clinic_documents_type_check;

ALTER TABLE public.clinic_documents
  ADD CONSTRAINT clinic_documents_type_check
  CHECK (type IN ('atestado', 'declaracao', 'termo_ciencia', 'recibo', 'receituario', 'outro'));

CREATE TABLE IF NOT EXISTS public.patient_evolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  professional_name TEXT NOT NULL DEFAULT '',
  evolution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  content TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_evolutions_patient_id
  ON public.patient_evolutions(patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_evolutions_clinic_id
  ON public.patient_evolutions(clinic_id);

CREATE INDEX IF NOT EXISTS idx_patient_evolutions_date
  ON public.patient_evolutions(evolution_date DESC);

ALTER TABLE public.patient_evolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic patient evolutions" ON public.patient_evolutions;
DROP POLICY IF EXISTS "Users can insert clinic patient evolutions" ON public.patient_evolutions;
DROP POLICY IF EXISTS "Users can update clinic patient evolutions" ON public.patient_evolutions;
DROP POLICY IF EXISTS "Users can delete clinic patient evolutions" ON public.patient_evolutions;
DROP POLICY IF EXISTS "Superadmins can manage all patient evolutions" ON public.patient_evolutions;

CREATE POLICY "Users can view clinic patient evolutions"
ON public.patient_evolutions FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic patient evolutions"
ON public.patient_evolutions FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic patient evolutions"
ON public.patient_evolutions FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic patient evolutions"
ON public.patient_evolutions FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Superadmins can manage all patient evolutions"
ON public.patient_evolutions FOR ALL
USING (is_superadmin(auth.uid()));

DROP TRIGGER IF EXISTS update_patient_evolutions_updated_at ON public.patient_evolutions;
CREATE TRIGGER update_patient_evolutions_updated_at
  BEFORE UPDATE ON public.patient_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
