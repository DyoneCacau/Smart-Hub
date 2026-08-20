-- Permite que membros da clinica (clinic_users) vejam/criem/editem/removam agendamentos.
-- Isso evita bloqueio por user_has_feature('agenda') quando a assinatura/feature nao esta sincronizada.

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic appointments with feature" ON public.appointments;
DROP POLICY IF EXISTS "Users can insert clinic appointments with feature" ON public.appointments;
DROP POLICY IF EXISTS "Users can update clinic appointments with feature" ON public.appointments;
DROP POLICY IF EXISTS "Users can delete clinic appointments with feature" ON public.appointments;

DROP POLICY IF EXISTS "Users can view clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can insert clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update clinic appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can delete clinic appointments" ON public.appointments;

CREATE POLICY "Users can view clinic appointments"
ON public.appointments FOR SELECT
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can insert clinic appointments"
ON public.appointments FOR INSERT
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update clinic appointments"
ON public.appointments FOR UPDATE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
)
WITH CHECK (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete clinic appointments"
ON public.appointments FOR DELETE
USING (
  clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
);

