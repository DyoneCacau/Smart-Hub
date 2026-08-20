-- Add clinic_id to professionals to enforce tenant isolation
ALTER TABLE public.professionals
ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE;

UPDATE public.professionals p
SET clinic_id = cu.clinic_id
FROM public.clinic_users cu
WHERE p.user_id = cu.user_id
  AND p.clinic_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_clinic_id ON public.professionals (clinic_id);

-- Update RLS policies to scope professionals by clinic
DROP POLICY IF EXISTS "Everyone can view active professionals" ON public.professionals;
DROP POLICY IF EXISTS "Admins can insert professionals with feature check" ON public.professionals;
DROP POLICY IF EXISTS "Admins can update professionals with feature check" ON public.professionals;
DROP POLICY IF EXISTS "Admins can delete professionals with feature check" ON public.professionals;

CREATE POLICY "Users can view clinic professionals"
ON public.professionals
FOR SELECT
USING (
  public.is_superadmin(auth.uid())
  OR (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
    AND (is_active = true OR public.is_admin(auth.uid()))
  )
);

CREATE POLICY "Admins can insert professionals with feature check"
ON public.professionals
FOR INSERT
WITH CHECK (
  (
    public.is_superadmin(auth.uid())
    OR (
      public.is_admin(auth.uid())
      AND public.user_has_feature(auth.uid(), 'profissionais')
      AND clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "Admins can update professionals with feature check"
ON public.professionals
FOR UPDATE
USING (
  public.is_superadmin(auth.uid())
  OR (
    public.is_admin(auth.uid())
    AND public.user_has_feature(auth.uid(), 'profissionais')
    AND clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Admins can delete professionals with feature check"
ON public.professionals
FOR DELETE
USING (
  public.is_superadmin(auth.uid())
  OR (
    public.is_admin(auth.uid())
    AND public.user_has_feature(auth.uid(), 'profissionais')
    AND clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid())
  )
);
