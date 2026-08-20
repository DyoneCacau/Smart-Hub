-- Módulos personalizados que o admin pode adicionar (aparecem como linhas na matriz de permissões)
CREATE TABLE IF NOT EXISTS public.clinic_custom_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

CREATE INDEX IF NOT EXISTS idx_clinic_custom_features_clinic ON public.clinic_custom_features(clinic_id);

ALTER TABLE public.clinic_custom_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinic admins manage custom features"
  ON public.clinic_custom_features FOR ALL
  USING (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT cu.clinic_id FROM public.clinic_users cu
      JOIN public.user_roles ur ON ur.user_id = cu.user_id
      WHERE cu.user_id = auth.uid() AND ur.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Superadmin clinic_custom_features"
  ON public.clinic_custom_features FOR ALL USING (public.is_superadmin(auth.uid()));
