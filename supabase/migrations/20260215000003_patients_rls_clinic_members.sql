-- Permite que membros da clinica (clinic_users) vejam/criem/editem/removam pacientes.
-- Isso evita bloqueio por user_has_feature('pacientes') quando a assinatura/feature nao esta sincronizada.

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients with feature or admin" ON public.patients;
DROP POLICY IF EXISTS "Users can update clinic patients with feature" ON public.patients;
DROP POLICY IF EXISTS "Users can delete clinic patients with feature" ON public.patients;

DROP POLICY IF EXISTS "Users can view clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can insert clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can update clinic patients" ON public.patients;
DROP POLICY IF EXISTS "Users can delete clinic patients" ON public.patients;

CREATE POLICY "Users can view clinic patients"
ON public.patients FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic patients"
ON public.patients FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic patients"
ON public.patients FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic patients"
ON public.patients FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

